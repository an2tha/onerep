import { toast } from "@repo/ui"
import { tr } from "@repo/ui/i18n"
import { logDevWarn } from "./utils"

/**
 * The one field this helper has to see. Everything else on the entry — macros,
 * Open Food Facts metadata, recipe drafts — is carried through untouched, so
 * the helper takes the caller's own entry type rather than restating it.
 */
type EntryWithWater = { hydrationMl?: number }

export type FoodLogAddArgs<Entry extends EntryWithWater> = {
  date: string
  entry: Entry
}

/**
 * Whether this session has already explained the missing water.
 *
 * Once per launch, not once per drink: someone who counts every coffee would
 * otherwise be told the same thing six times before lunch, and a notice that
 * arrives with every save stops being read. The meal still saves either way —
 * this only decides whether the app says so out loud.
 */
let waterSkipNoticeShown = false

/** Claims the one notice a session gets. True the first time it is asked. */
export function claimWaterSkipNotice(): boolean {
  if (waterSkipNoticeShown) return false
  waterSkipNoticeShown = true
  return true
}

/** Tests only: a fresh launch shows the notice again. */
export function resetWaterSkipNoticeForTests() {
  waterSkipNoticeShown = false
}

/**
 * Saves a diary entry, falling back to a server that predates the drink's water.
 *
 * `hydrationMl` travels on the entry itself, so a build that counts a drink
 * sends a field an older backend's validator does not list. Convex refuses the
 * whole record for that extra field and, because production redacts the reason
 * to "Server Error", the client cannot tell that refusal apart from any other.
 * Doing the retry here keeps the meal, which is the part the user cannot
 * reconstruct from anywhere else; the water is the part that can be counted
 * again the next time the drink is logged once the server knows the field.
 *
 * Both attempts carry the same entry id, and `addEntry` replaces a row with
 * that id, so a first attempt the server did commit is never duplicated.
 */
export async function saveFoodLogEntry<Entry extends EntryWithWater>(
  addEntry: (args: FoodLogAddArgs<Entry>) => Promise<unknown>,
  args: FoodLogAddArgs<Entry>
): Promise<{ waterSkipped: boolean }> {
  const waterMl = args.entry.hydrationMl
  if (!(typeof waterMl === "number" && waterMl > 0)) {
    await addEntry(args)
    return { waterSkipped: false }
  }

  try {
    await addEntry(args)
    return { waterSkipped: false }
  } catch (error) {
    const { hydrationMl: _droppedWater, ...entry } = args.entry
    try {
      // The same record without its water is a valid entry on either server:
      // the field is optional in the current validator, and absent on an older
      // one is exactly what it expects.
      await addEntry({ date: args.date, entry } as FoodLogAddArgs<Entry>)
    } catch {
      // The second attempt failed for a reason that has nothing to do with the
      // water field, so the original error is the honest one to report.
      throw error
    }
    logDevWarn(
      "Saved the food without its drink water: this server does not know hydrationMl yet",
      error
    )
    // Silence here is how a drink ends up counted in the diary and not in the
    // day's water with nothing saying why. Said once, then never again this
    // session — the meal is safe, which is the part that matters.
    if (claimWaterSkipNotice()) {
      toast.message(
        tr("Saved without the drink's water — this server cannot store it yet")
      )
    }
    return { waterSkipped: true }
  }
}
