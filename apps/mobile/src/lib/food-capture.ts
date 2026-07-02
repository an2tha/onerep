export type FoodCaptureMode = "barcode" | "snap"

export function parseFoodCaptureMode(value: string | null | undefined) {
  return value === "barcode" || value === "snap" ? value : "snap"
}

export function foodCapturePath(mode: FoodCaptureMode) {
  return `/camera?mode=${mode}`
}

export function canStartFoodCapture(mode: FoodCaptureMode, online: boolean) {
  return mode !== "snap" || online
}

export function foodCaptureUnavailableCopy(mode: FoodCaptureMode) {
  if (mode === "snap") {
    return {
      title: "Snap meal is offline",
      body: "Connect to the internet to analyse a meal photo. Barcode scan and food search are still available.",
    }
  }

  return {
    title: "Capture unavailable",
    body: "Check your connection and try again.",
  }
}
