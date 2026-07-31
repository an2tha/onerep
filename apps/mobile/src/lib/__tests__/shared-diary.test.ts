import { describe, expect, test } from "bun:test"
import {
  clampScopeRange,
  dateWithinScope,
  groupCommentsByEntry,
  isValidInviteEmail,
  normalizeInviteEmail,
  shareScopeLabel,
  unreadComments,
  type DiaryComment,
} from "@/lib/shared-diary"

function comment(overrides: Partial<DiaryComment> = {}): DiaryComment {
  return {
    authorUserId: "viewer",
    authorRole: "viewer",
    date: "2026-07-31",
    body: "Looks good",
    createdAt: 1_000,
    ...overrides,
  }
}

describe("normalizeInviteEmail", () => {
  test("trims and lowercases so both sides match exactly", () => {
    expect(normalizeInviteEmail("  Foo@Bar.COM ")).toBe("foo@bar.com")
  })

  test("non-string input is safe", () => {
    expect(normalizeInviteEmail(undefined as never)).toBe("")
  })
})

describe("isValidInviteEmail", () => {
  test("accepts a normal address regardless of casing or padding", () => {
    expect(isValidInviteEmail(" Coach@Example.com ")).toBe(true)
  })

  test("rejects malformed addresses", () => {
    expect(isValidInviteEmail("")).toBe(false)
    expect(isValidInviteEmail("nope")).toBe(false)
    expect(isValidInviteEmail("a@b")).toBe(false)
    expect(isValidInviteEmail("a b@c.com")).toBe(false)
  })
})

describe("shareScopeLabel", () => {
  test("reads naturally for each combination", () => {
    expect(shareScopeLabel({ diary: true, report: true, comments: true })).toBe(
      "Can see your diary, report and comments"
    )
    expect(shareScopeLabel({ diary: true, report: false, comments: false })).toBe(
      "Can see your diary"
    )
    expect(
      shareScopeLabel({ diary: false, report: false, comments: false })
    ).toBe("Nothing shared")
  })
})

describe("dateWithinScope", () => {
  test("an unbounded grant covers any date", () => {
    expect(dateWithinScope("2026-07-31")).toBe(true)
  })

  test("respects the start and end bounds", () => {
    expect(dateWithinScope("2025-12-31", "2026-01-01")).toBe(false)
    expect(dateWithinScope("2026-01-01", "2026-01-01")).toBe(true)
    expect(dateWithinScope("2026-08-01", undefined, "2026-07-31")).toBe(false)
    expect(dateWithinScope("2026-07-31", undefined, "2026-07-31")).toBe(true)
  })

  test("a reversed window covers nothing rather than throwing", () => {
    expect(dateWithinScope("2026-05-01", "2026-07-31", "2026-01-01")).toBe(false)
  })

  test("an empty date is not in scope", () => {
    expect(dateWithinScope("")).toBe(false)
  })
})

describe("clampScopeRange", () => {
  test("narrows a request to the granted window", () => {
    expect(
      clampScopeRange("2026-01-01", "2026-12-31", "2026-07-15", "2026-07-20")
    ).toEqual({ start: "2026-07-15", end: "2026-07-20" })
  })

  test("leaves a request already inside the window alone", () => {
    expect(
      clampScopeRange("2026-07-16", "2026-07-18", "2026-07-15", "2026-07-20")
    ).toEqual({ start: "2026-07-16", end: "2026-07-18" })
  })

  test("returns null when there is no overlap at all", () => {
    expect(
      clampScopeRange("2026-01-01", "2026-01-31", "2026-07-15", "2026-07-20")
    ).toBeNull()
  })

  test("returns null for a reversed request", () => {
    expect(clampScopeRange("2026-07-31", "2026-01-01")).toBeNull()
  })

  test("an unbounded grant passes the request through", () => {
    expect(clampScopeRange("2026-07-01", "2026-07-31")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    })
  })
})

describe("groupCommentsByEntry", () => {
  test("splits whole-day notes from per-entry threads", () => {
    const grouped = groupCommentsByEntry([
      comment({ body: "Good day overall" }),
      comment({ entryId: "e1", body: "Swap this out" }),
      comment({ entryId: "e1", body: "Agreed" }),
    ])
    expect(grouped.day).toHaveLength(1)
    expect(grouped.byEntryId.e1).toHaveLength(2)
  })

  test("empty and malformed input is safe", () => {
    expect(groupCommentsByEntry([])).toEqual({ day: [], byEntryId: {} })
    expect(groupCommentsByEntry(undefined as never).day).toEqual([])
  })
})

describe("unreadComments", () => {
  test("excludes the caller's own comments", () => {
    const unread = unreadComments(
      [
        comment({ authorUserId: "me", createdAt: 2_000 }),
        comment({ authorUserId: "coach", createdAt: 2_000 }),
      ],
      1_000,
      "me"
    )
    expect(unread).toHaveLength(1)
    expect(unread[0].authorUserId).toBe("coach")
  })

  test("excludes comments older than the last read time", () => {
    const unread = unreadComments(
      [
        comment({ authorUserId: "coach", createdAt: 500 }),
        comment({ authorUserId: "coach", createdAt: 1_500 }),
      ],
      1_000,
      "me"
    )
    expect(unread).toHaveLength(1)
  })

  test("a missing last-read time treats everything as unread", () => {
    const unread = unreadComments(
      [comment({ authorUserId: "coach" })],
      Number.NaN,
      "me"
    )
    expect(unread).toHaveLength(1)
  })

  test("empty input is safe", () => {
    expect(unreadComments([], 0, "me")).toEqual([])
    expect(unreadComments(undefined as never, 0, "me")).toEqual([])
  })
})
