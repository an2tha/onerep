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
  { path: "/foods", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/foods", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
] as const

function isNutritionPath(pathname: string) {
  return (
    pathname === "/nutrition" ||
    pathname.startsWith("/nutrition/") ||
    pathname === "/foods" ||
    pathname.startsWith("/foods/") ||
    pathname === "/water" ||
    pathname.startsWith("/water/") ||
    pathname === "/supplements" ||
    pathname.startsWith("/supplements/")
  )
}

function isTrainingPath(pathname: string) {
  return (
    pathname === "/workouts" ||
    pathname.startsWith("/workouts/") ||
    pathname === "/exercises" ||
    pathname.startsWith("/exercises/")
  )
}

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/"
  if (path === "/foods") return isNutritionPath(pathname)
  if (path === "/workouts") return isTrainingPath(pathname)
  return pathname === path || pathname.startsWith(`${path}/`)
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
      pathname.startsWith("/nutrition") ||
      pathname.startsWith("/water") ||
      pathname.startsWith("/supplements") ||
      pathname.startsWith("/workouts") ||
      pathname.startsWith("/exercises") ||
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
      <div className="fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center px-2 lg:hidden">
        {/* position:relative so offsetLeft on buttons is relative to this element */}
        <div className="mobile-tabbar motion-card relative flex w-full max-w-[calc(100vw-1rem)] items-center gap-0.5 px-1 py-1.5 backdrop-blur-xl">
          {/* Sliding pill — always in DOM so the CSS transition has a start value */}
          <div
            className="absolute top-1.5 h-[calc(100%-0.75rem)] rounded-[8px] bg-foreground/[0.075] will-change-[left,width]"
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
                  "motion-pressable relative flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-[8px] px-1.5",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground active:bg-foreground/[0.05]"
                )}
              >
                <Icon
                  size={17}
                  weight={active ? "fill" : "regular"}
                  className="shrink-0"
                />
                {active && (
                  <span className="mobile-tabbar-active-label motion-pop truncate text-[11px] font-medium">
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
                className="motion-pressable flex h-10 w-10 items-center justify-center rounded-[8px] text-muted-foreground active:bg-foreground/[0.07] active:text-foreground"
                aria-label="Add"
              >
                <Plus size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <aside className="desktop-sidebar motion-card fixed top-6 bottom-6 left-6 z-40 hidden w-56 flex-col overflow-hidden p-3 backdrop-blur-2xl lg:flex">
        <button
          onClick={() => {
            if (pathname !== "/") navigate("/", { motion: "switch" })
          }}
          className="motion-pressable mb-6 flex items-center gap-3 rounded-[9px] px-2 py-2 text-left active:bg-foreground/[0.05]"
        >
          <img src="/app-icon.svg" alt="" className="h-8 w-8 rounded-[8px]" />
          <p className="text-[14px] font-semibold tracking-tight">OneRep</p>
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
                  "motion-pressable flex h-11 items-center gap-3 rounded-[9px] px-3 text-[13px] font-semibold",
                  active
                    ? "bg-foreground/[0.075] text-foreground"
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
            className="motion-pressable mt-3 flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-foreground text-[13px] font-bold text-background active:opacity-85"
          >
            <Plus size={15} weight="bold" />
            Quick add
          </button>
        )}
      </aside>
    </>
  )
}
