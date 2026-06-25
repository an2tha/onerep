import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import {
  Barbell,
  ChartLine,
  ForkKnife,
  GearSix,
  House,
  ListChecks,
  PintGlass,
  Plus,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"

type BottomBarAction = () => void
type BottomBarActionSetter = (action?: BottomBarAction) => void

const BottomBarActionContext = createContext<BottomBarActionSetter | null>(null)

export function BottomBarActionProvider({
  children,
  onActionChange,
}: {
  children: ReactNode
  onActionChange: BottomBarActionSetter
}) {
  return (
    <BottomBarActionContext.Provider value={onActionChange}>
      {children}
    </BottomBarActionContext.Provider>
  )
}

export function useBottomBarAction(action?: BottomBarAction) {
  const setBottomBarAction = useContext(BottomBarActionContext)
  const actionRef = useRef(action)
  const enabled = action != null

  useEffect(() => {
    actionRef.current = action
  }, [action])

  useEffect(() => {
    if (!setBottomBarAction || !enabled) return

    setBottomBarAction(() => actionRef.current?.())
    return () => setBottomBarAction(undefined)
  }, [enabled, setBottomBarAction])
}

const TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/foods", Icon: ForkKnife, label: "Food" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/foods", Icon: ForkKnife, label: "Food" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/water", Icon: PintGlass, label: "Water" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/exercises", Icon: ListChecks, label: "Exercises" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
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
    Boolean(onAdd) &&
    (pathname === "/" ||
      pathname.startsWith("/foods") ||
      pathname.startsWith("/workouts") ||
      pathname.startsWith("/workout"))

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
        <div className="motion-card relative flex items-center gap-0.5 rounded-full border border-border/50 bg-background/75 px-1.5 py-1.5 shadow-lg shadow-black/[0.06] backdrop-blur-xl">
          {/* Sliding pill — always in DOM so the CSS transition has a start value */}
          <div
            className="absolute top-1.5 h-[calc(100%-0.75rem)] rounded-full bg-foreground/[0.07] will-change-[left,width]"
            style={{
              left: pill?.left ?? 0,
              width: pill?.width ?? 0,
              opacity: pill && activeIdx >= 0 ? 1 : 0,
              transition:
                "left var(--motion-medium) var(--motion-ease-out), width var(--motion-medium) var(--motion-ease-out), opacity var(--motion-fast) var(--motion-ease-standard)",
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
                  "motion-pressable relative flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground active:bg-foreground/[0.05]"
                )}
              >
                <Icon size={17} weight={active ? "fill" : "regular"} />
                {active && (
                  <span className="motion-pop text-[11px] font-medium">
                    {label}
                  </span>
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
                className="motion-pressable flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-foreground/[0.07] active:text-foreground"
                aria-label="Add"
              >
                <Plus size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <aside className="motion-card fixed top-6 bottom-6 left-6 z-40 hidden w-56 flex-col overflow-hidden rounded-[32px] border border-border/60 bg-background/85 p-3 shadow-2xl shadow-black/[0.08] backdrop-blur-2xl md:flex">
        <button
          onClick={() => {
            if (pathname !== "/") navigate("/", { motion: "switch" })
          }}
          className="motion-pressable mb-6 flex items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-foreground/[0.05]"
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
                  "motion-pressable flex h-11 items-center gap-3 rounded-2xl px-3 text-[13px] font-semibold",
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
            className="motion-pressable mt-3 flex h-12 shrink-0 items-center justify-center gap-2 rounded-[20px] bg-foreground text-[13px] font-bold text-background shadow-lg shadow-black/[0.08] active:opacity-85"
          >
            <Plus size={15} weight="bold" />
            Quick add
          </button>
        )}
      </aside>
    </>
  )
}
