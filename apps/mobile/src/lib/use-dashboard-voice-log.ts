import { useCallback, useEffect, useRef, useState } from "react"
import { useSmoothNavigate } from "@/lib/navigation"
import { useCoachDictation } from "@/lib/use-coach-dictation"
import { hapticMedium } from "@/lib/haptics"

/** Capture a spoken message and hand it to the existing Coach flow. */
export function useDashboardVoiceLog() {
  const navigate = useSmoothNavigate()
  const [transcript, setTranscript] = useState("")
  const [sending, setSending] = useState(false)
  const stopping = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const dictation = useCoachDictation({ value: "", onChange: setTranscript })
  const listening = dictation.status === "listening"

  const stopAndSend = useCallback(async () => {
    if (stopping.current) return
    stopping.current = true
    setSending(true)
    try {
      const clean = (await dictation.stop())?.trim()
      if (!clean || !mounted.current) return
      navigate("/coach", {
        motion: "forward",
        state: { coachMode: "chat", initialInput: clean, autoSend: true },
      })
    } finally {
      stopping.current = false
      if (mounted.current) setSending(false)
    }
  }, [dictation, navigate])

  const toggle = useCallback(() => {
    if (stopping.current) return
    if (listening) {
      void stopAndSend()
    } else {
      hapticMedium()
      setTranscript("")
      void dictation.start()
    }
  }, [listening, dictation, stopAndSend])

  return {
    listening,
    toggle,
    sending,
    available: dictation.available,
    error: dictation.error,
    interim: dictation.interim || transcript,
  }
}
