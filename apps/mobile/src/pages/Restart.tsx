import { useState } from "react"
import { useMutation } from "convex/react"
import { useSearchParams } from "react-router"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import { useRestart } from "@/lib/use-restart"
import { useRecoveryToday } from "@/lib/use-recovery"
import { useSmoothNavigate } from "@/lib/navigation"
import { RestartExperience } from "@/components/restart/restart-experience"
import type { RestartPlan } from "@/components/restart/restart-content"

export default function Restart() {
  const state = useRestart()
  const today = useRecoveryToday()
  const navigate = useSmoothNavigate()
  const [params] = useSearchParams()
  const preview = params.get("preview") === "1"
  const [previewPlan, setPreviewPlan] = useState<RestartPlan | null>(null)
  const save = useMutation(api.restart.save)
  const advance = useMutation(api.restart.advance)
  const pause = useMutation(api.restart.pause)
  if (!preview && !state)
    return (
      <main className="restart-experience">
        <p role="status">{tr("Opening your restart…")}</p>
        <button
          type="button"
          className="restart-secondary"
          onClick={() => navigate("/")}
        >
          {tr("Back to Today")}
        </button>
      </main>
    )
  return (
    <RestartExperience
      plan={preview ? previewPlan : state!.plan}
      draftKey={preview ? undefined : (state?.draftKey ?? undefined)}
      today={today}
      preview={preview}
      onSave={async (choices) => {
        if (preview)
          setPreviewPlan((p) => ({
            ...choices,
            status: "active",
            stage: p?.status === "active" ? p.stage : 0,
          }))
        else await save(choices)
      }}
      onAdvance={async (expectedStage) => {
        if (preview)
          setPreviewPlan((p) =>
            p
              ? {
                  ...p,
                  stage: p.stage + 1,
                  lastActionOn: today,
                  status: p.stage >= 2 ? "completed" : "active",
                }
              : p,
          )
        else await advance({ expectedStage })
      }}
      onPause={async () => {
        if (!preview) await pause({})
      }}
      onClose={() =>
        navigate(preview ? "/settings?view=developer" : "/", { motion: "back" })
      }
      onNavigate={(path) => navigate(path, { motion: "forward" })}
    />
  )
}
