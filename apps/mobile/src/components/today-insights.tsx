import { Link } from "react-router"
import { useMutation, useQuery } from "convex/react"
import { tr } from "@repo/ui/i18n"
import { TodayInsightsView, DEFAULT_INSIGHTS } from "@repo/ui/sleep"
import { api } from "../../../../convex/_generated/api"

export function TodayInsights({ date, today }: { date: string; today: string }) {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const data = useQuery(api.logs.sleep.dashboard, { date })
  const save = useMutation(api.logs.sleep.setTodayInsights)
  if (data === undefined || preferences === undefined) return <p role="status" className="today-insights-loading">{tr("Reading your daily summary…")}</p>
  if (!data) return null
  return <TodayInsightsView today={today} date={date} history={data.history} review={data.connectedReview}
    linkComponent={Link} settings={preferences?.todayInsights ?? DEFAULT_INSIGHTS} save={save} />
}
