import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { Capacitor } from "@capacitor/core"
import {
  Camera as NativeCamera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera"
import {
  ArrowLeft,
  Lightning,
  LightningSlash,
  ArrowsClockwise,
  Barcode,
  Camera as CameraIcon,
  Plus,
  Minus,
  Fire,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { useSmoothNavigate } from "@/lib/navigation"
import { BrowserMultiFormatReader } from "@zxing/browser"
import {
  ChecksumException,
  FormatException,
  NotFoundException,
} from "@zxing/library"
import {
  currentDateKey,
  defaultMeal,
  stripUndefined,
  type FoodLogEntry,
  type MealType,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import { api } from "../../../../convex/_generated/api"
import { convexClient } from "@/lib/convex"
import { usePostHog } from "@posthog/react"
import { hapticMedium, hapticTap } from "@/lib/haptics"
import type { FoodResult } from "@repo/models"
import { getFoodByBarcode, searchFoods } from "@/lib/openfoodfacts"
import {
  buildSnapFoodLogEntry,
  clampSnapGrams,
  formatSnapGrams,
  mapSnapDetectionsToReviewItems,
  scaleFoodForGrams,
  snapDetectionsFromAiResult,
  type SnapAiResult,
  type SnapReviewItem,
} from "@/lib/food-snap-review"
import { APP_ACCENT_COLORS, MACRO_COLORS, tint } from "@/lib/design-tokens"

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraState = "requesting" | "active" | "denied" | "unsupported"
type ScreenMode = "snap" | "barcode"
type SnapPhase = "idle" | "uploading" | "results" | "error"

// ─── Main component ───────────────────────────────────────────────────────────

export default function SnapAndLog() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const [params] = useSearchParams()
  const initialMode = (params.get("mode") as ScreenMode | null) ?? "snap"

  const date = currentDateKey()
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date })
  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null)
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>("requesting")
  const [mode, setMode] = useState<ScreenMode>(initialMode)
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  )
  const [flash, setFlash] = useState(false)
  const [fired, setFired] = useState(false)

  // Snap & AI results
  const [snapPhase, setSnapPhase] = useState<SnapPhase>("idle")
  const [snapReviewItems, setSnapReviewItems] = useState<SnapReviewItem[]>([])
  const [snapRaw, setSnapRaw] = useState<string | null>(null)

  // Barcode results
  const [barcodeScanning, setBarcodeScanning] = useState(false)
  const [barcodeResult, setBarcodeResult] = useState<FoodResult | null>(null)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)

  // Log state
  const [meal, setMeal] = useState<MealType>(defaultMeal())
  const [added, setAdded] = useState<string | null>(null)
  const useNativeCapture = Capacitor.isNativePlatform()

  // ── Camera stream ─────────────────────────────────────────────────────────

  const startCamera = useCallback(
    async (facing: "environment" | "user", signal: AbortSignal) => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unsupported")
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (signal.aborted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        if (!signal.aborted) setCameraState("active")
      } catch (err: unknown) {
        if (signal.aborted) return
        const name = err instanceof Error ? err.name : ""
        setCameraState(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "denied"
            : "unsupported"
        )
      }
    },
    []
  )

  useEffect(() => {
    if (useNativeCapture) {
      setCameraState("active")
      return
    }
    const controller = new AbortController()
    const video = videoRef.current
    void startCamera(facingMode, controller.signal)
    return () => {
      controller.abort()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (video) video.srcObject = null
    }
  }, [facingMode, startCamera, useNativeCapture])

  // ── Barcode scan loop ─────────────────────────────────────────────────────

  useEffect(() => {
    if (useNativeCapture || mode !== "barcode" || cameraState !== "active")
      return

    const reader = new BrowserMultiFormatReader()
    zxingRef.current = reader
    setBarcodeScanning(true)
    setBarcodeResult(null)
    setBarcodeError(null)

    async function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        scanLoopRef.current = setTimeout(tick, 200)
        return
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext("2d")?.drawImage(video, 0, 0)
      try {
        const result = await reader.decodeFromCanvas(canvas)
        const code = result.getText().trim()
        setBarcodeScanning(false)
        const food = await getFoodByBarcode(code)
        if (food) {
          posthog.capture("food_barcode_scanned", {
            food_name: food.name,
            barcode: code,
          })
          setBarcodeResult(food)
        } else {
          setBarcodeError(`No food found for barcode ${code}`)
        }
      } catch (err) {
        if (
          err instanceof NotFoundException ||
          err instanceof ChecksumException ||
          err instanceof FormatException
        ) {
          // No barcode yet — keep scanning
          scanLoopRef.current = setTimeout(tick, 150)
        } else {
          setBarcodeScanning(false)
          setBarcodeError("Scan failed. Try again.")
        }
      }
    }

    void tick()

    return () => {
      if (scanLoopRef.current) clearTimeout(scanLoopRef.current)
      zxingRef.current = null
      setBarcodeScanning(false)
    }
  }, [mode, cameraState, useNativeCapture, posthog])

  // ── Snap & AI capture ─────────────────────────────────────────────────────

  async function processBarcodeBlob(blob: Blob) {
    const canvas = canvasRef.current
    if (!canvas) {
      setBarcodeError("Scan failed. Try again.")
      return
    }

    const imageUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = imageUrl

    try {
      await image.decode()
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext("2d")?.drawImage(image, 0, 0)
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromCanvas(canvas)
      const code = result.getText().trim()
      const food = await getFoodByBarcode(code)
      if (food) {
        setBarcodeResult(food)
        setBarcodeError(null)
      } else {
        setBarcodeError(`No food found for barcode ${code}`)
      }
    } catch {
      setBarcodeError("Scan failed. Try again.")
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }

  async function processSnapBlob(blob: Blob) {
    setSnapPhase("uploading")
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ""
      for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i])
      const base64Image = btoa(binary)

      const result = (await convexClient.action(api.logs.snap.snap, {
        base64Image,
        mimeType: blob.type || "image/jpeg",
      })) as { aiResult?: SnapAiResult }

      const aiResult = result.aiResult ?? {}
      const detections = snapDetectionsFromAiResult(aiResult)
      const reviewItems = await mapSnapDetectionsToReviewItems(
        detections,
        searchFoods
      )

      setSnapReviewItems(reviewItems)
      setSnapRaw(detections.map((detection) => detection.name).join(", "))
      setSnapPhase("results")
    } catch {
      setSnapPhase("error")
    }
  }

  async function handleNativeCapture() {
    try {
      const permission = await NativeCamera.requestPermissions()
      if (permission.camera !== "granted") {
        setCameraState("denied")
        return
      }
      const photo = await NativeCamera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 85,
        correctOrientation: true,
      })
      if (!photo.webPath) {
        if (mode === "snap") setSnapPhase("error")
        else setBarcodeError("Scan failed. Try again.")
        return
      }
      const blob = await fetch(photo.webPath).then((res) => res.blob())
      if (mode === "snap") {
        posthog.capture("food_snap_captured")
        await processSnapBlob(blob)
      } else {
        setBarcodeScanning(true)
        setBarcodeResult(null)
        setBarcodeError(null)
        await processBarcodeBlob(blob)
        setBarcodeScanning(false)
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : ""
      if (name === "UserCancelled" || name === "AbortError") return
      if (mode === "snap") setSnapPhase("error")
      else setBarcodeError("Scan failed. Try again.")
      setCameraState("denied")
    }
  }

  function handleShutter() {
    if (
      fired ||
      (!useNativeCapture && cameraState !== "active") ||
      snapPhase === "uploading"
    )
      return
    void hapticMedium()
    setFired(true)
    setTimeout(() => setFired(false), 500)

    if (useNativeCapture) {
      void handleNativeCapture()
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)

    posthog.capture("food_snap_captured")
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setSnapPhase("error")
          return
        }
        await processSnapBlob(blob)
      },
      "image/jpeg",
      0.85
    )
  }

  // ── Log a food item ───────────────────────────────────────────────────────

  async function handleAdd(item: FoodResult) {
    const entry = stripUndefined({
      id: Math.random().toString(36).slice(2),
      name: item.name,
      calories: Number(item.calories),
      protein: Number(item.protein),
      carbs: Number(item.carbs),
      fat: Number(item.fat),
      loggedAt: new Date().toISOString(),
      meal,
      source: "openfoodfacts" as const,
      foodCode: item.code,
      quantityGrams: 100,
      servingLabel: item.serving,
      imageUrl: item.imageUrl,
      openFoodFacts: item.openFoodFacts,
    })

    const existingEntries = foodLogs ?? []
    await setDay({ date, entries: [...existingEntries, entry] })

    posthog.capture("food_logged_from_camera", {
      food_name: item.name,
      calories: item.calories,
      meal,
      source: mode,
    })
    setAdded(item.id)
    setTimeout(() => setAdded(null), 1800)
  }

  async function handleConfirmSnapLog() {
    const entries = snapReviewItems
      .map((item) => buildSnapFoodLogEntry(item, meal))
      .filter((entry): entry is FoodLogEntry => entry !== null)

    if (entries.length === 0) return

    const existingEntries = foodLogs ?? []
    await setDay({ date, entries: [...existingEntries, ...entries] })

    posthog.capture("food_logged_from_camera", {
      food_count: entries.length,
      detected_count: snapReviewItems.length,
      meal,
      source: "snap_review",
    })

    setAdded("snap-review")
    setTimeout(() => {
      setAdded(null)
      setSnapPhase("idle")
      setSnapReviewItems([])
      setSnapRaw(null)
    }, 900)
  }

  function updateSnapReviewItem(
    id: string,
    updater: (item: SnapReviewItem) => SnapReviewItem
  ) {
    setSnapReviewItems((items) =>
      items.map((item) => (item.id === id ? updater(item) : item))
    )
  }

  // ── Mode switch reset ─────────────────────────────────────────────────────

  function switchMode(m: ScreenMode) {
    setMode(m)
    setSnapPhase("idle")
    setSnapReviewItems([])
    setSnapRaw(null)
    setBarcodeResult(null)
    setBarcodeError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const showResultsSheet =
    mode === "snap"
      ? snapPhase === "results" || snapPhase === "error"
      : barcodeResult !== null || barcodeError !== null

  return (
    <div className="relative h-svh w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Live feed ────────────────────────────────────────────────── */}
      {!useNativeCapture && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ display: cameraState === "active" ? "block" : "none" }}
        />
      )}

      {/* ── Permission / loading states ──────────────────────────────── */}
      {cameraState !== "active" && !useNativeCapture && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c0c]">
          {cameraState === "requesting" && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          )}
          {cameraState === "denied" && (
            <>
              <p className="text-[13px] font-medium text-white/70">
                Camera access denied
              </p>
              <p className="max-w-[200px] text-center text-[11px] text-white/35">
                Allow camera access in Settings to use Snap &amp; Log.
              </p>
            </>
          )}
          {cameraState === "unsupported" && (
            <p className="text-[13px] font-medium text-white/70">
              Camera not available
            </p>
          )}
        </div>
      )}

      {useNativeCapture && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c0c] px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04]">
            {mode === "snap" ? (
              <CameraIcon size={24} className="text-white/70" />
            ) : (
              <Barcode size={24} className="text-white/70" />
            )}
          </div>
          <p className="text-[15px] font-medium text-white/80">
            {mode === "snap" ? "Open native camera" : "Capture a barcode photo"}
          </p>
          <p className="max-w-[240px] text-[11px] leading-relaxed text-white/38">
            {mode === "snap"
              ? "iOS uses the native camera for more reliable capture."
              : "Take a clear photo of the barcode and OneRep will scan it after capture."}
          </p>
        </div>
      )}

      {/* ── Vignette ─────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* ── Shutter flash ────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 bg-white"
        style={{
          opacity: fired ? 0.32 : 0,
          transition: "opacity var(--motion-fast) var(--motion-ease-standard)",
        }}
      />

      {/* ── Viewfinder — snap corners / barcode box ───────────────────── */}
      {cameraState === "active" && mode === "snap" && (
        <>
          {(
            [
              "top-[18%] left-[10%] border-t border-l",
              "top-[18%] right-[10%] border-t border-r",
              "bottom-[24%] left-[10%] border-b border-l",
              "bottom-[24%] right-[10%] border-b border-r",
            ] as const
          ).map((cls, i) => (
            <div
              key={i}
              className={`pointer-events-none absolute h-8 w-8 border-white/40 ${cls}`}
            />
          ))}
          <div className="pointer-events-none absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
        </>
      )}

      {cameraState === "active" && mode === "barcode" && (
        <>
          {/* Barcode scan window */}
          <div className="pointer-events-none absolute top-[42%] left-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2">
            <div
              className="relative rounded-xl border border-white/25 bg-transparent"
              style={{ aspectRatio: "3/1.2" }}
            >
              {/* Corner accents */}
              {(
                [
                  "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
                  "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
                  "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
                  "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
                ] as const
              ).map((cls, i) => (
                <div
                  key={i}
                  className={`absolute h-5 w-5 border-white/70 ${cls}`}
                />
              ))}
              {/* Scan line */}
              {barcodeScanning && (
                <div className="scan-line absolute right-2 left-2 h-px bg-white/60" />
              )}
            </div>
            <p className="mt-3 text-center text-[11px] font-medium tracking-wide text-white/40">
              {barcodeScanning ? "Looking for barcode…" : "Point at a barcode"}
            </p>
          </div>
        </>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 right-0 left-0 flex items-center justify-between px-5 md:px-7"
        style={{
          paddingTop: "var(--app-safe-top)",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-black/45 text-white backdrop-blur-md transition-opacity active:opacity-60"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>

        {/* Mode toggle pill */}
        <div className="flex items-center gap-1 rounded-[14px] border border-white/10 bg-black/45 p-1 backdrop-blur-md">
          <button
            onClick={() => {
              void hapticTap()
              switchMode("snap")
            }}
            className={`flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-semibold transition-colors ${mode === "snap" ? "bg-white text-black" : "text-white/50"}`}
          >
            <CameraIcon size={12} weight="bold" />
            Snap
          </button>
          <button
            onClick={() => {
              void hapticTap()
              switchMode("barcode")
            }}
            className={`flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-semibold transition-colors ${mode === "barcode" ? "bg-white text-black" : "text-white/50"}`}
          >
            <Barcode size={12} weight="bold" />
            Scan
          </button>
        </div>

        <button
          onClick={() => setFlash((f) => !f)}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-black/45 text-white backdrop-blur-md transition-opacity active:opacity-60"
        >
          {flash ? (
            <Lightning
              size={16}
              weight="fill"
              style={{ color: APP_ACCENT_COLORS.caution }}
            />
          ) : (
            <LightningSlash size={16} className="text-white/60" />
          )}
        </button>
      </div>

      {/* ── Uploading pill (snap mode) ────────────────────────────────── */}
      {snapPhase === "uploading" && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: "calc(var(--app-safe-bottom-lg) + 6rem)",
          }}
        >
          <div className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md">
            <div className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/70" />
            <span className="text-[11px] font-medium text-white/70">
              Analysing…
            </span>
          </div>
        </div>
      )}

      {/* ── Bottom controls (snap mode only) ─────────────────────────── */}
      {(mode === "snap" || useNativeCapture) && snapPhase !== "uploading" && (
        <div
          className="absolute right-0 bottom-0 left-0 flex items-center justify-between px-10"
          style={{
            paddingBottom: "var(--app-safe-bottom-lg)",
            paddingTop: "1.5rem",
          }}
        >
          <button
            onClick={() =>
              setFacingMode((f) =>
                f === "environment" ? "user" : "environment"
              )
            }
            disabled={useNativeCapture || mode !== "snap"}
            className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/10 bg-black/45 text-white/70 backdrop-blur-md transition-opacity active:opacity-60 disabled:opacity-30"
          >
            <ArrowsClockwise size={18} />
          </button>

          <button
            onClick={handleShutter}
            disabled={!useNativeCapture && cameraState !== "active"}
            className="motion-pressable relative flex h-[76px] w-[76px] items-center justify-center rounded-full disabled:opacity-30"
            aria-label={mode === "barcode" ? "Capture barcode" : "Capture"}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white/30" />
            <div
              className="h-[60px] w-[60px] rounded-full bg-white"
              style={{
                transform: fired ? "scale(0.9)" : "scale(1)",
                transition:
                  "transform var(--motion-fast) var(--motion-ease-out)",
              }}
            />
          </button>

          <div className="h-11 w-11" />
        </div>
      )}

      {/* ── Results sheet ─────────────────────────────────────────────── */}
      {showResultsSheet && (
        <ResultsSheet
          mode={mode}
          snapReviewItems={snapReviewItems}
          snapRaw={snapRaw}
          snapError={snapPhase === "error"}
          barcodeResult={barcodeResult}
          barcodeError={barcodeError}
          meal={meal}
          onMealChange={setMeal}
          added={added}
          onAdd={handleAdd}
          onConfirmSnap={handleConfirmSnapLog}
          onSnapItemChange={updateSnapReviewItem}
          onRetake={() => {
            setSnapPhase("idle")
            setSnapReviewItems([])
            setSnapRaw(null)
            setBarcodeResult(null)
            setBarcodeError(null)
          }}
          onSearchManually={() => navigate("/foods/search")}
          onDismiss={() => {
            setSnapPhase("idle")
            setSnapReviewItems([])
            setSnapRaw(null)
            setBarcodeResult(null)
            setBarcodeError(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Results sheet ────────────────────────────────────────────────────────────

type ResultsSheetProps = {
  mode: ScreenMode
  snapReviewItems: SnapReviewItem[]
  snapRaw: string | null
  snapError: boolean
  barcodeResult: FoodResult | null
  barcodeError: string | null
  meal: MealType
  onMealChange: (m: MealType) => void
  added: string | null
  onAdd: (item: FoodResult) => void
  onConfirmSnap: () => void
  onSnapItemChange: (
    id: string,
    updater: (item: SnapReviewItem) => SnapReviewItem
  ) => void
  onRetake: () => void
  onSearchManually: () => void
  onDismiss: () => void
}

function ResultsSheet({
  mode,
  snapReviewItems,
  snapRaw,
  snapError,
  barcodeResult,
  barcodeError,
  meal,
  onMealChange,
  added,
  onAdd,
  onConfirmSnap,
  onSnapItemChange,
  onRetake,
  onSearchManually,
  onDismiss,
}: ResultsSheetProps) {
  const barcodeItems: FoodResult[] = barcodeResult ? [barcodeResult] : []
  const hasError = mode === "barcode" ? !!barcodeError : snapError
  const isSnap = mode === "snap"
  const itemsCount = isSnap ? snapReviewItems.length : barcodeItems.length
  const selectedSnapCount = snapReviewItems.filter(
    (item) => item.selected && item.food
  ).length
  const isEmpty = !hasError && itemsCount === 0
  const snapLogged = added === "snap-review"
  const snapCanLog = selectedSnapCount > 0
  const title = hasError
    ? "Something went wrong"
    : isEmpty
      ? "No matches found"
      : isSnap
        ? "Review foods"
        : barcodeResult!.name

  return (
    <div
      className="absolute right-0 bottom-0 left-0 flex max-h-[82vh] flex-col rounded-t-[18px] border-t border-white/10 bg-black/88 backdrop-blur-md md:right-6 md:bottom-6 md:left-auto md:w-[440px] md:rounded-[18px] md:border md:border-white/10 md:shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
      style={{ paddingBottom: "var(--app-safe-bottom)" }}
    >
      {/* Handle */}
      <div className="flex shrink-0 justify-center pt-3 pb-2">
        <div className="h-1 w-9 rounded-full bg-white/20" />
      </div>

      {/* Header row — fixed */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white">{title}</p>
          {!hasError && !isEmpty && isSnap && (
            <p className="mt-0.5 truncate text-[10.5px] text-white/40">
              {selectedSnapCount} selected
              {snapRaw ? ` · ${snapRaw}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/10 transition-opacity active:opacity-60"
        >
          <X size={13} weight="bold" className="text-white/60" />
        </button>
      </div>

      {/* Error / empty states */}
      {hasError && (
        <div className="shrink-0 px-5 pb-4">
          <p className="text-[12px] text-white/40">
            {mode === "barcode"
              ? barcodeError
              : "Couldn't analyse image. Try again."}
          </p>
          <ResultFallbackActions
            retakeLabel={mode === "barcode" ? "Scan again" : "Retake"}
            onRetake={onRetake}
            onSearchManually={onSearchManually}
          />
        </div>
      )}
      {isEmpty && (
        <div className="shrink-0 px-5 pb-4">
          <p className="text-[12px] text-white/40">
            {mode === "barcode"
              ? "No product found for this barcode."
              : "No matching foods found."}
          </p>
          <ResultFallbackActions
            retakeLabel={mode === "barcode" ? "Scan again" : "Retake"}
            onRetake={onRetake}
            onSearchManually={onSearchManually}
          />
        </div>
      )}

      {!hasError && !isEmpty && (
        <>
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-3 [&::-webkit-scrollbar]:hidden">
            {DEFAULT_MEAL_CATEGORIES.map((m) => (
              <button
                key={m.id}
                onClick={() => onMealChange(m.id)}
                className="shrink-0 rounded-[9px] px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors"
                style={
                  meal === m.id
                    ? { backgroundColor: m.bg, color: m.color }
                    : {
                        backgroundColor: "rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.35)",
                      }
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 [&::-webkit-scrollbar]:hidden">
            {isSnap ? (
              <div className="divide-y divide-white/[0.06]">
                {snapReviewItems.map((item) => (
                  <SnapReviewRow
                    key={item.id}
                    item={item}
                    meal={meal}
                    onChange={(updater) => onSnapItemChange(item.id, updater)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {barcodeItems.map((item) => (
                  <BarcodeResultRow
                    key={item.id}
                    item={item}
                    meal={meal}
                    added={added === item.id}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            )}
          </div>

          {isSnap && (
            <div className="shrink-0 border-t border-white/[0.06] px-5 pt-3 pb-3">
              <button
                type="button"
                onClick={snapCanLog ? onConfirmSnap : onSearchManually}
                disabled={snapLogged}
                className="flex min-h-11 w-full items-center justify-center rounded-[12px] px-4 text-[13px] font-semibold transition-all active:scale-[0.985] disabled:opacity-50"
                style={{
                  backgroundColor: snapLogged
                    ? tint(APP_ACCENT_COLORS.complete, 14)
                    : snapCanLog
                      ? "rgba(255,255,255,0.92)"
                      : "rgba(255,255,255,0.1)",
                  color: snapLogged
                    ? APP_ACCENT_COLORS.complete
                    : snapCanLog
                      ? "#000"
                      : "rgba(255,255,255,0.75)",
                }}
              >
                {snapLogged
                  ? "Logged"
                  : !snapCanLog
                    ? "Search manually"
                    : selectedSnapCount === 1
                      ? "Log 1 food"
                      : `Log ${selectedSnapCount} foods`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function mealConfig(meal: MealType) {
  return (
    DEFAULT_MEAL_CATEGORIES.find((category) => category.id === meal) ??
    DEFAULT_MEAL_CATEGORIES[0]
  )
}

function SnapReviewRow({
  item,
  meal,
  onChange,
}: {
  item: SnapReviewItem
  meal: MealType
  onChange: (updater: (item: SnapReviewItem) => SnapReviewItem) => void
}) {
  const food = item.food
  const scaled = food ? scaleFoodForGrams(food, item.grams) : null
  const selected = Boolean(item.selected && food)
  const mealCfg = mealConfig(meal)

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-white/[0.07]">
          <Fire
            size={11}
            weight="fill"
            style={{ color: APP_ACCENT_COLORS.food }}
          />
          <span className="mt-0.5 text-[10px] leading-none font-semibold text-white/70">
            {scaled ? scaled.calories : "--"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">
            {food?.name ?? item.detectedName}
          </p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate text-[10.5px] text-white/35">
              {food ? item.detectedName : "No searchable match"}
            </span>
            {food?.brand && <span className="text-white/20">·</span>}
            {food?.brand && (
              <span className="max-w-[9rem] truncate text-[10.5px] text-white/35">
                {food.brand}
              </span>
            )}
            {food && <span className="text-white/20">·</span>}
            {food && (
              <span className="text-[10.5px] text-white/35">
                {food.serving}
              </span>
            )}
          </div>

          {scaled && (
            <div className="mt-1 flex gap-2.5">
              <DarkMacroPill
                label="P"
                value={scaled.protein}
                color={MACRO_COLORS.protein}
              />
              <DarkMacroPill
                label="C"
                value={scaled.carbs}
                color={MACRO_COLORS.carbs}
              />
              <DarkMacroPill
                label="F"
                value={scaled.fat}
                color={MACRO_COLORS.fat}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!food}
          onClick={() =>
            onChange((current) => ({
              ...current,
              selected: food ? !current.selected : false,
            }))
          }
          aria-label={
            selected
              ? `Exclude ${item.detectedName}`
              : `Include ${item.detectedName}`
          }
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-all active:scale-[0.985] disabled:opacity-30"
          style={{
            backgroundColor: selected ? mealCfg.bg : "rgba(255,255,255,0.1)",
          }}
        >
          {selected ? (
            <span className="text-[11px]" style={{ color: mealCfg.color }}>
              ✓
            </span>
          ) : (
            <Plus size={13} weight="bold" className="text-white/50" />
          )}
        </button>
      </div>

      <div className="mt-2 pl-[52px]">
        <SnapQuantityControl
          grams={item.grams}
          disabled={!food}
          onChange={(grams) =>
            onChange((current) => ({
              ...current,
              grams,
              selected: Boolean(current.food),
            }))
          }
        />

        {item.alternatives.length > 1 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            {item.alternatives.slice(0, 4).map((alternative) => {
              const active = food?.id === alternative.id
              return (
                <button
                  key={alternative.id}
                  type="button"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      food: alternative,
                      selected: true,
                    }))
                  }
                  className="min-h-8 max-w-[9.5rem] shrink-0 rounded-[9px] px-2.5 text-[10.5px] font-semibold transition-all active:scale-[0.985]"
                  style={{
                    backgroundColor: active
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.08)",
                    color: active ? "#000" : "rgba(255,255,255,0.5)",
                  }}
                >
                  <span className="block truncate">{alternative.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SnapQuantityControl({
  grams,
  disabled,
  onChange,
}: {
  grams: number
  disabled: boolean
  onChange: (grams: number) => void
}) {
  const [inputValue, setInputValue] = useState(formatSnapGrams(grams))

  useEffect(() => {
    setInputValue(formatSnapGrams(grams))
  }, [grams])

  function commit(raw: string) {
    const next = Number(raw.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(next) && next > 0) {
      onChange(clampSnapGrams(next))
    } else {
      setInputValue(formatSnapGrams(grams))
    }
  }

  function step(direction: 1 | -1) {
    const increment = grams < 50 ? 5 : grams < 200 ? 10 : 25
    onChange(clampSnapGrams(grams + direction * increment))
  }

  return (
    <div className="grid grid-cols-[2rem_minmax(0,5rem)_2rem] items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault()
          step(-1)
        }}
        aria-label="Decrease quantity"
        className="flex h-8 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/50 transition-all active:scale-[0.985] disabled:opacity-30"
      >
        <Minus size={12} weight="bold" />
      </button>

      <label className="flex h-8 min-w-0 items-center justify-center rounded-[9px] bg-white/[0.08] px-2">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
          className="h-6 min-w-0 flex-1 bg-transparent text-center text-[12px] font-semibold text-white outline-none disabled:opacity-40"
        />
        <span className="ml-1 shrink-0 text-[10px] font-semibold text-white/35">
          g
        </span>
      </label>

      <button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault()
          step(1)
        }}
        aria-label="Increase quantity"
        className="flex h-8 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/50 transition-all active:scale-[0.985] disabled:opacity-30"
      >
        <Plus size={12} weight="bold" />
      </button>
    </div>
  )
}

function BarcodeResultRow({
  item,
  meal,
  added,
  onAdd,
}: {
  item: FoodResult
  meal: MealType
  added: boolean
  onAdd: (item: FoodResult) => void
}) {
  const mealCfg = mealConfig(meal)

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-white/[0.07]">
        <Fire
          size={11}
          weight="fill"
          style={{ color: APP_ACCENT_COLORS.food }}
        />
        <span className="mt-0.5 text-[10px] leading-none font-semibold text-white/70">
          {item.calories}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white">
          {item.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {item.brand && (
            <span className="truncate text-[10.5px] text-white/35">
              {item.brand}
            </span>
          )}
          {item.brand && <span className="text-white/20">·</span>}
          <span className="text-[10.5px] text-white/35">{item.serving}</span>
        </div>
        <div className="mt-1 flex gap-2.5">
          <DarkMacroPill
            label="P"
            value={item.protein}
            color={MACRO_COLORS.protein}
          />
          <DarkMacroPill
            label="C"
            value={item.carbs}
            color={MACRO_COLORS.carbs}
          />
          <DarkMacroPill label="F" value={item.fat} color={MACRO_COLORS.fat} />
        </div>
      </div>
      <button
        onClick={() => onAdd(item)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-all active:scale-[0.985]"
        style={{
          backgroundColor: added ? mealCfg.bg : "rgba(255,255,255,0.1)",
        }}
      >
        {added ? (
          <span className="text-[11px]" style={{ color: mealCfg.color }}>
            ✓
          </span>
        ) : (
          <Plus size={13} weight="bold" className="text-white/50" />
        )}
      </button>
    </div>
  )
}

function ResultFallbackActions({
  retakeLabel,
  onRetake,
  onSearchManually,
}: {
  retakeLabel: string
  onRetake: () => void
  onSearchManually: () => void
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onRetake}
        className="min-h-10 rounded-[10px] bg-white/10 px-3 text-[12px] font-semibold text-white/75 transition-opacity active:opacity-70"
      >
        {retakeLabel}
      </button>
      <button
        type="button"
        onClick={onSearchManually}
        className="min-h-10 rounded-[10px] bg-white px-3 text-[12px] font-semibold text-black transition-opacity active:opacity-80"
      >
        Search manually
      </button>
    </div>
  )
}

function DarkMacroPill({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span
        className="text-[9.5px] font-semibold"
        style={{ color, opacity: 0.7 }}
      >
        {label}
      </span>
      <span className="text-[10px] text-white/40">{value}g</span>
    </span>
  )
}
