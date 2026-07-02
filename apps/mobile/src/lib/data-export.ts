import { localDateKey } from "./utils"

export type ExportDelivery = "shared" | "downloaded" | "cancelled"

type ExportNavigator = Pick<Navigator, "canShare" | "share">
type ExportCrypto = Pick<Crypto, "subtle">

type ExportOptions = {
  navigator?: ExportNavigator
  document?: Document
  urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">
  scheduleRevoke?: (callback: () => void) => void
}

export type OneRepExportDocument<T = unknown> = {
  _meta: {
    app: "OneRep"
    exportedAt: string
    schemaVersion: 1
    dataChecksum?: {
      algorithm: "SHA-256"
      value: string
    }
  }
  data: T
}

export function oneRepExportFilename(date = new Date()) {
  return `onerep-export-${localDateKey(date)}.json`
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function sha256Hex(
  value: string,
  cryptoApi: ExportCrypto | undefined =
    typeof crypto === "undefined" ? undefined : crypto
) {
  if (!cryptoApi?.subtle?.digest) {
    throw new Error("SHA-256 digest is unavailable")
  }

  const bytes = new TextEncoder().encode(value)
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes)
  return bytesToHex(digest)
}

export async function oneRepExportDocument<T>(
  data: T,
  {
    date = new Date(),
    cryptoApi = typeof crypto === "undefined" ? undefined : crypto,
  }: {
    date?: Date
    cryptoApi?: ExportCrypto
  } = {}
): Promise<OneRepExportDocument<T>> {
  const document: OneRepExportDocument<T> = {
    _meta: {
      app: "OneRep",
      exportedAt: date.toISOString(),
      schemaVersion: 1,
    },
    data,
  }

  try {
    document._meta.dataChecksum = {
      algorithm: "SHA-256",
      value: await sha256Hex(JSON.stringify(data), cryptoApi),
    }
  } catch {
    // Export must still work on older WebViews without SubtleCrypto.
  }

  return document
}

export function jsonExportBlob(data: unknown) {
  return new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
}

export function jsonExportFile(data: unknown, filename: string) {
  return new File([jsonExportBlob(data)], filename, {
    type: "application/json",
  })
}

export function canShareExportFile(
  file: File,
  nav: ExportNavigator | undefined =
    typeof navigator === "undefined" ? undefined : navigator
) {
  return Boolean(
    nav &&
      typeof nav.share === "function" &&
      typeof nav.canShare === "function" &&
      nav.canShare({ files: [file] })
  )
}

export function isShareCancelledError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  )
}

export function downloadBlob(
  blob: Blob,
  filename: string,
  doc: Document = document,
  urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
  scheduleRevoke: (callback: () => void) => void = (callback) => {
    globalThis.setTimeout(callback, 0)
  }
) {
  const url = urlApi.createObjectURL(blob)
  const link = doc.createElement("a")
  link.href = url
  link.download = filename
  doc.body.appendChild(link)
  link.click()
  link.remove()
  scheduleRevoke(() => urlApi.revokeObjectURL(url))
}

export async function shareOrDownloadJsonExport(
  data: unknown,
  filename = oneRepExportFilename(),
  options: ExportOptions = {}
): Promise<ExportDelivery> {
  const file = jsonExportFile(data, filename)
  const nav =
    options.navigator ??
    (typeof navigator === "undefined" ? undefined : navigator)

  if (canShareExportFile(file, nav)) {
    try {
      await nav!.share({
        files: [file],
        title: "OneRep data export",
        text: "Your OneRep data export",
      })
      return "shared"
    } catch (error) {
      if (isShareCancelledError(error)) return "cancelled"
    }
  }

  downloadBlob(
    file,
    filename,
    options.document,
    options.urlApi,
    options.scheduleRevoke
  )
  return "downloaded"
}
