type ClipboardLike = Pick<Clipboard, "writeText">

type ErrorDiagnosticOptions = {
  componentStack?: string
  date?: Date
  label?: string
  locationPath?: string
  userAgent?: string
}

function browserLocationPath() {
  if (typeof window === "undefined") return undefined
  return window.location.pathname
}

function browserUserAgent() {
  if (typeof navigator === "undefined") return undefined
  return navigator.userAgent
}

function browserClipboard() {
  if (typeof navigator === "undefined") return null
  return navigator.clipboard ?? null
}

export function buildErrorDiagnostics(
  error: Error,
  {
    componentStack,
    date = new Date(),
    label,
    locationPath = browserLocationPath(),
    userAgent = browserUserAgent(),
  }: ErrorDiagnosticOptions = {}
) {
  return JSON.stringify(
    {
      app: "OneRep",
      capturedAt: date.toISOString(),
      label: label ?? "this page",
      path: locationPath,
      userAgent,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      componentStack,
    },
    null,
    2
  )
}

export async function copyTextToClipboard(
  text: string,
  clipboard: ClipboardLike | null = browserClipboard()
) {
  if (!clipboard?.writeText) return false

  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
