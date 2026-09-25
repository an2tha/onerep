import { tr, translateError } from "@repo/ui/i18n"
import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { X } from "@phosphor-icons/react"
import { currentDateKey } from "@/lib/food-log"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { useRecovery, useRecoveryToday } from "@/lib/use-recovery"
import { useSmoothNavigate } from "@/lib/navigation"
import { NudgeIllustration } from "@repo/ui/mobile"
export function RecoveryBanner({
  surface = "dashboard",
}: {
  surface?: "dashboard" | "coach" | "training" | "nutrition" | "progress"
}) {
  const recovery = useRecovery()
  const finish = useMutation(api.recovery.finish)
  const recoveryToday = useRecoveryToday()
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useSmoothNavigate()
  const [dismissedOn, setDismissedOn] = useState(() =>
    safeLocalStorageGet("onerep:recovery-nudge-dismissed")
  )
  const today = currentDateKey()
  if (!recovery) return null
  const active = recovery.active
  if (
    !active &&
    (surface === "dashboard" || surface === "coach") &&
    dismissedOn === today
  )
    return null
  if (
    !active &&
    surface !== "dashboard" &&
    surface !== "coach" &&
    surface !== "progress"
  )
    return null
  if (!active && surface === "progress") {
    return recovery.episodes.length ? (
      <section className="recovery-history" aria-label={tr("Recovery history")}>
        <h2>{tr("Recovery periods")}</h2>
        {recovery.episodes.slice(0, 5).map((episode) => (
          <p key={episode._id}>
            {episode.startedOn} – {episode.endedOn ?? tr("ongoing")}{" "}
            <span>{tr("Recovery · historical results preserved")}</span>
          </p>
        ))}
      </section>
    ) : null
  }
  const detail = active
    ? {
        dashboard:
          active.phase === "resting"
            ? "Today, keep it simple. Your goals can wait while you recover."
            : "Ease back at your pace. You can return to resting any time.",
        coach:
          "Your coach knows your recovery context. Adjust your plan or check in here.",
        training: active.deferTraining
          ? "Scheduled sessions are deferred during recovery. There is nothing to make up."
          : "Choose what feels manageable. Your usual routine is still available.",
        nutrition: active.simpleFood
          ? "Logging is optional. Keep food and fluids manageable; your targets are unchanged."
          : "Your usual logging is available. You can simplify it in your recovery plan.",
        progress:
          "This recovery period is part of your history. Lower activity does not mean lost motivation.",
      }[surface]
    : tr(
        "We can adjust your training and quiet your reminders while you recover."
      )
  return (
    <section
      className={`recovery-banner ${active ? "is-active" : ""}`}
      aria-label={active ? tr("Recovery mode") : tr("Feeling unwell?")}
    >
      {active && (
        <button
          className="recovery-dismiss"
          type="button"
          aria-label={tr("Dismiss recovery mode")}
          disabled={dismissing}
          aria-busy={dismissing}
          onClick={async () => {
            if (dismissing) return
            setDismissing(true)
            setError(null)
            try {
              await finish({ episodeId: active._id, endedOn: recoveryToday })
              safeLocalStorageSet("onerep:recovery-nudge-dismissed", today)
              setDismissedOn(today)
            } catch {
              setError(
                translateError(
                  tr("Could not dismiss recovery mode. Try again.")
                )
              )
            } finally {
              setDismissing(false)
            }
          }}
        >
          <X size={16} />
        </button>
      )}
      {!active && (surface === "dashboard" || surface === "coach") && (
        <button
          className="recovery-dismiss"
          type="button"
          aria-label={tr("Dismiss recovery suggestion for today")}
          onClick={() => {
            safeLocalStorageSet("onerep:recovery-nudge-dismissed", today)
            setDismissedOn(today)
          }}
        >
          <X size={16} />
        </button>
      )}
      <NudgeIllustration
        scene={
          active?.phase === "easing_back"
            ? "return"
            : surface === "nutrition"
              ? "food"
              : "rest"
        }
      />
      <div>
        <h2>
          {active
            ? active.phase === "resting"
              ? tr("Today, keep it simple")
              : tr("Ease back at your pace")
            : tr("Feeling unwell?")}
        </h2>
        <p>{detail}</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={() => navigate("/recovery")}>
          {active ? tr("Open recovery plan") : tr("Set up recovery")}
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    </section>
  )
}
