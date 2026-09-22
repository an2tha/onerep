import { useState } from "react"
import { X } from "@phosphor-icons/react"
import { currentDateKey } from "@/lib/food-log"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { useRecovery } from "@/lib/use-recovery"
import { useSmoothNavigate } from "@/lib/navigation"
import { NudgeIllustration } from "@repo/ui/mobile"
export function RecoveryBanner({
  surface = "dashboard",
}: {
  surface?: "dashboard" | "coach" | "training" | "nutrition" | "progress"
}) {
  const recovery = useRecovery()
  const navigate = useSmoothNavigate()
  const [dismissedOn, setDismissedOn] = useState(() =>
    safeLocalStorageGet("onerep:recovery-nudge-dismissed")
  )
  const today = currentDateKey()
  if (!recovery) return null
  const active = recovery.active
  if (!active && surface === "dashboard" && dismissedOn === today) return null
  if (
    !active &&
    surface !== "dashboard" &&
    surface !== "coach" &&
    surface !== "progress"
  )
    return null
  if (!active && surface === "progress") {
    return recovery.episodes.length ? (
      <section className="recovery-history" aria-label="Recovery history">
        <h2>Recovery periods</h2>
        {recovery.episodes.slice(0, 5).map((episode) => (
          <p key={episode._id}>
            {episode.startedOn} – {episode.endedOn ?? "ongoing"}{" "}
            <span>Recovery · historical results preserved</span>
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
    : "We can adjust your training and quiet your reminders while you recover."
  return (
    <section
      className={`recovery-banner ${active ? "is-active" : ""}`}
      aria-label={active ? "Recovery mode" : "Feeling unwell?"}
    >
      {!active && surface === "dashboard" && (
        <button
          className="recovery-dismiss"
          type="button"
          aria-label="Dismiss recovery suggestion for today"
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
              ? "Today, keep it simple"
              : "Ease back at your pace"
            : "Feeling unwell?"}
        </h2>
        <p>{detail}</p>
        <button type="button" onClick={() => navigate("/recovery")}>
          {active ? "Open recovery plan" : "Set up recovery"}
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    </section>
  )
}
