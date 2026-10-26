import type { ReactNode } from "react"

export function TodayBody({
  summary,
  rail,
  timeline,
  week,
}: {
  summary: ReactNode
  rail: ReactNode
  timeline: ReactNode
  week: ReactNode
}) {
  return (
    <div className="dashboard-today-body relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="dashboard-context min-h-0 px-[var(--app-page-x)] md:px-8">
        {summary}
        {rail}
      </div>
      <div className="dashboard-timeline-stage flex min-h-0 flex-1 justify-center">
        <div className="dashboard-timeline-viewport h-[max(22rem,calc(100svh-24rem))] min-h-0 w-full max-w-sm">
          {timeline}
        </div>
      </div>
      {week}
    </div>
  )
}
