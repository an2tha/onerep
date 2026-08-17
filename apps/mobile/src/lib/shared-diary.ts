/**
 * Diary sharing: invite hygiene, scope maths and comment grouping.
 *
 * Authorization lives entirely on the server (`convex/lib/diaryAccess.ts`).
 * Nothing here is a security boundary — it exists so the UI can show the right
 * thing without a round trip.
 */

export type DiaryShareStatus = "pending" | "accepted" | "revoked" | "declined"

export type DiaryShareScope = {
  diary: boolean
  report: boolean
  comments: boolean
}

export type DiaryShare = {
  _id?: string
  id?: string
  ownerUserId: string
  ownerName?: string
  ownerEmail?: string
  inviteeEmail: string
  inviteeUserId?: string
  inviteeName?: string
  status: DiaryShareStatus
  scope: DiaryShareScope
  startDate?: string
  endDate?: string
  token: string
  invitedAt: number
}

export type DiaryComment = {
  _id?: string
  id?: string
  authorUserId: string
  authorName?: string
  authorRole: "owner" | "viewer"
  date: string
  entryId?: string
  body: string
  createdAt: number
  editedAt?: number
}

/** Invites are matched by exact string, so both sides must normalise the same. */
export function normalizeInviteEmail(email: string): string {
  return typeof email === "string" ? email.trim().toLowerCase() : ""
}

export function isValidInviteEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeInviteEmail(email))
}

/** "Diary, report and comments" — a plain-English summary of a grant. */
export function shareScopeLabel(scope: DiaryShareScope): string {
  const parts: string[] = []
  if (scope?.diary) parts.push("diary")
  if (scope?.report) parts.push("report")
  if (scope?.comments) parts.push("comments")
  if (parts.length === 0) return "Nothing shared"
  if (parts.length === 1) return `Can see your ${parts[0]}`
  const last = parts.pop()
  return `Can see your ${parts.join(", ")} and ${last}`
}

/** Whether a grant covers a date. Absent bounds mean unbounded. */
export function dateWithinScope(
  date: string,
  startDate?: string,
  endDate?: string
): boolean {
  if (typeof date !== "string" || date.length === 0) return false
  // A reversed window covers nothing rather than throwing.
  if (startDate && endDate && startDate > endDate) return false
  if (startDate && date < startDate) return false
  if (endDate && date > endDate) return false
  return true
}

/**
 * Narrows a requested range to a grant's window.
 *
 * Returns null when there is no overlap at all, so the UI can say "outside the
 * dates you were given" rather than rendering a confusingly empty report.
 */
export function clampScopeRange(
  start: string,
  end: string,
  startDate?: string,
  endDate?: string
): { start: string; end: string } | null {
  if (start > end) return null
  const clampedStart = startDate && startDate > start ? startDate : start
  const clampedEnd = endDate && endDate < end ? endDate : end
  if (clampedStart > clampedEnd) return null
  return { start: clampedStart, end: clampedEnd }
}

/** Splits a day's comments into whole-day notes and per-entry threads. */
export function groupCommentsByEntry(comments: DiaryComment[]): {
  day: DiaryComment[]
  byEntryId: Record<string, DiaryComment[]>
} {
  const day: DiaryComment[] = []
  const byEntryId: Record<string, DiaryComment[]> = {}

  for (const comment of comments ?? []) {
    if (!comment) continue
    if (!comment.entryId) {
      day.push(comment)
      continue
    }
    ;(byEntryId[comment.entryId] ??= []).push(comment)
  }

  return { day, byEntryId }
}

/**
 * Comments the viewer has not seen.
 *
 * Their own comments are excluded: the badge means "someone replied", not
 * "you typed something".
 */
export function unreadComments(
  comments: DiaryComment[],
  lastReadAt: number,
  selfUserId: string
): DiaryComment[] {
  const since = Number.isFinite(lastReadAt) ? lastReadAt : 0
  return (comments ?? []).filter(
    (comment) =>
      comment &&
      comment.createdAt > since &&
      comment.authorUserId !== selfUserId
  )
}

/** The link a recipient opens to claim an invite. Opens the app directly. */
export function diaryInviteLink(token: string): string {
  return `onerep://shared/accept?token=${encodeURIComponent(token)}`
}

/**
 * Hands the invite link to the native share sheet, falling back to the
 * clipboard where sharing is unavailable (desktop, simulators). No email is
 * sent server-side — this link IS the delivery mechanism.
 */
export async function shareDiaryInvite(
  token: string,
  inviteeEmail: string
): Promise<"shared" | "copied" | "failed"> {
  const link = diaryInviteLink(token)
  const text = `I'm sharing my OneRep food diary with you (${inviteeEmail}). Open this link on a phone with OneRep installed: ${link}`
  try {
    const { Share } = await import("@capacitor/share")
    await Share.share({
      title: "OneRep diary invitation",
      text,
      dialogTitle: "Send your diary invitation",
    })
    return "shared"
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return "copied"
    } catch {
      return "failed"
    }
  }
}
