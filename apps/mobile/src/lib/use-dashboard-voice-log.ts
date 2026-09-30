import { tr } from "@repo/ui/i18n"
import { useCallback, useRef, useState } from "react"
import { useSmoothNavigate } from "@/lib/navigation"
import { useCoachDictation } from "@/lib/use-coach-dictation"
import { hapticMedium } from "@/lib/haptics"
import { toast } from "@repo/ui"

/**
 * Voice logging from the dashboard: press the mic, say what you ate, and the
 * words land in Coach chat ready to send. Coach already turns sentences into
 * logs — this only removes the typing, not the pipeline.
 *
 * The transcript rides `location.state` with `autoSend`, the same handoff the
 * guided intents use, so tapping the mic ends with the log written. The
 * recogniser decides when it has heard a sentence; the user can also stop it
 * early with a second tap.
 */
export function useDashboardVoiceLog() {
  const navigate = useSmoothNavigate()
  const [listening, setListening] = useState(false)
  // The dictation hook owns its own editor state through `onChange`; the
  // dashboard only needs the final transcript, which `stop()` resolves with.
  const onChangeRef = useRef<((value: string) => void) | undefined>(undefined)

  const dictation = useCoachDictation({
    value: "",
    onChange: (value) => onChangeRef.current?.(value),
  })

  const stopAndSend = useCallback(async () => {
    setListening(false)
    const transcript = await dictation.stop()
    const clean = transcript?.trim()
    if (!clean) return
    navigate("/coach", {
      motion: "forward",
      state: {
        coachMode: "chat",
        initialInput: clean,
        autoSend: true,
      },
    })
  }, [dictation, navigate])

  const toggle = useCallback(() => {
    if (listening) {
      void stopAndSend()
      return
    }
    hapticMedium()
    setListening(true)
    void dictation.start()
  }, [listening, dictation, stopAndSend])

  return {
    listening,
    toggle,
    stopAndSend,
    available: dictation.available,
    error: dictation.error,
    interim: dictation.interim,
    notSupportedMessage: tr("Voice input is not supported on this device."),
  }
}
