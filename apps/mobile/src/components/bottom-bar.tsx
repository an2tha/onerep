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
import { AppNavigationChrome } from "@repo/ui"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { TourAnchor, useTourAnchor } from "@/components/walkthrough/tour-anchor"

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
    pathname === "/recipes" ||
    pathname.startsWith("/recipes/") ||
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
  const primaryNavRef = useTourAnchor("bottom-bar")

  const tabs = TABS.map(({ path, Icon, label }) => {
    const active = isActive(pathname, path)
    return {
      id: path,
      label,
      active,
      icon: <Icon size={22} weight={active ? "fill" : "regular"} />,
      onSelect: () => {
        if (!active) navigate(path, { motion: "switch" })
      },
    }
  })
  const desktopTabs = DESKTOP_TABS.map(({ path, Icon, label }) => {
    const active = isActive(pathname, path)
    return {
      id: path,
      label,
      active,
      icon: <Icon size={17} weight={active ? "fill" : "regular"} />,
      onSelect: () => {
        if (!active) navigate(path, { motion: "switch" })
      },
    }
  })

  return (
    <AppNavigationChrome
      primaryNavRef={primaryNavRef}
      tabs={tabs}
      desktopTabs={desktopTabs}
      coachActive={coachActive}
      renderDesktopSidebar={renderDesktopSidebar}
      chromeState={chromeState}
      onToday={() => {
        if (pathname !== "/") navigate("/", { motion: "switch" })
      }}
      profile={
        <TourAnchor anchor="today-profile" className="block w-full">
          <button
            type="button"
            onClick={() => {
              if (!settingsActive) navigate("/settings", { motion: "switch" })
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
        </TourAnchor>
      }
    />
  )
}
