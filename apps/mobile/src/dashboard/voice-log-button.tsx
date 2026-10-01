import { tr } from "@repo/ui/i18n"
import { Message } from "@repo/ui/i18n"
import { Microphone, StopCircle } from "@phosphor-icons/react"
import { useDashboardVoiceLog } from "@/lib/use-dashboard-voice-log"

/** Voice capture uses the dashboard row, clear of the draggable quick-add control. */
export function VoiceLogButton() {
  const voice = useDashboardVoiceLog()

  if (!voice.available) return null

  return (
    <div className="voice-log relative ml-auto flex shrink-0 flex-col items-end gap-1.5">
      {voice.error && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-56 rounded-xl bg-card p-3 text-sm text-destructive"
        >
          {voice.error}
        </p>
      )}
      {voice.listening && (
        <span
          role="status"
          aria-live="polite"
          className="absolute top-full right-0 z-10 mt-2 max-w-56 rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] leading-none font-medium text-foreground shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
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
        disabled={voice.sending}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? tr("Stop and log") : tr("Log by voice")}
        title={
          voice.listening ? tr("Stop and log") : tr("Say what you ate to Coach")
        }
        className="motion-tactile flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_8px_22px_rgba(0,0,0,0.18)] active:bg-muted"
      >
        {voice.listening ? (
          <StopCircle
            size={19}
            weight="fill"
            className="motion-safe:animate-pulse"
          />
        ) : (
          <Microphone size={19} weight="bold" />
        )}
      </button>
    </div>
  )
}
