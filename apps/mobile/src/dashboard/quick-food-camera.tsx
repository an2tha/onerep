import { Capacitor } from "@capacitor/core"
import {
  Camera as NativeCamera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera"
import { toast } from "@repo/ui"
import { tr } from "@repo/ui/i18n"
import { useEffect, useRef, useState } from "react"
import { Camera, ImagesSquare } from "@phosphor-icons/react"
import { hapticMedium } from "@/lib/haptics"

export function QuickFoodCamera({
  onCapture,
  onLibrary,
  onCamera,
}: {
  onCapture: (image: Blob) => void
  onLibrary: () => void
  onCamera: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">(
    "starting",
  )
  const capturing = useRef(false)

  const native = Capacitor.isNativePlatform()
  useEffect(() => {
    if (native) return
    let disposed = false
    let stream: MediaStream | undefined
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
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
    return () => {
      disposed = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [native])

  async function capture() {
    if (capturing.current) return
    hapticMedium()
    if (native) {
      capturing.current = true
      try {
        const photo = await NativeCamera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 80,
          width: 1600,
          height: 1600,
          correctOrientation: true,
        })
        if (photo.webPath)
          onCapture(await fetch(photo.webPath).then((res) => res.blob()))
      } catch (error) {
        if (!(error instanceof Error && /cancel/i.test(error.message))) {
          toast.error(tr("Camera unavailable"))
        }
      } finally {
        capturing.current = false
      }
      return
    }
    const feed = video.current
    if (status !== "ready" || !feed?.videoWidth) {
      onCamera()
      return
    }
    capturing.current = true
    const canvas = document.createElement("canvas")
    canvas.width = feed.videoWidth
    canvas.height = feed.videoHeight
    canvas.getContext("2d")?.drawImage(feed, 0, 0)
    canvas.toBlob(
      (blob) => {
        capturing.current = false
        if (blob) onCapture(blob)
        else onCamera()
      },
      "image/jpeg",
      0.85,
    )
  }

  return (
    <div className="quick-food-camera">
      {!native && (
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label={tr("Live meal camera preview")}
        />
      )}
      {native && <p>{tr("Capture meal")}</p>}
      {!native && status !== "ready" && (
        <p role="status">
          {status === "starting"
            ? tr("Starting camera…")
            : tr("Camera unavailable")}
        </p>
      )}
      <div className="quick-food-camera__controls">
        <button
          type="button"
          onClick={capture}
          aria-label={
            status === "ready" ? tr("Capture meal") : tr("Open camera")
          }
          title={tr("Capture meal")}
        >
          <Camera size={24} />
        </button>
        <button
          type="button"
          onClick={onLibrary}
          aria-label={tr("Choose image")}
          title={tr("Choose image")}
        >
          <ImagesSquare size={24} />
        </button>
      </div>
    </div>
  )
}
