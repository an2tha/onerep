import {
  CaretRight,
  Coffee,
  ForkKnife,
  Lightning,
  Pill,
  Plus,
} from "@phosphor-icons/react"
import { Card, CardTitle } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { useSmoothNavigate } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import {
  SUPPLEMENT_DEFINITIONS,
  SUPPLEMENT_LIST,
  completedSupplementCount,
  formatSupplementAmount,
  supplementTotals,
  type SupplementKind,
  type SupplementLogEntry,
} from "@/lib/supplements"

const SUPPLEMENT_ICON = {
  creatine: Lightning,
  protein: ForkKnife,
  vitamins: Pill,
  caffeine: Coffee,
} as const

/** Four supplements, each one tap from its usual dose. */
export function SupplementWidget({
  dateKey,
  entries,
}: {
  dateKey: string
  entries: SupplementLogEntry[]
}) {
  const navigate = useSmoothNavigate()
  const addSupplement = useOfflineMutation(
    api.logs.supplements.addEntry,
    "logs.supplements.addEntry"
  )
  const totals = supplementTotals(entries)
  const doneCount = completedSupplementCount(entries)

  function quickAdd(kind: SupplementKind) {
    const definition = SUPPLEMENT_DEFINITIONS[kind]
    void addSupplement({
      date: dateKey,
      entry: {
        id: crypto.randomUUID(),
        kind,
        amount: definition.defaultAmount,
        unit: definition.unit,
        loggedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <Card>
      <div className="px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm font-semibold">Supplements</CardTitle>
            <span className="text-[10px] text-muted-foreground/35 tabular-nums">
              {doneCount}/{SUPPLEMENT_LIST.length}
            </span>
          </div>
          <button
            onClick={() => navigate("/supplements")}
            className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted-foreground/45 active:bg-muted/45 active:text-muted-foreground/70"
          >
            Open
            <CaretRight size={10} weight="bold" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SUPPLEMENT_LIST.map((definition) => {
            const Icon = SUPPLEMENT_ICON[definition.kind]
            const total = totals[definition.kind]
            const done = total > 0
            return (
              <button
                key={definition.kind}
                type="button"
                onClick={() => quickAdd(definition.kind)}
                className={cn(
                  "flex min-h-[58px] items-center gap-2 rounded-xl px-3 py-2 text-left transition-transform active:scale-[0.985]",
                  done ? "bg-foreground/[0.055]" : "bg-muted/28"
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: definition.bg,
                    color: definition.color,
                  }}
                >
                  <Icon size={15} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">
                    {definition.shortLabel}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground/45 tabular-nums">
                    {done
                      ? formatSupplementAmount(total, definition.unit)
                      : formatSupplementAmount(
                          definition.defaultAmount,
                          definition.unit
                        )}
                  </span>
                </span>
                <Plus size={11} className="shrink-0 text-muted-foreground/25" />
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/** The half-width supplement tile: how many taken, and the caffeine number. */
export function SupplementsSmall({
  entries,
  onOpen,
}: {
  entries: SupplementLogEntry[]
  onOpen: () => void
}) {
  const doneCount = completedSupplementCount(entries)
  const totals = supplementTotals(entries)

  return (
    <Card className="dashboard-tile h-full">
      <button
        onClick={onOpen}
        className="flex h-full w-full flex-col justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="flex w-full items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Supplements
          </p>
          <Pill
            size={14}
            weight="bold"
            className="mt-0.5 text-[var(--accent-supplement)]"
          />
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {doneCount}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">
              /{SUPPLEMENT_LIST.length}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/35">
            {formatSupplementAmount(totals.caffeine, "mg")} caffeine
          </p>
        </div>
      </button>
    </Card>
  )
}
