import type { ReactNode, Ref } from "react"

import { cn } from "../lib/utils"

export type NavigationTabView = {
  id: string
  label: string
  icon: ReactNode
  active: boolean
  onSelect: () => void
}

export function AppNavigationChrome({
  tabs,
  desktopTabs = tabs,
  coachActive,
  renderDesktopSidebar = true,
  chromeState,
  onToday,
  profile,
  appIconSrc = "/app-icon.svg",
  appName = "OneRep",
  primaryNavRef,
}: {
  tabs: NavigationTabView[]
  desktopTabs?: NavigationTabView[]
  coachActive?: boolean
  renderDesktopSidebar?: boolean
  chromeState?: string
  onToday: () => void
  profile?: ReactNode
  appIconSrc?: string
  appName?: string
  /** Lets the host highlight the tab bar; it is fixed, so it cannot be wrapped. */
  primaryNavRef?: Ref<HTMLElement>
}) {
  return (
    <>
      <div
        className={cn(
          "app-route-chrome fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom,0px)] lg:hidden",
          coachActive
            ? "border-border bg-background/96 dark:border-white/10 dark:bg-[#020817]/96"
            : "border-border bg-background/96"
        )}
        data-route-chrome={chromeState}
      >
        <nav
          ref={primaryNavRef}
          aria-label="Primary"
          className="mx-auto grid h-[4.25rem] max-w-xl grid-cols-5 px-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-label={tab.label}
              aria-current={tab.active ? "page" : undefined}
              type="button"
              onClick={tab.onSelect}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.75rem] leading-none font-medium transition-colors",
                coachActive
                  ? tab.active
                    ? "text-foreground dark:text-white"
                    : "text-muted-foreground active:text-foreground dark:text-white/55 dark:active:text-white"
                  : tab.active
                    ? "text-foreground"
                    : "text-muted-foreground active:text-foreground"
              )}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {renderDesktopSidebar && (
        <aside
          className="desktop-sidebar app-route-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r border-border bg-background p-4 lg:flex"
          data-route-chrome={chromeState}
        >
          <button
            onClick={onToday}
            aria-label="Go to Today"
            className="mb-6 flex min-h-11 items-center gap-3 px-3 py-2 text-left active:bg-muted"
          >
            <img src={appIconSrc} alt="" className="h-8 w-8 rounded-[8px]" />
            <p className="text-[14px] font-semibold tracking-tight">
              {appName}
            </p>
          </button>
          <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {desktopTabs.map((tab) => (
              <button
                key={tab.id}
                aria-current={tab.active ? "page" : undefined}
                onClick={tab.onSelect}
                className={cn(
                  "flex h-11 items-center gap-3 border-l-2 px-3 text-[15px] font-semibold transition-colors",
                  tab.active
                    ? "border-foreground bg-muted/45 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
          {profile && (
            <div className="mt-3 border-t border-border/45 pt-3">{profile}</div>
          )}
        </aside>
      )}
    </>
  )
}
