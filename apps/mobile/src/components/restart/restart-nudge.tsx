import { actions } from "./restart-content"
import { useState } from "react"
import { useMutation } from "convex/react"
import { ArrowRight, X } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../../convex/_generated/api"
import { useRestart } from "@/lib/use-restart"
import { useSmoothNavigate } from "@/lib/navigation"
import "./restart.css"

export function RestartNudge({
  coach = false,
  activeOnly = false,
}: {
  coach?: boolean
  activeOnly?: boolean
}) {
  const state = useRestart()
  const dismiss = useMutation(api.restart.dismissNudge)
  const navigate = useSmoothNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const active = state?.plan?.status === "active"
  if (activeOnly && !active) return null
  const action = actions().find((option) => option.id === state?.plan?.action)
  if (!state || (!coach && !active && !state.nudgeDue)) return null
  return (
    <section className="restart-nudge" aria-label={tr("Help me restart")}>
      <div className="restart-nudge-copy">
        <strong>
          {active
            ? tr("Your small plan is here")
            : tr("A little room to begin again")}
        </strong>
        <p>
          {active
            ? `${state.plan?.stage === 0 ? action?.prep : action?.task}. ${state.plan?.anchor ?? ""}`
            : state.nudgeDue
              ? tr(
                  "It's been a couple of weeks since your last log. Would a small restart help?",
                )
              : tr("Find one manageable step back into your routine.")}
        </p>
        <button
          type="button"
          className="restart-nudge-link"
          onClick={() => navigate("/restart", { motion: "forward" })}
        >
          {active ? tr("Continue my restart") : tr("Help me restart")}
          <ArrowRight size={15} />
        </button>
        {error && (
          <p role="alert">{tr("Couldn't dismiss this. Please try again.")}</p>
        )}
      </div>
      {!coach && !active && (
        <button
          type="button"
          className="restart-nudge-dismiss"
          aria-label={tr("Dismiss restart suggestion for two weeks")}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(false)
            try {
              await dismiss({})
            } catch {
              setError(true)
            } finally {
              setBusy(false)
            }
          }}
        >
          <X size={18} />
        </button>
      )}
    </section>
  )
}
