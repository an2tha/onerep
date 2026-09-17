import { useEffect, useRef, useState } from "react"
import { Camera, ImagesSquare } from "@phosphor-icons/react"
import { hapticMedium } from "@/lib/haptics"

export function QuickFoodCamera({ onCapture, onLibrary, onCamera }: {
  onCapture: (image: Blob) => void
  onLibrary: () => void
  onCamera: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">("starting")
  const capturing = useRef(false)

  useEffect(() => {
    let disposed = false
    let stream: MediaStream | undefined
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return }
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play()
        }
        if (!disposed) setStatus("ready")
      } catch {
        stream?.getTracks().forEach((track) => track.stop())
        if (!disposed) setStatus("unavailable")
      }
    }
    void start()
    return () => { disposed = true; stream?.getTracks().forEach((track) => track.stop()) }
  }, [])

  function capture() {
    if (capturing.current) return
    hapticMedium()
    const feed = video.current
    if (status !== "ready" || !feed?.videoWidth) { onCamera(); return }
    capturing.current = true
    const canvas = document.createElement("canvas")
    canvas.width = feed.videoWidth
    canvas.height = feed.videoHeight
    canvas.getContext("2d")?.drawImage(feed, 0, 0)
    canvas.toBlob((blob) => {
      capturing.current = false
      if (blob) onCapture(blob)
      else onCamera()
    }, "image/jpeg", 0.85)
  }

  return (
    <div className="quick-food-camera">
      <video ref={video} autoPlay muted playsInline aria-label="Live meal camera preview" />
      {status !== "ready" && <p role="status">{status === "starting" ? "Starting camera…" : "Camera unavailable"}</p>}
      <div className="quick-food-camera__controls">
        <button type="button" onClick={capture} aria-label={status === "ready" ? "Capture meal" : "Open camera"} title="Capture meal"><Camera size={24} /></button>
        <button type="button" onClick={onLibrary} aria-label="Choose image" title="Choose image"><ImagesSquare size={24} /></button>
      </div>
    </div>
  )
}
