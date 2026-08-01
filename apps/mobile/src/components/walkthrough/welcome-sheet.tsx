import {
  Barbell,
  ChartLine,
  ForkKnife,
  House,
  RocketLaunch,
} from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"

/** Mirrors TABS in bottom-bar.tsx, with a line on what each area is for. */
const MAP = [
  { Icon: House, label: "Today", detail: "Your day at a glance" },
  { Icon: ForkKnife, label: "Nutrition", detail: "Log food, water, and fasts" },
  { Icon: Barbell, label: "Training", detail: "Workouts and routines" },
  {
    Icon: ChartLine,
    label: "Progress",
    detail: "Weight, measurements, trends",
  },
  { Icon: RocketLaunch, label: "Coach", detail: "Your plan and guidance" },
] as const

export function WelcomeSheet({
  onStart,
  onSkip,
}: {
  onStart: () => void
  onSkip: () => void
}) {
  return (
    <MobileSheet
      ariaLabel="Welcome to OneRep"
      onClose={onSkip}
      closeOnBackdrop={false}
      defaultHeight={0.72}
    >
      <div className="px-5 pt-1 pb-[var(--app-safe-bottom-lg)]">
        <h2 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">
          Here's your map
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
          Five places to know. We'll point things out as you go.
        </p>

        <ul className="mt-5 grid gap-1">
          {MAP.map(({ Icon, label, detail }) => (
            <li key={label} className="flex items-center gap-3 py-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] border border-border bg-[var(--surface-raised)]">
                <Icon size={18} weight="bold" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="block text-[13px] leading-5 text-muted-foreground">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
          Each area has more inside: recipes, meal prep, fasting, grocery lists
          and more. We'll show you where.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="native-primary-button mt-5 min-h-13 w-full rounded-[0.8rem] transition-[opacity,transform] active:scale-[0.99]"
        >
          Start with Today
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 min-h-11 w-full text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:opacity-60"
        >
          I'll explore on my own
        </button>
      </div>
    </MobileSheet>
  )
}
