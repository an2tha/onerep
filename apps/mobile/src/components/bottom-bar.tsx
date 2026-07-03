import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import {
  Barbell,
  ChartLine,
  ForkKnife,
  GearSix,
  House,
  MagnifyingGlass,
  PintGlass,
  Plus,
  Aperture,
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
  { path: "/settings", Icon: GearSix, label: "Settings" },
] as const

const DESKTOP_TABS = [
  { path: "/", Icon: House, label: "Today" },
  { path: "/nutrition", Icon: ForkKnife, label: "Nutrition" },
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

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const activeIdx = TABS.findIndex((t) => isActive(pathname, t.path))
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
      <div
        className="app-route-chrome pointer-events-none fixed inset-x-0 bottom-[var(--app-safe-bottom)] z-40 flex items-center justify-center px-3 lg:hidden"
        data-route-chrome={chromeState}
      >
        {/* position:relative so offsetLeft on buttons is relative to this element */}
        <div className="relative w-full max-w-[28rem]">
          <div className="mobile-tabbar motion-card pointer-events-auto relative grid w-full grid-cols-5 items-center gap-1 px-1.5 py-1.5 backdrop-blur-xl">
            {/* Sliding pill — always in DOM so the CSS transition has a start value */}
            <div
              className="absolute top-1.5 h-[calc(100%-0.75rem)] rounded-[14px] bg-foreground/[0.075] will-change-[left,width]"
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
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (!active) navigate(path, { motion: "switch" })
                  }}
                  className={cn(
                    "motion-pressable relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground active:bg-foreground/[0.05]"
                  )}
                >
                  <Icon
                    size={19}
                    weight={active ? "fill" : "regular"}
                    className="shrink-0"
                  />
                  {active && (
                    <span className="mobile-tabbar-active-label motion-pop hidden max-w-full truncate text-[10px] leading-none font-bold min-[390px]:block">
                      {label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

        </div>
      </div>

      <aside
        className="app-route-chrome desktop-sidebar motion-card fixed top-6 bottom-6 left-6 z-40 hidden w-56 flex-col overflow-hidden p-3 backdrop-blur-2xl lg:flex"
        data-route-chrome={chromeState}
      >
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

      </aside>
    </>
  )
}

export function PersistentQuickAdd({ onAdd }: { onAdd: () => void }) {
  const navigate = useSmoothNavigate()
  const actionRef = useRef(onAdd)
  const longPressTimer = useRef<number | null>(null)
  const suppressNextClick = useRef(false)
  const [shortcutOpen, setShortcutOpen] = useState(false)

  useEffect(() => {
    actionRef.current = onAdd
  }, [onAdd])

  useEffect(() => clearLongPress, [])

  function clearLongPress() {
    if (longPressTimer.current == null) return
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  function handleClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    setShortcutOpen(false)
    actionRef.current()
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true
      setShortcutOpen(true)
      longPressTimer.current = null
    }, 360)
  }

  function runShortcut(path: string) {
    clearLongPress()
    suppressNextClick.current = false
    setShortcutOpen(false)
    navigate(path, { motion: "forward" })
  }

  const shortcuts = [
    {
      label: "Snap meal",
      path: "/camera",
      Icon: Aperture,
    },
    {
      label: "Search food",
      path: "/foods/search",
      Icon: MagnifyingGlass,
    },
    {
      label: "Log water",
      path: "/water",
      Icon: PintGlass,
    },
    {
      label: "Start workout",
      path: "/workout/active",
      Icon: Barbell,
    },
  ] as const

  return (
    <>
      {shortcutOpen && (
        <>
          <button
            type="button"
            aria-label="Close quick actions"
            className="fixed inset-0 z-40 bg-transparent lg:hidden"
            onClick={() => setShortcutOpen(false)}
          />
          <div
            id="mobile-quick-actions"
            role="menu"
            aria-label="Quick actions"
            className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--app-safe-bottom)+9.75rem)] z-50 grid w-[12.5rem] gap-1.5 rounded-[18px] border border-border/55 bg-card p-2 shadow-2xl lg:hidden"
          >
            {shortcuts.map(({ label, path, Icon }) => (
              <button
                key={path}
                type="button"
                role="menuitem"
                onClick={() => runShortcut(path)}
                className="motion-pressable flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-left text-[12.5px] font-bold text-foreground active:bg-muted/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted/60 text-muted-foreground">
                  <Icon size={15} weight="bold" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        aria-label="Add"
        aria-controls="mobile-quick-actions"
        aria-expanded={shortcutOpen}
        className="motion-pressable fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--app-safe-bottom)+5.75rem)] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-[0_14px_34px_color-mix(in_srgb,var(--foreground)_24%,transparent)] transition-transform active:scale-95 lg:hidden"
      >
        <Plus size={22} weight="bold" />
      </button>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Quick add"
        className="motion-pressable fixed bottom-9 left-9 z-50 hidden h-12 w-[12.5rem] items-center justify-center gap-2 rounded-[10px] bg-foreground text-[13px] font-bold text-background active:opacity-85 lg:flex"
      >
        <Plus size={15} weight="bold" />
        Quick add
      </button>
    </>
  )
}
