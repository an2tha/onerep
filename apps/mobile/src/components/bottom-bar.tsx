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
  ForkKnife,
  House,
  RocketLaunchIcon,
  UserCircle,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { Dock, DockIcon } from "@/components/ui/dock"
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
  { path: "/workouts", Icon: Barbell, label: "Workout" },
  { path: "/coach", Icon: RocketLaunchIcon, label: "Coach" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/nutrition", Icon: ForkKnife, label: "Nutrition" },
  { path: "/workouts", Icon: Barbell, label: "Workout" },
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

  return (
    <>
      <div
        className="app-route-chrome pointer-events-none fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center px-3 lg:hidden"
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
        <div className="app-route-chrome fixed top-[var(--app-safe-top)] right-[var(--app-page-x)] z-40 lg:hidden">
          <AppTooltip
            id={APP_TOOLTIP_IDS.profileMobile}
            content="Open your profile, goals, preferences, and account settings."
            side="bottom"
            align="end"
          >
            <button
              type="button"
              onClick={() => {
                if (!settingsActive) navigate("/settings", { motion: "switch" })
              }}
              aria-label="Open profile and settings"
              aria-current={settingsActive ? "page" : undefined}
              className={cn(
                "motion-pressable flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/88 shadow-lg backdrop-blur-xl transition-colors",
                settingsActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground active:bg-muted active:text-foreground"
              )}
            >
              <UserCircle
                size={22}
                weight={settingsActive ? "fill" : "regular"}
              />
            </button>
          </AppTooltip>
        </div>
      )}

      {renderDesktopSidebar && (
        <aside className="desktop-sidebar fixed top-6 bottom-6 left-6 z-40 hidden w-56 flex-col overflow-hidden p-3 backdrop-blur-2xl lg:flex">
          <button
            onClick={() => {
              if (pathname !== "/") navigate("/", { motion: "switch" })
            }}
            aria-label="Go to Today"
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
                  aria-current={active ? "page" : undefined}
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
                  "motion-pressable flex h-11 w-full items-center gap-3 rounded-[9px] px-3 text-[13px] font-semibold",
                  settingsActive
                    ? "bg-foreground/[0.075] text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
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
