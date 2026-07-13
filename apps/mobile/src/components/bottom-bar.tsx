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
  House,
  RocketLaunchIcon,
  UserCircle,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"

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
  { path: "/workouts", Icon: Barbell, label: "Training" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/coach", Icon: RocketLaunchIcon, label: "Coach" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/nutrition", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Training" },
  { path: "/progress", Icon: ChartLine, label: "Progress" },
  { path: "/coach", Icon: RocketLaunchIcon, label: "Coach" },
] as const

function isNutritionPath(pathname: string) {
  return (
    pathname === "/nutrition" ||
    pathname.startsWith("/nutrition/") ||
    pathname === "/foods" ||
    pathname.startsWith("/foods/") ||
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
  const settingsActive = isActive(pathname, "/settings")
  const coachActive = isActive(pathname, "/coach")

  return (
    <>
      <div
        className={cn(
          "app-route-chrome fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom,0px)] lg:hidden",
          coachActive
            ? "border-white/10 bg-[#020817]/96"
            : "border-border bg-background/96"
        )}
        data-route-chrome={chromeState}
      >
        <nav
          aria-label="Primary"
          className="mx-auto grid h-[4.25rem] max-w-xl grid-cols-5 px-1"
        >
          {TABS.map(({ path, Icon, label }) => {
            const active = isActive(pathname, path)
            return (
              <button
                key={path}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                type="button"
                onClick={() => {
                  if (!active) navigate(path, { motion: "switch" })
                }}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.75rem] leading-none font-medium transition-colors",
                  coachActive
                    ? active
                      ? "text-white"
                      : "text-white/55 active:text-white"
                    : active
                      ? "text-foreground"
                      : "text-muted-foreground active:text-foreground"
                )}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {renderDesktopSidebar && (
        <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r border-border bg-background p-4 lg:flex">
          <button
            onClick={() => {
              if (pathname !== "/") navigate("/", { motion: "switch" })
            }}
            aria-label="Go to Today"
            className="mb-6 flex min-h-11 items-center gap-3 px-3 py-2 text-left active:bg-muted"
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
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (!active) navigate(path, { motion: "switch" })
                  }}
                  className={cn(
                    "flex h-11 items-center gap-3 border-l-2 px-3 text-[15px] font-semibold transition-colors",
                    active
                      ? "border-foreground bg-muted/45 text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                  )}
                >
                  <Icon size={17} weight={active ? "fill" : "regular"} />
                  {label}
                </button>
              )
            })}
          </nav>

          <div className="mt-3 border-t border-border/45 pt-3">
            <AppTooltip
              id={APP_TOOLTIP_IDS.profileDesktop}
              content="Open your profile, goals, preferences, developer tools, and account settings."
              targetClassName="w-full"
              side="right"
              align="end"
            >
              <button
                type="button"
                onClick={() => {
                  if (!settingsActive)
                    navigate("/settings", { motion: "switch" })
                }}
                aria-label="Open profile and settings"
                aria-current={settingsActive ? "page" : undefined}
                className={cn(
                  "flex h-11 w-full items-center gap-3 border-l-2 px-3 text-[15px] font-semibold transition-colors",
                  settingsActive
                    ? "border-foreground bg-muted/45 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                )}
              >
                <UserCircle
                  size={18}
                  weight={settingsActive ? "fill" : "regular"}
                />
                Profile & settings
              </button>
            </AppTooltip>
          </div>
        </aside>
      )}
    </>
  )
}
