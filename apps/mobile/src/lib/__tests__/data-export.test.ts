import { describe, expect, test } from "bun:test"
import {
  canShareExportFile,
  downloadBlob,
  isShareCancelledError,
  jsonExportBlob,
  jsonExportFile,
  oneRepExportDocument,
  oneRepExportFilename,
  sha256Hex,
  shareOrDownloadJsonExport,
} from "../data-export"

describe("data export helpers", () => {
  test("builds a local-date OneRep export filename", () => {
    expect(oneRepExportFilename(new Date(2026, 0, 5, 9, 30))).toBe(
      "onerep-export-2026-01-05.json"
    )
  })

  test("serializes JSON with stable indentation", async () => {
    const blob = jsonExportBlob({ user: { name: "Ava" }, values: [1, 2] })
    expect(blob.type).toStartWith("application/json")
    expect(await blob.text()).toBe(
      JSON.stringify({ user: { name: "Ava" }, values: [1, 2] }, null, 2)
    )
  })

  test("wraps JSON as a named file for mobile sharing", async () => {
    const file = jsonExportFile({ ok: true }, "onerep-export.json")
    expect(file.name).toBe("onerep-export.json")
    expect(file.type).toStartWith("application/json")
    expect(await file.text()).toBe(JSON.stringify({ ok: true }, null, 2))
  })

  test("computes a SHA-256 checksum for export verification", async () => {
    expect(await sha256Hex("OneRep")).toBe(
      "53bc680a3a179082334a885615051099c40090298259a54a4aa814ec34c0dd07"
    )
  })

  test("wraps exported account data with metadata and checksum", async () => {
    const data = { user: { id: "user_1" }, workouts: [{ id: "w1" }] }
    const document = await oneRepExportDocument(data, {
      date: new Date("2026-01-05T09:30:00.000Z"),
    })

    expect(document).toEqual({
      _meta: {
        app: "OneRep",
        exportedAt: "2026-01-05T09:30:00.000Z",
        schemaVersion: 1,
        dataChecksum: {
          algorithm: "SHA-256",
          value: await sha256Hex(JSON.stringify(data)),
        },
      },
      data,
    })
  })

  test("still builds an export document when crypto digest is unavailable", async () => {
    const data = { ok: true }
    const document = await oneRepExportDocument(data, {
      date: new Date("2026-01-05T09:30:00.000Z"),
      cryptoApi: {} as Crypto,
    })

    expect(document).toEqual({
      _meta: {
        app: "OneRep",
        exportedAt: "2026-01-05T09:30:00.000Z",
        schemaVersion: 1,
      },
      data,
    })
  })

  test("detects file sharing support", () => {
    const file = jsonExportFile({ ok: true }, "onerep-export.json")
    expect(
      canShareExportFile(file, {
        canShare: ({ files }) => files?.[0] === file,
        share: async () => undefined,
      })
    ).toBe(true)
    expect(
      canShareExportFile(file, {
        canShare: () => false,
        share: async () => undefined,
      })
    ).toBe(false)
    expect(canShareExportFile(file, undefined)).toBe(false)
  })

  test("recognizes native share cancellation", () => {
    expect(isShareCancelledError({ name: "AbortError" })).toBe(true)
    expect(isShareCancelledError({ name: "NotAllowedError" })).toBe(false)
    expect(isShareCancelledError(new Error("AbortError"))).toBe(false)
  })

  test("returns cancelled when the native share sheet is dismissed", async () => {
    const result = await shareOrDownloadJsonExport(
      { ok: true },
      "onerep-export.json",
      {
        navigator: {
          canShare: () => true,
          share: async () => {
            throw { name: "AbortError" }
          },
        },
      }
    )

    expect(result).toBe("cancelled")
  })

  test("downloads exports when native file sharing is unavailable", async () => {
    let clickedHref = ""
    let appended = false
    let removed = false
    let revokedUrl = ""
    let scheduledRevoke: (() => void) | undefined
    const link = {
      href: "",
      download: "",
      click() {
        clickedHref = this.href
      },
      remove() {
        removed = true
      },
    }
    const documentLike = {
      createElement: () => link,
      body: {
        appendChild(node: typeof link) {
          appended = node === link
        },
      },
    } as unknown as Document
    const urlApi = {
      createObjectURL: () => "blob:onerep-export",
      revokeObjectURL(url: string) {
        revokedUrl = url
      },
    }

    const result = await shareOrDownloadJsonExport(
      { ok: true },
      "onerep-export.json",
      {
        navigator: {
          canShare: () => false,
          share: async () => undefined,
        },
        document: documentLike,
        urlApi,
        scheduleRevoke(callback) {
          scheduledRevoke = callback
        },
      }
    )

    expect(result).toBe("downloaded")
    expect(link.download).toBe("onerep-export.json")
    expect(clickedHref).toBe("blob:onerep-export")
    expect(appended).toBe(true)
    expect(removed).toBe(true)
    expect(revokedUrl).toBe("")

    scheduledRevoke?.()
    expect(revokedUrl).toBe("blob:onerep-export")
  })

  test("downloadBlob schedules object URL cleanup after the click", () => {
    const events: string[] = []
    let scheduledRevoke: (() => void) | undefined
    const link = {
      href: "",
      download: "",
      click() {
        events.push(`click:${this.href}`)
      },
      remove() {
        events.push("remove")
      },
    }
    const documentLike = {
      createElement: () => link,
      body: {
        appendChild() {
          events.push("append")
        },
      },
    } as unknown as Document
    const urlApi = {
      createObjectURL: () => "blob:scheduled-export",
      revokeObjectURL(url: string) {
        events.push(`revoke:${url}`)
      },
    }

    downloadBlob(
      new Blob(["{}"], { type: "application/json" }),
      "export.json",
      documentLike,
      urlApi,
      (callback) => {
        events.push("schedule")
        scheduledRevoke = callback
      }
    )

    expect(events).toEqual([
      "append",
      "click:blob:scheduled-export",
      "remove",
      "schedule",
    ])

    scheduledRevoke?.()
    expect(events).toContain("revoke:blob:scheduled-export")
  })
})
