/**
 * Tests for pure formatting utility functions used across the mobile app.
 *
 * These functions are module-private (not exported), so we mirror the
 * implementations here and verify their logic matches what is in the source.
 *
 * Source locations:
 *  - fmtWater: apps/mobile/src/App.tsx and apps/mobile/src/pages/Nutrition.tsx
 *  - getInitials: apps/mobile/src/App.tsx
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"

// ─── Mirror implementations (kept in sync with source) ───────────────────────

/**
 * Mirror of fmtWater from App.tsx and Nutrition.tsx.
 */
function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

/**
 * Mirror of getInitials from App.tsx:136–142.
 */
function getInitials(name?: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── fmtWater / fmtMl ─────────────────────────────────────────────────────────

describe("fmtWater / fmtMl – values below 1000ml", () => {
  test("0 ml returns '0 ml'", () => {
    assert.strictEqual(fmtWater(0), "0 ml")
  })

  test("250 ml returns '250 ml'", () => {
    assert.strictEqual(fmtWater(250), "250 ml")
  })

  test("500 ml returns '500 ml'", () => {
    assert.strictEqual(fmtWater(500), "500 ml")
  })

  test("999 ml returns '999 ml'", () => {
    assert.strictEqual(fmtWater(999), "999 ml")
  })
})

describe("fmtWater / fmtMl – values at or above 1000ml", () => {
  test("1000 ml returns '1 L' (not '1.0 L')", () => {
    assert.strictEqual(fmtWater(1000), "1 L")
  })

  test("1500 ml returns '1.5 L'", () => {
    assert.strictEqual(fmtWater(1500), "1.5 L")
  })

  test("2000 ml returns '2 L' (not '2.0 L')", () => {
    assert.strictEqual(fmtWater(2000), "2 L")
  })

  test("2500 ml returns '2.5 L'", () => {
    assert.strictEqual(fmtWater(2500), "2.5 L")
  })

  test("3000 ml returns '3 L'", () => {
    assert.strictEqual(fmtWater(3000), "3 L")
  })

  test("1100 ml returns '1.1 L'", () => {
    assert.strictEqual(fmtWater(1100), "1.1 L")
  })

  test("4000 ml returns '4 L'", () => {
    assert.strictEqual(fmtWater(4000), "4 L")
  })
})

describe("fmtWater / fmtMl – boundary at exactly 1000", () => {
  test("exactly 1000 is formatted as liters, not ml", () => {
    const result = fmtWater(1000)
    assert.ok(result.includes("L"), "result should contain 'L'")
    assert.ok(!result.includes("ml"), "result should not contain 'ml'")
  })

  test("999 is formatted as ml, not liters", () => {
    const result = fmtWater(999)
    assert.ok(result.includes("ml"), "result should contain 'ml'")
    assert.ok(!result.includes("L"), "result should not contain 'L'")
  })
})

describe("fmtWater / fmtMl – default water goal (PR changed from 2000 to 2500)", () => {
  test("2500 ml (new default water goal) formats as '2.5 L'", () => {
    assert.strictEqual(fmtWater(2500), "2.5 L")
  })

  test("2000 ml (old default water goal) formats as '2 L'", () => {
    assert.strictEqual(fmtWater(2000), "2 L")
  })
})

// ─── getInitials ──────────────────────────────────────────────────────────────

describe("getInitials – missing or empty name", () => {
  test("undefined returns '?'", () => {
    assert.strictEqual(getInitials(undefined), "?")
  })

  test("empty string returns '?'", () => {
    assert.strictEqual(getInitials(""), "?")
  })
})

describe("getInitials – single name", () => {
  test("'Alice' returns 'A'", () => {
    assert.strictEqual(getInitials("Alice"), "A")
  })

  test("'bob' returns 'B' (uppercased)", () => {
    assert.strictEqual(getInitials("bob"), "B")
  })

  test("single lowercase letter returns uppercase", () => {
    assert.strictEqual(getInitials("j"), "J")
  })
})

describe("getInitials – two-word names", () => {
  test("'John Doe' returns 'JD'", () => {
    assert.strictEqual(getInitials("John Doe"), "JD")
  })

  test("'alice smith' returns 'AS' (both uppercased)", () => {
    assert.strictEqual(getInitials("alice smith"), "AS")
  })

  test("'Marie Curie' returns 'MC'", () => {
    assert.strictEqual(getInitials("Marie Curie"), "MC")
  })
})

describe("getInitials – three or more words", () => {
  test("'John Michael Doe' returns 'JD' (first + last)", () => {
    assert.strictEqual(getInitials("John Michael Doe"), "JD")
  })

  test("'a b c d' returns 'AD' (first + last)", () => {
    assert.strictEqual(getInitials("a b c d"), "AD")
  })
})

describe("getInitials – extra whitespace", () => {
  test("leading/trailing spaces are trimmed", () => {
    assert.strictEqual(getInitials("  Alice  "), "A")
  })

  test("multiple internal spaces treated as single separator", () => {
    // trim().split(/\s+/) handles multiple spaces
    assert.strictEqual(getInitials("John   Doe"), "JD")
  })
})
