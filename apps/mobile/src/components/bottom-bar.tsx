import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router"
import {
  Barbell,
  ChartLine,
  ForkKnife,
  House,
  ListChecks,
  PintGlass,
  Plus,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"

const TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/foods", Icon: ForkKnife, label: "Food" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/foods", Icon: ForkKnife, label: "Food" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/water", Icon: PintGlass, label: "Water" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/exercises", Icon: ListChecks, label: "Exercises" },
] as const

function isActive(pathname: string, path: string) {
  return path === "/"
    ? pathname === "/"
    : pathname === path || pathname.startsWith(`${path}/`)
}

export function BottomBar({ onAdd }: { onAdd?: () => void }) {
  const navigate = useSmoothNavigate()
  const { pathname } = useLocation()

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const activeIdx = TABS.findIndex((t) => isActive(pathname, t.path))
  const showQuickAdd =
    pathname === "/" ||
    pathname.startsWith("/foods") ||
    pathname.startsWith("/workouts") ||
    pathname.startsWith("/workout")

  // useEffect (post-paint) so the browser renders the old pill position first,
  // giving the CSS transition a start value to animate from.
  // offsetLeft / offsetWidth are already relative to the positioned container —
  // no getBoundingClientRect viewport offset needed.
  useEffect(() => {
    if (activeIdx < 0) return
    const el = tabRefs.current[activeIdx]
    if (!el) return
    setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [pathname, activeIdx])

  return (
    <>
      <div className="fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center md:hidden">
        {/* position:relative so offsetLeft on buttons is relative to this element */}
        <div className="relative flex items-center gap-0.5 rounded-full border border-border/50 bg-background/75 px-1.5 py-1.5 shadow-lg shadow-black/[0.06] backdrop-blur-xl">
          {/* Sliding pill — always in DOM so the CSS transition has a start value */}
          <div
            className="absolute top-1.5 h-[calc(100%-0.75rem)] rounded-full bg-foreground/[0.07] will-change-[left,width]"
            style={{
              left: pill?.left ?? 0,
              width: pill?.width ?? 0,
              opacity: pill && activeIdx >= 0 ? 1 : 0,
              transition:
                "left 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease",
            }}
          />

          {TABS.map(({ path, Icon, label }, idx) => {
            const active = isActive(pathname, path)
            return (
              <button
                key={path}
                ref={(el) => {
                  tabRefs.current[idx] = el
                }}
                onClick={() => {
                  if (!active) navigate(path, { motion: "switch" })
                }}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-4 py-2 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground active:bg-foreground/[0.05]"
                )}
              >
                <Icon size={17} weight={active ? "fill" : "regular"} />
                {active && (
                  <span className="text-[11px] font-medium">{label}</span>
                )}
              </button>
            )
          })}

          {/* Plus — visible on all tab pages */}
          {showQuickAdd && (
            <>
              <div className="mx-1 h-4 w-px bg-border/60" />
              <button
                onClick={onAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-foreground/[0.07] active:text-foreground"
                aria-label="Add"
              >
                <Plus size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <aside className="fixed top-6 bottom-6 left-6 z-40 hidden w-56 flex-col overflow-hidden rounded-[32px] border border-border/60 bg-background/85 p-3 shadow-2xl shadow-black/[0.08] backdrop-blur-2xl md:flex">
        <button
          onClick={() => {
            if (pathname !== "/") navigate("/", { motion: "switch" })
          }}
          className="mb-6 flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.985] active:bg-foreground/[0.05]"
        >
          <img src="/app-icon.svg" alt="" className="h-10 w-10 rounded-2xl" />
          <div>
            <p className="text-[14px] font-semibold tracking-tight">OneRep</p>
            <p className="text-[11px] font-medium text-muted-foreground/60">
              Daily log
            </p>
          </div>
        </button>

        <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {DESKTOP_TABS.map(({ path, Icon, label }) => {
            const active = isActive(pathname, path)
            return (
              <button
                key={path}
                onClick={() => {
                  if (!active) navigate(path, { motion: "switch" })
                }}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-2xl px-3 text-[13px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.985]",
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                )}
              >
                <Icon size={17} weight={active ? "fill" : "regular"} />
                {label}
              </button>
            )
          })}
        </nav>

        {onAdd && showQuickAdd && (
          <button
            onClick={onAdd}
            className="mt-3 flex h-12 shrink-0 items-center justify-center gap-2 rounded-[20px] bg-foreground text-[13px] font-bold text-background shadow-lg shadow-black/[0.08] transition-opacity active:opacity-75"
          >
            <Plus size={15} weight="bold" />
            Quick add
          </button>
        )}
      </aside>
    </>
  )
}
