import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const SHARED_SOURCE = readFileSync(
  new URL("./SharedDiary.tsx", import.meta.url),
  "utf8"
)
const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const REPORT_SOURCE = readFileSync(
  new URL("./NutritionReport.tsx", import.meta.url),
  "utf8"
)
const APP_SOURCE = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")
const MAIN_SOURCE = readFileSync(new URL("../main.tsx", import.meta.url), "utf8")
// Task-route registration lives with the navigation helpers, not the router.
const NAVIGATION_SOURCE = readFileSync(
  new URL("../lib/navigation.ts", import.meta.url),
  "utf8"
)
const OFFLINE_QUEUE_SOURCE = readFileSync(
  new URL("../lib/offline-queue.ts", import.meta.url),
  "utf8"
)

describe("the shared viewer is read only", () => {
  test("it never reaches for a food log mutation", () => {
    // The whole point of a separate page: no write path into someone's diary.
    expect(SHARED_SOURCE).not.toContain("api.logs.foodLogs.addEntry")
    expect(SHARED_SOURCE).not.toContain("api.logs.foodLogs.setDay")
    expect(SHARED_SOURCE).not.toContain("api.logs.foodLogs.updateEntry")
    expect(SHARED_SOURCE).not.toContain("api.logs.foodLogs.removeEntry")
  })

  test("it reads through the gated sharing queries only", () => {
    expect(SHARED_SOURCE).toContain("api.sharing.sharedDiary.getSharedDay")
    expect(SHARED_SOURCE).toContain("api.sharing.sharedDiary.getSharedProfile")
    expect(SHARED_SOURCE).not.toContain("api.logs.foodLogs.getDay")
  })

  test("the only mutations it can reach are comment-related", () => {
    expect(SHARED_SOURCE).toContain("api.sharing.diaryComments.add")
    expect(SHARED_SOURCE).toContain("api.sharing.diaryComments.markRead")
  })

  test("it tells the viewer when a date is outside their grant", () => {
    expect(SHARED_SOURCE).toContain("dateWithinScope(")
    expect(SHARED_SOURCE).toContain("Outside the dates you were given")
  })

  test("commenting is hidden when the grant does not allow it", () => {
    expect(SHARED_SOURCE).toContain("profile?.scope?.comments")
    expect(SHARED_SOURCE).toContain("canComment &&")
  })
})

describe("shared diary accessibility", () => {
  test("the comment control is labelled", () => {
    expect(SHARED_SOURCE).toContain('aria-label="Add comment"')
    expect(SHARED_SOURCE).toContain('aria-label="Comment on this day"')
  })

  test("revoke and leave actions name the person they affect", () => {
    expect(SHARED_SOURCE).toContain(
      "aria-label={`Revoke access for ${share.inviteeEmail}`}"
    )
    expect(SHARED_SOURCE).toContain("aria-label={`Leave the diary shared by ${")
  })

  test("invite accept and decline are labelled", () => {
    expect(SHARED_SOURCE).toContain('aria-label="Accept diary invitation"')
    expect(SHARED_SOURCE).toContain('aria-label="Decline diary invitation"')
  })

  test("day navigation is labelled", () => {
    expect(SHARED_SOURCE).toContain('aria-label="Previous day"')
    expect(SHARED_SOURCE).toContain('aria-label="Next day"')
  })
})

describe("sharing discoverability", () => {
  test("settings offers invite by email and revoke", () => {
    expect(SETTINGS_SOURCE).toContain('aria-label="Invite by email"')
    expect(SETTINGS_SOURCE).toContain('aria-label="Send diary invitation"')
    expect(SETTINGS_SOURCE).toContain(
      "aria-label={`Revoke access for ${share.inviteeEmail}`}"
    )
    expect(SETTINGS_SOURCE).toContain('navigate("/shared")')
  })

  test("unread comments surface on the Today dashboard", () => {
    expect(APP_SOURCE).toContain("api.sharing.diaryComments.unreadCount")
    expect(APP_SOURCE).toContain("new comment")
    expect(APP_SOURCE).toContain('aria-label="Dismiss diary comment notice"')
  })

  test("the page the badge lands on shows the comments and clears the badge", () => {
    // The dashboard notice navigates to /shared; without these, the owner
    // could never read what was said and the badge never went away.
    expect(SHARED_SOURCE).toContain("api.sharing.diaryComments.listRecent")
    expect(SHARED_SOURCE).toContain("Comments on your diary")
    expect(SHARED_SOURCE).toContain("void markRead({})")
  })

  test("a pending invite has a deliverable link", () => {
    // No invitation email exists server-side; the shareable deep link is the
    // only delivery mechanism, so both share lists must offer it.
    expect(SHARED_SOURCE).toContain("shareDiaryInvite(")
    expect(SETTINGS_SOURCE).toContain("shareDiaryInvite(")
    expect(SHARED_SOURCE).toContain(
      "aria-label={`Send invite link to ${share.inviteeEmail}`}"
    )
    expect(SETTINGS_SOURCE).toContain(
      "aria-label={`Send invite link to ${share.inviteeEmail}`}"
    )
  })

  test("a revoked grant degrades to a message, not a crash", () => {
    expect(SHARED_SOURCE).toContain("This diary is no longer shared with you")
    expect(SHARED_SOURCE).toContain("profile === null")
  })

  test("the report can render a shared range for a coach", () => {
    expect(REPORT_SOURCE).toContain("api.sharing.sharedDiary.getSharedRange")
    expect(REPORT_SOURCE).toContain('searchParams.get("ownerUserId")')
  })

  test("all three routes are registered and hide the bottom bar", () => {
    expect(MAIN_SOURCE).toContain('path: "/shared"')
    expect(MAIN_SOURCE).toContain('path: "/shared/accept"')
    expect(MAIN_SOURCE).toContain('path: "/shared/:ownerUserId"')
    expect(MAIN_SOURCE).toContain('label="Shared diary"')
    const prefixes = NAVIGATION_SOURCE.slice(
      NAVIGATION_SOURCE.indexOf("const TASK_ROUTE_PREFIXES")
    ).slice(0, 400)
    expect(prefixes).toContain('"/shared"')
  })

  test("the accept route is declared before the dynamic owner route", () => {
    // Otherwise "accept" would be swallowed as an owner id.
    expect(MAIN_SOURCE.indexOf('path: "/shared/accept"')).toBeLessThan(
      MAIN_SOURCE.indexOf('path: "/shared/:ownerUserId"')
    )
  })
})

describe("offline queue safety", () => {
  test("a revoked-permission error is terminal, not retried forever", () => {
    expect(OFFLINE_QUEUE_SOURCE).toContain("isNonRetryableError")
    expect(OFFLINE_QUEUE_SOURCE).toContain("no access to this diary")
  })

  test("comment mutations are queued but never coalesced", () => {
    expect(OFFLINE_QUEUE_SOURCE).toContain("sharing.diaryComments.add")
    const coalesced = OFFLINE_QUEUE_SOURCE.slice(
      OFFLINE_QUEUE_SOURCE.indexOf("SINGLETON_COALESCE_MUTATIONS")
    ).slice(0, 900)
    // Coalescing would silently drop all but the last comment.
    expect(coalesced).not.toContain("diaryComments")
  })
})
