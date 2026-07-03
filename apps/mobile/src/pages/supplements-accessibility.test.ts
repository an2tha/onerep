import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SUPPLEMENTS_SOURCE = readFileSync(
  new URL("./Supplements.tsx", import.meta.url),
  "utf8",
)

describe("Supplements page accessibility contract", () => {
  test("product lookup fields expose stable mobile form metadata", () => {
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-product-search"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement product search"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-product-barcode"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement product barcode"')
  })

  test("manual supplement fields are named and labeled", () => {
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-name"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement name"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-brand"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-barcode"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-serving-size"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-notes"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement notes"')
  })

  test("schedule controls expose names and selected weekday state", () => {
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-schedule-type"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement schedule"')
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-preferred-time"')
    expect(SUPPLEMENTS_SOURCE).toContain('aria-label="Supplement preferred time"')
    expect(SUPPLEMENTS_SOURCE).toContain("aria-pressed={active}")
    expect(SUPPLEMENTS_SOURCE).toContain(
      'aria-label={`${active ? "Remove" : "Add"} ${day.full} schedule day`}',
    )
  })

  test("serving multiplier input is named", () => {
    expect(SUPPLEMENTS_SOURCE).toContain('name="supplement-serving-multiplier"')
    expect(SUPPLEMENTS_SOURCE).toContain(
      'aria-label="Supplement serving multiplier"',
    )
  })

  test("product import and supplement save actions are guarded while busy", () => {
    expect(SUPPLEMENTS_SOURCE).toContain("if (searchBusy) return")
    expect(SUPPLEMENTS_SOURCE).toContain("if (importingCode) return")
    expect(SUPPLEMENTS_SOURCE).toContain("if (barcodeBusy) return")
    expect(SUPPLEMENTS_SOURCE).toContain("if (saving) return")
    expect(SUPPLEMENTS_SOURCE).toContain("onClose={saving ? () => {} : onClose}")
    expect(SUPPLEMENTS_SOURCE).toContain("closeOnBackdrop={!saving}")
    expect(SUPPLEMENTS_SOURCE).toContain("showHandle={!saving}")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={saving}")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={searchBusy}")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={barcodeBusy}")
    expect(SUPPLEMENTS_SOURCE).toContain("disabled={importingCode !== null}")
    expect(SUPPLEMENTS_SOURCE).toContain(
      "aria-busy={importingCode === result.code}",
    )
  })

  test("bulk supplement logging exposes busy state", () => {
    expect(SUPPLEMENTS_SOURCE).toContain("if (bulkLogging || remainingScheduledPlans.length === 0) return")
    expect(SUPPLEMENTS_SOURCE).toContain("disabled={bulkLogging}")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={bulkLogging}")
    expect(SUPPLEMENTS_SOURCE).toContain('{bulkLogging ? "Logging" : `Take ${remainingScheduledCount}`}')
    expect(SUPPLEMENTS_SOURCE).toContain("const [bulkLoggedFeedback, setBulkLoggedFeedback]")
    expect(SUPPLEMENTS_SOURCE).toContain("bulkLoggedFeedback && \"motion-success-pop\"")
  })

  test("individual supplement quick logging is single-flight and announced", () => {
    expect(SUPPLEMENTS_SOURCE).toContain(
      "const [quickLoggingId, setQuickLoggingId]",
    )
    expect(SUPPLEMENTS_SOURCE).toContain(
      "if (!item._id || quickLoggingId !== null) return",
    )
    expect(SUPPLEMENTS_SOURCE).toContain("setQuickLoggingId(supplementId)")
    expect(SUPPLEMENTS_SOURCE).toContain("setQuickLoggingId(null)")
    expect(SUPPLEMENTS_SOURCE).toContain("taking={quickLoggingId === plan.item._id}")
    expect(SUPPLEMENTS_SOURCE).toContain("quickLogging={quickLoggingId === item._id}")
    expect(SUPPLEMENTS_SOURCE).toContain("const [loggedFeedbackId, setLoggedFeedbackId]")
    expect(SUPPLEMENTS_SOURCE).toContain("recentlyLogged={loggedFeedbackId === plan.item._id}")
    expect(SUPPLEMENTS_SOURCE).toContain("recentlyLogged={loggedFeedbackId === item._id}")
    expect(SUPPLEMENTS_SOURCE).toContain("hapticSelection()")
    expect(SUPPLEMENTS_SOURCE).toContain("recentlyLogged && \"motion-success-pop\"")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={taking}")
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={quickLogging}")
    expect(SUPPLEMENTS_SOURCE).toContain("animate-spin")
  })

  test("delete confirmation waits for offline persistence before closing", () => {
    expect(SUPPLEMENTS_SOURCE).toContain("onConfirm: () => Promise<void>")
    expect(SUPPLEMENTS_SOURCE).toContain("const [deleting, setDeleting]")
    expect(SUPPLEMENTS_SOURCE).toContain("await onConfirm()")
    expect(SUPPLEMENTS_SOURCE).toContain(
      "onClose={deleting ? () => {} : onCancel}",
    )
    expect(SUPPLEMENTS_SOURCE).toContain("aria-busy={deleting}")
    expect(SUPPLEMENTS_SOURCE).toContain(
      '{deleting ? "Deleting..." : "Delete supplement"}',
    )
    expect(SUPPLEMENTS_SOURCE).toContain("await removeItem({")
  })
})
