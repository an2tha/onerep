import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { Barbell, ForkKnife, House, Plus } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

const TABS = [
  { path: "/", Icon: House, label: "Home" },
  { path: "/foods", Icon: ForkKnife, label: "Foods" },
  { path: "/workouts", Icon: Barbell, label: "Workouts" },
] as const

export function BottomBar({ onAdd }: { onAdd?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const activeIdx = TABS.findIndex((t) => t.path === pathname)
  const isTabPage = activeIdx >= 0

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
    <div className="fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center md:inset-x-auto md:top-1/2 md:right-6 md:bottom-auto md:-translate-y-1/2">
      {/* position:relative so offsetLeft on buttons is relative to this element */}
      <div className="relative flex items-center gap-0.5 rounded-full border border-border/50 bg-background/75 px-1.5 py-1.5 shadow-lg shadow-black/[0.06] backdrop-blur-xl md:flex-col md:gap-1 md:rounded-[28px] md:px-2 md:py-2">
        {/* Sliding pill — always in DOM so the CSS transition has a start value */}
        <div
          className="absolute top-1.5 h-[calc(100%-0.75rem)] rounded-full bg-foreground/[0.07] md:hidden"
          style={{
            left: pill?.left ?? 0,
            width: pill?.width ?? 0,
            opacity: pill && activeIdx >= 0 ? 1 : 0,
            transition:
              "left 450ms cubic-bezier(0.34, 1.4, 0.64, 1), width 450ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 200ms ease",
          }}
        />

        {TABS.map(({ path, Icon, label }, idx) => {
          const active = pathname === path
          return (
            <button
              key={path}
              ref={(el) => {
                tabRefs.current[idx] = el
              }}
              onClick={() => navigate(path)}
              className={cn(
                "relative flex items-center gap-2 rounded-full px-4 py-2 transition-colors md:h-11 md:w-11 md:justify-center md:px-0",
                active
                  ? "text-foreground md:bg-foreground/[0.07]"
                  : "text-muted-foreground active:bg-foreground/[0.05]"
              )}
              title={label}
            >
              <Icon size={17} weight={active ? "fill" : "regular"} />
              {active && (
                <span className="text-[11px] font-medium md:hidden">{label}</span>
              )}
            </button>
          )
        })}

        {/* Plus — visible on all tab pages */}
        {isTabPage && (
          <>
            <div className="mx-1 h-4 w-px bg-border/60 md:mx-0 md:my-1 md:h-px md:w-5" />
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
  )
}
