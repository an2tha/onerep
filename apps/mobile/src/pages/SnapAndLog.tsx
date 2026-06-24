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
  type MealType,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import { api } from "../../../../convex/_generated/api"
import { convexClient } from "@/lib/convex"
import { usePostHog } from "@posthog/react"
import { hapticMedium, hapticTap } from "@/lib/haptics"
import type { FoodResult } from "@repo/models"
import { getFoodByBarcode, searchFoods } from "@/lib/openfoodfacts"

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
  const [snapResults, setSnapResults] = useState<FoodResult[]>([])
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
    void startCamera(facingMode, controller.signal)
    return () => {
      controller.abort()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
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
  }, [mode, cameraState, useNativeCapture])

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
      })) as any

      const aiResult = result.aiResult ?? {}
      const searchTerms = aiResult.foodName
        ? [aiResult.foodName]
        : (aiResult.ingredients ?? [])
            .map((ingredient: any) => ingredient.name)
            .filter(Boolean)
            .map(String)
            .slice(0, 5)
      const seen = new Set<string>()
      const foods: FoodResult[] = []

      for (const term of searchTerms) {
        const hits = await searchFoods(term, aiResult.foodName ? 5 : 2)
        for (const hit of hits) {
          if (seen.has(hit.id)) continue
          seen.add(hit.id)
          foods.push(hit)
        }
      }

      setSnapResults(foods)
      setSnapRaw(aiResult.foodName ?? null)
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

  // ── Mode switch reset ─────────────────────────────────────────────────────

  function switchMode(m: ScreenMode) {
    setMode(m)
    setSnapPhase("idle")
    setSnapResults([])
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/[0.03]">
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
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-75"
        style={{ opacity: fired ? 0.4 : 0 }}
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
        className="absolute top-0 right-0 left-0 flex items-center justify-between px-5"
        style={{
          paddingTop: "var(--app-safe-top)",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-opacity active:opacity-60"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>

        {/* Mode toggle pill */}
        <div className="flex items-center gap-0.5 rounded-full bg-black/40 p-1 backdrop-blur-md">
          <button
            onClick={() => {
              void hapticTap()
              switchMode("snap")
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${mode === "snap" ? "bg-white text-black" : "text-white/50"}`}
          >
            <CameraIcon size={12} weight="bold" />
            Snap
          </button>
          <button
            onClick={() => {
              void hapticTap()
              switchMode("barcode")
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${mode === "barcode" ? "bg-white text-black" : "text-white/50"}`}
          >
            <Barcode size={12} weight="bold" />
            Scan
          </button>
        </div>

        <button
          onClick={() => setFlash((f) => !f)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-opacity active:opacity-60"
        >
          {flash ? (
            <Lightning size={16} weight="fill" className="text-amber-400" />
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
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 backdrop-blur-md">
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md transition-opacity active:opacity-60"
          >
            <ArrowsClockwise size={18} />
          </button>

          <button
            onClick={handleShutter}
            disabled={!useNativeCapture && cameraState !== "active"}
            className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-30"
            aria-label={mode === "barcode" ? "Capture barcode" : "Capture"}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white/30" />
            <div
              className="h-[60px] w-[60px] rounded-full bg-white transition-transform duration-75"
              style={{ transform: fired ? "scale(0.87)" : "scale(1)" }}
            />
          </button>

          <div className="h-11 w-11" />
        </div>
      )}

      {/* ── Results sheet ─────────────────────────────────────────────── */}
      {showResultsSheet && (
        <ResultsSheet
          mode={mode}
          snapResults={snapResults}
          snapRaw={snapRaw}
          snapError={snapPhase === "error"}
          barcodeResult={barcodeResult}
          barcodeError={barcodeError}
          meal={meal}
          onMealChange={setMeal}
          added={added}
          onAdd={handleAdd}
          onRetake={() => {
            setSnapPhase("idle")
            setSnapResults([])
            setSnapRaw(null)
            setBarcodeResult(null)
            setBarcodeError(null)
          }}
          onSearchManually={() => navigate("/foods/search")}
          onDismiss={() => {
            setSnapPhase("idle")
            setSnapResults([])
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
  snapResults: FoodResult[]
  snapRaw: string | null
  snapError: boolean
  barcodeResult: FoodResult | null
  barcodeError: string | null
  meal: MealType
  onMealChange: (m: MealType) => void
  added: string | null
  onAdd: (item: FoodResult) => void
  onRetake: () => void
  onSearchManually: () => void
  onDismiss: () => void
}

function ResultsSheet({
  mode,
  snapResults,
  snapRaw,
  snapError,
  barcodeResult,
  barcodeError,
  meal,
  onMealChange,
  added,
  onAdd,
  onRetake,
  onSearchManually,
  onDismiss,
}: ResultsSheetProps) {
  const items: FoodResult[] =
    mode === "barcode" ? (barcodeResult ? [barcodeResult] : []) : snapResults

  const hasError = mode === "barcode" ? !!barcodeError : snapError
  const isEmpty = !hasError && items.length === 0

  return (
    <div
      className="absolute right-0 bottom-0 left-0 flex max-h-[78vh] flex-col rounded-t-3xl border-t border-white/10 bg-black/85 backdrop-blur-md md:right-6 md:bottom-6 md:left-auto md:w-[420px] md:rounded-3xl md:border md:border-white/10 md:shadow-2xl"
      style={{ paddingBottom: "var(--app-safe-bottom)" }}
    >
      {/* Handle */}
      <div className="flex shrink-0 justify-center pt-3 pb-2">
        <div className="h-1 w-10 rounded-full bg-white/20" />
      </div>

      {/* Header row — fixed */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-3">
        <div>
          <p className="text-[13px] font-semibold text-white">
            {hasError
              ? "Something went wrong"
              : isEmpty
                ? "No matches found"
                : mode === "barcode"
                  ? barcodeResult!.name
                  : snapRaw
                    ? `"${snapRaw}"`
                    : `${items.length} match${items.length !== 1 ? "es" : ""}`}
          </p>
          {!hasError && !isEmpty && mode === "snap" && snapRaw && (
            <p className="text-[10.5px] text-white/40">
              {items.length} food{items.length !== 1 ? "s" : ""} found
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-opacity active:opacity-60"
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
          {/* Meal selector — fixed */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-3 [&::-webkit-scrollbar]:hidden">
            {DEFAULT_MEAL_CATEGORIES.map((m) => (
              <button
                key={m.id}
                onClick={() => onMealChange(m.id)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors"
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

          {/* Scrollable items list */}
          <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 [&::-webkit-scrollbar]:hidden">
            <div className="divide-y divide-white/[0.06]">
              {items.map((item) => {
                const isAdded = added === item.id
                const mealCfg =
                  DEFAULT_MEAL_CATEGORIES.find((c) => c.id === meal) ??
                  DEFAULT_MEAL_CATEGORIES[0]
                return (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.07]">
                      <Fire
                        size={11}
                        weight="fill"
                        className="text-orange-400/70"
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
                        <span className="text-[10.5px] text-white/35">
                          {item.serving}
                        </span>
                      </div>
                      <div className="mt-1 flex gap-2.5">
                        <DarkMacroPill
                          label="P"
                          value={item.protein}
                          color="#60a5fa"
                        />
                        <DarkMacroPill
                          label="C"
                          value={item.carbs}
                          color="#a78bfa"
                        />
                        <DarkMacroPill
                          label="F"
                          value={item.fat}
                          color="#f59e0b"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(item)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90"
                      style={{
                        backgroundColor: isAdded
                          ? mealCfg.bg
                          : "rgba(255,255,255,0.1)",
                      }}
                    >
                      {isAdded ? (
                        <span
                          className="text-[11px]"
                          style={{ color: mealCfg.color }}
                        >
                          ✓
                        </span>
                      ) : (
                        <Plus
                          size={13}
                          weight="bold"
                          className="text-white/50"
                        />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
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
        className="min-h-10 rounded-xl bg-white/10 px-3 text-[12px] font-semibold text-white/75 transition-opacity active:opacity-70"
      >
        {retakeLabel}
      </button>
      <button
        type="button"
        onClick={onSearchManually}
        className="min-h-10 rounded-xl bg-white px-3 text-[12px] font-semibold text-black transition-opacity active:opacity-80"
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
