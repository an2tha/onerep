import { useCallback, useEffect, useRef, useState } from "react"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { SpeechRecognition } from "@capgo/capacitor-speech-recognition"

type WebRecognitionResult = {
  isFinal: boolean
  0: { transcript: string }
}

type WebRecognitionEvent = {
  resultIndex: number
  results: ArrayLike<WebRecognitionResult>
}

type WebRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: WebRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type WebRecognitionConstructor = new () => WebRecognition
type DictationStatus = "idle" | "listening" | "error"

function webRecognitionConstructor() {
  if (typeof window === "undefined") return null
  const speechWindow = window as unknown as {
    SpeechRecognition?: WebRecognitionConstructor
    webkitSpeechRecognition?: WebRecognitionConstructor
  }
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  )
}

function appendTranscript(base: string, transcript: string) {
  const clean = transcript.trim()
  if (!clean) return base
  return `${base.trim()}${base.trim() ? " " : ""}${clean}`
}

function permissionError(code?: string) {
  return code === "not-allowed" || code === "permission-denied"
    ? "Microphone and speech permissions are required for voice input."
    : "Voice input stopped. Try again."
}

export function useCoachDictation({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [available, setAvailable] = useState(
    () => Capacitor.isNativePlatform() || Boolean(webRecognitionConstructor())
  )
  const [status, setStatus] = useState<DictationStatus>("idle")
  const [interim, setInterim] = useState("")
  const [error, setError] = useState<string | null>(null)
  const webRecognitionRef = useRef<WebRecognition | null>(null)
  const nativeListenersRef = useRef<PluginListenerHandle[]>([])
  const baseRef = useRef("")
  const finalRef = useRef("")
  const interimRef = useRef("")
  const activeRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const removeNativeListeners = useCallback(async () => {
    const listeners = nativeListenersRef.current.splice(0)
    await Promise.allSettled(listeners.map((listener) => listener.remove()))
  }, [])

  const stopNative = useCallback(async () => {
    try {
      await SpeechRecognition.setPTTState({ held: false, mute: true })
      await SpeechRecognition.forceStop({ timeout: 800 })
    } catch {
      // The native recognizer may already have stopped after its final result.
    } finally {
      await removeNativeListeners()
    }
  }, [removeNativeListeners])

  const stop = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const latest = await SpeechRecognition.getLastPartialResult().catch(
        () => null
      )
      if (latest?.available && latest.text.trim()) {
        interimRef.current = latest.text
      }
    }
    const committed = appendTranscript(
      appendTranscript(baseRef.current, finalRef.current),
      interimRef.current
    )
    activeRef.current = false
    onChangeRef.current(committed)
    interimRef.current = ""
    setInterim("")
    if (Capacitor.isNativePlatform()) await stopNative()
    else webRecognitionRef.current?.stop()
    setStatus("idle")
    return committed
  }, [stopNative])

  const cancel = useCallback(() => {
    activeRef.current = false
    interimRef.current = ""
    setInterim("")
    if (Capacitor.isNativePlatform()) void stopNative()
    else webRecognitionRef.current?.abort()
    setStatus("idle")
  }, [stopNative])

  const startNative = useCallback(async () => {
    const language = navigator.language || "en-US"
    const permission = await SpeechRecognition.requestPermissions()
    if (permission.speechRecognition !== "granted") {
      throw new Error("permission-denied")
    }
    if (!activeRef.current) return
    const support = await SpeechRecognition.available()
    if (!support.available) {
      setAvailable(false)
      throw new Error("unavailable")
    }
    if (!activeRef.current) return
    const onDevice = await SpeechRecognition.isOnDeviceRecognitionAvailable({
      language,
    }).catch(() => ({ available: false }))
    if (!activeRef.current) return
    await removeNativeListeners()
    const partialListener = await SpeechRecognition.addListener(
      "partialResults",
      (event) => {
        if (!activeRef.current) return
        const transcript =
          event.accumulatedText ?? event.matches?.[0] ?? event.accumulated ?? ""
        interimRef.current = transcript
        setInterim(transcript)
        onChangeRef.current(appendTranscript(baseRef.current, transcript))
      }
    )
    const stateListener = await SpeechRecognition.addListener(
      "listeningState",
      (event) => {
        if (event.state !== "stopped" || !activeRef.current) return
        if (event.reason === "error") {
          activeRef.current = false
          setStatus("error")
          setError(permissionError(event.errorCode))
          void stopNative()
        }
      }
    )
    const errorListener = await SpeechRecognition.addListener(
      "error",
      (event) => {
        if (!activeRef.current) return
        activeRef.current = false
        setStatus("error")
        setError(permissionError(event.code))
        void stopNative()
      }
    )
    nativeListenersRef.current = [partialListener, stateListener, errorListener]
    if (!activeRef.current) {
      await removeNativeListeners()
      return
    }
    await SpeechRecognition.setPTTState({ held: true, mute: true })
    await SpeechRecognition.start({
      language,
      maxResults: 1,
      popup: false,
      partialResults: true,
      addPunctuation: true,
      contextualStrings: [
        "calories",
        "protein",
        "carbohydrates",
        "repetitions",
        "kilograms",
      ],
      useOnDeviceRecognition: onDevice.available,
      allowForSilence: 1_500,
      continuousPTT: true,
      muteRecognizerBeep: true,
    })
  }, [removeNativeListeners, stopNative])

  const startWeb = useCallback(() => {
    const Constructor = webRecognitionConstructor()
    if (!Constructor) throw new Error("unavailable")
    const recognition = new Constructor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || "en-US"
    recognition.onresult = (event) => {
      let interimText = ""
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript ?? ""
        if (result?.isFinal)
          finalRef.current = appendTranscript(finalRef.current, transcript)
        else interimText = appendTranscript(interimText, transcript)
      }
      interimRef.current = interimText
      setInterim(interimText)
      onChangeRef.current(
        appendTranscript(
          appendTranscript(baseRef.current, finalRef.current),
          interimText
        )
      )
    }
    recognition.onerror = (event) => {
      activeRef.current = false
      setStatus("error")
      setError(permissionError(event.error))
    }
    recognition.onend = () => {
      if (!activeRef.current) {
        setStatus("idle")
        return
      }
      try {
        recognition.start()
      } catch {
        activeRef.current = false
        setStatus("idle")
      }
    }
    webRecognitionRef.current = recognition
    recognition.start()
  }, [])

  const start = useCallback(async () => {
    if (activeRef.current) {
      activeRef.current = false
      if (Capacitor.isNativePlatform()) await stopNative()
      else webRecognitionRef.current?.abort()
    }
    baseRef.current = value
    finalRef.current = ""
    interimRef.current = ""
    activeRef.current = true
    setError(null)
    setStatus("listening")
    try {
      if (Capacitor.isNativePlatform()) await startNative()
      else startWeb()
    } catch (startError) {
      activeRef.current = false
      if (Capacitor.isNativePlatform()) await stopNative()
      setStatus("error")
      const code = startError instanceof Error ? startError.message : undefined
      setError(
        code === "unavailable"
          ? "Voice input is not supported on this device."
          : permissionError(code)
      )
    }
  }, [startNative, startWeb, stopNative, value])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    void SpeechRecognition.available()
      .then(({ available: supported }) => setAvailable(supported))
      .catch(() => setAvailable(false))
  }, [])

  useEffect(() => {
    const stopOnHide = () => {
      if (document.visibilityState === "hidden") cancel()
    }
    document.addEventListener("visibilitychange", stopOnHide)
    return () => {
      document.removeEventListener("visibilitychange", stopOnHide)
      cancel()
    }
  }, [cancel])

  return {
    available,
    status,
    interim,
    error,
    start,
    stop,
    cancel,
  }
}
