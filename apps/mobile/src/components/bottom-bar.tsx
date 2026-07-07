import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
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
  RocketLaunchIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { Dock, DockIcon } from "@/components/ui/dock"

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

  useLayoutEffect(() => {
    if (!setBottomBarAction || !enabled) return

    setBottomBarAction(() => actionRef.current?.())
    return () => setBottomBarAction(undefined)
  }, [enabled, setBottomBarAction])
}

const TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/nutrition", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/coach", Icon: RocketLaunchIcon, label: "Coach" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/nutrition", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/settings", Icon: GearSix, label: "Settings" },
  { path: "/coach", Icon: RocketLaunchIcon, label: "Coach" }
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
  if (path === "/nutrition") return isNutritionPath(pathname)
  if (path === "/workouts") return isTrainingPath(pathname)
  return pathname === path || pathname.startsWith(`${path}/`)
}

type ChromeTransitionState = "previous" | "previous-ready" | "loading" | "ready"

export function BottomBar({
  pathname: pathnameOverride,
  chromeState,
}: {
  pathname?: string
  chromeState?: ChromeTransitionState
}) {
  const navigate = useSmoothNavigate()
  const location = useLocation()
  const pathname = pathnameOverride ?? location.pathname
  const renderDesktopSidebar =
    chromeState !== "previous" && chromeState !== "previous-ready"

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center px-3 lg:hidden app-route-chrome"
        data-route-chrome={chromeState}
      >
        <Dock
          iconSize={42}
          iconMagnification={42}
          disableMagnification
          className="pointer-events-auto mt-0 h-[60px] max-w-[calc(100vw-1.5rem)] gap-1 rounded-[18px] border-border/60 bg-card/88 px-2 py-2 shadow-[0_16px_40px_color-mix(in_srgb,var(--foreground)_14%,transparent)] backdrop-blur-xl dark:bg-card/82"
        >
          {TABS.map(({ path, Icon, label }) => {
            const active = isActive(pathname, path)
            return (
              <DockIcon
                key={path}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (!active) navigate(path, { motion: "switch" })
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  if (!active) navigate(path, { motion: "switch" })
                }}
                className={cn(
                  "motion-pressable text-muted-foreground transition-colors",
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "active:bg-muted active:text-foreground"
                )}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
              </DockIcon>
            )
          })}
        </Dock>
      </div>

      {renderDesktopSidebar && (
        <aside className="hidden top-6 bottom-6 left-6 z-40 fixed lg:flex flex-col backdrop-blur-2xl p-3 w-56 overflow-hidden desktop-sidebar">
          <button
            onClick={() => {
              if (pathname !== "/") navigate("/", { motion: "switch" })
            }}
            aria-label="Go to Today"
            className="flex items-center gap-3 active:bg-foreground/[0.05] mb-6 px-2 py-2 rounded-[9px] text-left motion-pressable"
          >
            <img src="/app-icon.svg" alt="" className="rounded-[8px] w-8 h-8" />
            <p className="font-semibold text-[14px] tracking-tight">OneRep</p>
          </button>

          <nav className="flex flex-col flex-1 gap-1.5 min-h-0 overflow-y-auto">
            {DESKTOP_TABS.map(({ path, Icon, label }) => {
              const active = isActive(pathname, path)
              return (
                <button
                  key={path}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (!active) navigate(path, { motion: "switch" })
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 rounded-[9px] h-11 font-semibold text-[13px] motion-pressable",
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
        </aside>
      )}
    </>
  )
}

export function PersistentQuickAdd({ onAdd }: { onAdd: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onAdd}
        aria-label="Quick add"
        className="hidden bottom-9 left-9 z-50 fixed lg:flex justify-center items-center gap-2 bg-foreground active:opacity-85 rounded-[10px] w-[12.5rem] h-12 font-bold text-[13px] text-background motion-pressable"
      >
        <Plus size={15} weight="bold" />
        Quick add
      </button>
    </>
  )
}
