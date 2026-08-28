import { Capacitor } from "@capacitor/core"
import {
  createNeedleSession,
  type CreateNeedleOptions,
  type NeedleSession,
} from "@repo/needle"
import { otaOrigin } from "@/lib/ota"

/**
 * The app's one Needle 2 session.
 *
 * `@repo/needle` knows nothing about this app; this file is where it is told
 * where the engine lives and what today's date is. Everything else — tools,
 * thresholds, loops — belongs to whichever screen is asking, because a toolbox
 * shared across screens is a grammar the model has to guess its way through.
 */

/**
 * Where `needle.js`, `needle.wasm` and `needle2.cact` are served from.
 *
 * Read on the web and, in practice, nowhere else: the native archives link the
 * `.cact` in as `needle_weights`, so an iPhone already has the model before it
 * has a network. This still answers correctly for native because a build
 * running tuned weights would fetch them, and because the answer has to be an
 * absolute origin when it does — the assets live outside the OTA bundle, and a
 * root-relative path resolves inside whichever bundle Capgo installed last, so
 * it 404s after the first update. The same rule, for the same reason, as
 * `modelBase` in `onnx-runtime.ts`.
 *
 * On the web it must not be. The same origin already serves `public/needle`
 * under Vite and from the Pages deploy, and pointing the browser at production
 * instead fails in the least helpful way available: Pages answers an unknown
 * path with the SPA shell, so the fetch succeeds with a 200 and the runtime
 * reports a wasm compile error for what is really an HTML page.
 */
export function needleBase() {
  return Capacitor.isNativePlatform() ? `${otaOrigin()}/needle` : "/needle"
}

/**
 * Environment facts for the system turn — facts, never instructions.
 *
 * The model resolves "tomorrow at seven" against `date:` and passes the human
 * phrase through verbatim when nothing licenses the resolution, which is the
 * entire reason this is not hard-coded to a build-time constant. Anything
 * written here that reads as an order is simply ignored, so there is no prompt
 * to tune and nothing to leak.
 */
export function needleFacts(now = new Date()) {
  const day = now.toDateString().slice(0, 3)
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return [
    `date: ${date} ${day} ${time}`,
    `locale: ${navigator.language}`,
    `device: ${Capacitor.isNativePlatform() ? "phone" : "desktop"}`,
    "assistant: OneRep",
  ].join("; ")
}

let pending: Promise<NeedleSession> | null = null

/**
 * The session, created once and reused.
 *
 * Held as the promise rather than the value so that two screens mounting in the
 * same frame share one 14 MB download instead of racing to start two. There is
 * only one engine in the process regardless — the C API is four free functions
 * over a global — so a second session would not be a second model, it would be
 * two callers corrupting one KV cache.
 */
/**
 * The weights this app runs on.
 *
 * Not the stock `needle2.cact` the package defaults to: this is the base with
 * the OneRep LoRA merged in, trained on the tool schemas in
 * scripts/needle2-finetune/schema.json. It reads portions and meals out of
 * ordinary sentences the base refuses — "half a chicken breast" becomes
 * `chicken breast, 50 g` rather than a catalogue lookup for a food of that
 * name, and "three eggs for breakfast" becomes a call at all.
 *
 * It is also less calibrated than the base and will occasionally produce a
 * confident call for a sentence that asked for nothing. `minConfidence` below
 * is the only thing standing between that and the diary, so raising the floor
 * is the lever if it starts writing things nobody asked for.
 *
 * Native reads this over the network like the web does — the linked-in weights
 * are the stock ones — which is why `needleBase()` has to be absolute there.
 */
const TUNED_WEIGHTS = "needle2-onerep.cact"

export function needle(options: CreateNeedleOptions = {}) {
  pending ??= createNeedleSession({
    baseUrl: needleBase(),
    weights: { url: `${needleBase()}/${TUNED_WEIGHTS}` },
    system: needleFacts(),
    // Escalate rather than act. The calibration holds that both the confidence
    // head and the decode probability have to agree, so the failure mode below
    // this line is "ask again", not "log the wrong meal".
    //
    // 0.4 rather than 0.6 because the tuned weights sit 20-25 points lower
    // than the stock ones on the same sentences — at 0.6 they refused work
    // they had got right. The cost is known and specific: "I skipped lunch
    // today" decodes as `log_food{greek yoghurt, lunch}` at 0.47, which used
    // to be refused and now is not. Negation is the shape to watch.
    minConfidence: 0.4,
    ...options,
  })
  return pending
}

/**
 * Pay the setup cost now.
 *
 * Call it when a screen that will want the model comes into view, not when the
 * user has already typed. On the web and on a cold cache that is a 14 MB
 * download; on a phone the weights are already linked in, so it is the tool
 * grammar and the first prefill, which is small but not free.
 */
export async function warmNeedle() {
  const session = await needle()
  await session.prepare()
  return session
}

/** Tests and the settings screen's "forget the model" button. */
export async function disposeNeedle() {
  const session = await pending
  pending = null
  await session?.dispose()
}
