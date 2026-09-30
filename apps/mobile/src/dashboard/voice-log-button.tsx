import { tr } from "@repo/ui/i18n"
import { Message } from "@repo/ui/i18n"
import { Microphone, StopCircle } from "@phosphor-icons/react"
import { useDashboardVoiceLog } from "@/lib/use-dashboard-voice-log"

/**
 * The dashboard's voice door: one press, one sentence, and the log is written
 * through Coach. Sits under the quick-add button so the two form a column of
 * capture surfaces — type with the fan, speak with the mic.
 *
 * Hidden entirely on devices with no recogniser: a button that only errors is
 * worse than a button that is not there.
 */
export function VoiceLogButton() {
  const voice = useDashboardVoiceLog()

  if (!voice.available) return null

  return (
    <div
      className="voice-log fixed right-[max(1rem,env(safe-area-inset-right,0px))] z-40 flex flex-col items-end gap-1.5"
      style={{ bottom: "calc(var(--app-safe-bottom-lg) + 4.75rem)" }}
    >
      {voice.listening && (
        <span
          role="status"
          aria-live="polite"
          className="max-w-56 truncate rounded-full border border-border bg-card px-3 py-1.5 text-[12px] leading-none font-medium text-foreground shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
        >
          <Message
            text={"{{value0}}Listening"}
            values={{
              value0: voice.interim ? `${voice.interim} · ` : "",
            }}
          />
        </span>
      )}
      <button
        type="button"
        onClick={voice.toggle}
        aria-pressed={voice.listening}
        aria-label={
          voice.listening ? tr("Stop and log") : tr("Log by voice")
        }
        title={
          voice.listening
            ? tr("Stop and log")
            : tr("Say what you ate — Coach writes the log")
        }
        className="motion-tactile flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_8px_22px_rgba(0,0,0,0.18)] active:bg-muted"
      >
        {voice.listening ? (
          <StopCircle size={19} weight="fill" className="animate-pulse" />
        ) : (
          <Microphone size={19} weight="bold" />
        )}
      </button>
    </div>
  )
}
