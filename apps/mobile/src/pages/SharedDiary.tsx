import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { TourAnchor } from "@/components/walkthrough/tour-anchor"
import {
  ArrowLeft,
  ChatCircle,
  PaperPlaneTilt,
  Printer,
  Trash,
  Users,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import {
  EmptyState,
  GroupedList,
  NavigationBar,
  PrimaryButton,
  SectionHeader,
  SummaryBlock,
  ToolbarButton,
  toast,
} from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import {
  currentDateKey,
  mealLabel,
  offsetDateKey,
  type FoodLogEntry,
} from "@/lib/food-log"
import {
  dateWithinScope,
  groupCommentsByEntry,
  shareDiaryInvite,
  shareScopeLabel,
  type DiaryComment,
  type DiaryShare,
} from "@/lib/shared-diary"

function formatDay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

/** Index: diaries shared with you, people you share with, pending invites. */
export default function SharedDiary() {
  const navigate = useSmoothNavigate()

  const incomingQuery = useQuery(api.sharing.diaryShares.listIncoming, {})
  const outgoingQuery = useQuery(api.sharing.diaryShares.listOutgoing, {})
  // Comments people left on the caller's own diary. This page is where the
  // dashboard's "new comments" notice lands, so it must actually show them.
  const myCommentsQuery = useQuery(api.sharing.diaryComments.listRecent, {
    limit: 20,
  })

  const leaveShare = useOfflineMutation(
    api.sharing.diaryShares.leaveShare,
    "sharing.diaryShares.leaveShare"
  )
  const revoke = useOfflineMutation(
    api.sharing.diaryShares.revoke,
    "sharing.diaryShares.revoke"
  )
  const markRead = useOfflineMutation(
    api.sharing.diaryComments.markRead,
    "sharing.diaryComments.markRead"
  )

  // Seeing the list is reading it: clears the dashboard badge.
  const commentsLoaded = myCommentsQuery !== undefined
  useEffect(() => {
    if (!commentsLoaded) return
    void markRead({}).catch(() => {
      // The badge just stays until the next visit.
    })
  }, [commentsLoaded, markRead])

  const incoming = (incomingQuery ?? []) as DiaryShare[]
  const outgoing = (outgoingQuery ?? []) as DiaryShare[]
  const myComments = (myCommentsQuery ?? []) as DiaryComment[]

  const accepted = incoming.filter((share) => share.status === "accepted")
  const pending = incoming.filter((share) => share.status === "pending")

  async function sendInviteLink(share: DiaryShare) {
    const result = await shareDiaryInvite(share.token, share.inviteeEmail)
    if (result === "copied") toast.success("Invite link copied")
    if (result === "failed") toast.error("Could not share the invite link")
  }

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title="Shared diaries"
        subtitle="Read-only access you gave or received"
        leading={
          <ToolbarButton
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        {pending.length > 0 && (
          <>
            <SectionHeader title="Invitations" />
            <GroupedList label="Pending invitations">
              {pending.map((share) => (
                <button
                  key={share.token}
                  type="button"
                  onClick={() =>
                    navigate(`/shared/accept?token=${share.token}`)
                  }
                  aria-label={`Review invitation from ${
                    share.ownerName ?? share.ownerEmail ?? "someone"
                  }`}
                  className="flex min-h-14 w-full items-center justify-between gap-2 px-1 py-2.5 text-left active:opacity-70"
                >
                  <span className="min-w-0">
                    <span className="native-row-title block truncate">
                      {share.ownerName ?? share.ownerEmail ?? "A OneRep user"}
                    </span>
                    <span className="native-row-detail block">
                      {shareScopeLabel(share.scope)}
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold text-[var(--accent-food)]">
                    Review
                  </span>
                </button>
              ))}
            </GroupedList>
          </>
        )}

        {myComments.length > 0 && (
          <>
            <SectionHeader title="Comments on your diary" />
            <GroupedList label="Comments on your diary">
              {myComments.map((comment) => (
                <button
                  key={comment.id ?? comment._id}
                  type="button"
                  onClick={() => navigate(`/nutrition?date=${comment.date}`)}
                  aria-label={`Open your diary on ${formatDay(comment.date)}`}
                  className="w-full px-1 py-2.5 text-left active:opacity-70"
                >
                  <p className="native-row-detail">
                    {comment.authorName ?? "Someone"} · {formatDay(comment.date)}
                  </p>
                  <p className="native-row-title mt-0.5 whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </button>
              ))}
            </GroupedList>
          </>
        )}

        <SectionHeader title="Shared with me" />
        {accepted.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No diaries shared with you"
            detail="When someone shares their food diary, it shows up here."
          />
        ) : (
          <TourAnchor anchor="shared-diaries" className="block">
            <GroupedList label="Diaries shared with me">
              {accepted.map((share) => (
                <div
                  key={share.id ?? share._id}
                  className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/shared/${share.ownerUserId}`)}
                    aria-label={`Open the diary shared by ${
                      share.ownerName ?? share.ownerEmail ?? "this user"
                    }`}
                    className="min-w-0 flex-1 text-left active:opacity-70"
                  >
                    <p className="native-row-title truncate">
                      {share.ownerName ?? share.ownerEmail ?? "A OneRep user"}
                    </p>
                    <p className="native-row-detail mt-0.5">
                      {shareScopeLabel(share.scope)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await leaveShare({
                          id: (share.id ?? share._id) as Id<"diaryShares">,
                        })
                        toast.success("You left this shared diary")
                      } catch (error) {
                        reportOfflineMutationError(error, "Could not leave")
                      }
                    }}
                    aria-label={`Leave the diary shared by ${
                      share.ownerName ?? share.ownerEmail ?? "this user"
                    }`}
                    className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                  >
                    <Trash size={17} weight="bold" />
                  </button>
                </div>
              ))}
            </GroupedList>
          </TourAnchor>
        )}

        <SectionHeader title="People I share with" />
        {outgoing.length === 0 ? (
          <EmptyState
            icon={Users}
            title="You are not sharing your diary"
            detail="Invite a coach or partner from Settings to share read-only access."
          />
        ) : (
          <GroupedList label="People I share with">
            {outgoing.map((share) => (
              <div
                key={share.id ?? share._id}
                className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="native-row-title truncate">
                    {share.inviteeName ?? share.inviteeEmail}
                  </p>
                  <p className="native-row-detail mt-0.5">
                    {share.status === "pending" ? "Invite sent · " : ""}
                    {shareScopeLabel(share.scope)}
                  </p>
                </div>
                {share.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => void sendInviteLink(share)}
                    aria-label={`Send invite link to ${share.inviteeEmail}`}
                    className="native-toolbar-button h-11 w-11 px-0 text-muted-foreground"
                  >
                    <PaperPlaneTilt size={17} weight="bold" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await revoke({
                        id: (share.id ?? share._id) as Id<"diaryShares">,
                      })
                      toast.success("Access revoked")
                    } catch (error) {
                      reportOfflineMutationError(
                        error,
                        "Could not revoke access"
                      )
                    }
                  }}
                  aria-label={`Revoke access for ${share.inviteeEmail}`}
                  className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                >
                  <Trash size={17} weight="bold" />
                </button>
              </div>
            ))}
          </GroupedList>
        )}
      </div>
    </div>
  )
}

/**
 * The read-only day view.
 *
 * Deliberately its own page rather than a flag threaded through Nutrition.tsx:
 * that file is ~3000 lines of write-capable UI, and a read-only mode inside it
 * would be one missed branch away from letting a viewer edit someone's log.
 * The only mutation reachable from here is adding a comment.
 */
export function SharedDiaryDay() {
  const navigate = useSmoothNavigate()
  const energyUnit = useEnergyUnit()
  const params = useParams()
  const ownerUserId = params.ownerUserId as string | undefined

  const [dateKey, setDateKey] = useState(() => currentDateKey())
  const [commentDraft, setCommentDraft] = useState("")
  const [posting, setPosting] = useState(false)

  const profile = useQuery(
    api.sharing.sharedDiary.getSharedProfile,
    ownerUserId ? { ownerUserId } : "skip"
  )
  // null means no grant (revoked, declined, or a stale link). Everything below
  // waits for the profile so a dead share renders a message, not a crash.
  const hasAccess = Boolean(profile)
  const inScope = profile
    ? dateWithinScope(dateKey, profile.startDate, profile.endDate)
    : true

  const day = useQuery(
    api.sharing.sharedDiary.getSharedDay,
    ownerUserId && hasAccess && inScope
      ? { ownerUserId, date: dateKey }
      : "skip"
  )
  const goals = useQuery(
    api.sharing.sharedDiary.getSharedGoals,
    ownerUserId && hasAccess ? { ownerUserId } : "skip"
  )
  const commentsQuery = useQuery(
    api.sharing.diaryComments.listForDay,
    ownerUserId && hasAccess ? { ownerUserId, date: dateKey } : "skip"
  )

  const addComment = useOfflineMutation(
    api.sharing.diaryComments.add,
    "sharing.diaryComments.add"
  )
  const markRead = useOfflineMutation(
    api.sharing.diaryComments.markRead,
    "sharing.diaryComments.markRead"
  )

  useEffect(() => {
    if (!ownerUserId || !hasAccess || commentsQuery === undefined) return
    void markRead({ ownerUserId }).catch(() => {
      // Not worth surfacing: the badge just stays until the next visit.
    })
  }, [ownerUserId, hasAccess, commentsQuery, markRead])

  const entries = useMemo(() => (day?.entries ?? []) as FoodLogEntry[], [day])
  const comments = useMemo(
    () => (commentsQuery ?? []) as DiaryComment[],
    [commentsQuery]
  )
  const { day: dayComments } = useMemo(
    () => groupCommentsByEntry(comments),
    [comments]
  )

  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
        }),
        { calories: 0, protein: 0 }
      ),
    [entries]
  )

  // Entries grouped by meal, mirroring how the owner sees their own day.
  const byMeal = useMemo(() => {
    const map = new Map<string, FoodLogEntry[]>()
    for (const entry of entries) {
      const meal = entry.meal || "other"
      const bucket = map.get(meal)
      if (bucket) bucket.push(entry)
      else map.set(meal, [entry])
    }
    return [...map.entries()]
  }, [entries])

  const canComment = profile?.scope?.comments ?? false

  async function handleComment() {
    const body = commentDraft.trim()
    if (!body || !ownerUserId) return
    setPosting(true)
    try {
      await addComment({ ownerUserId, date: dateKey, body })
      setCommentDraft("")
      toast.success("Comment added")
    } catch (error) {
      reportOfflineMutationError(error, "Could not add this comment")
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="native-page print-sheet mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        className="print-hidden"
        title={profile?.name ?? "Shared diary"}
        subtitle="Read only"
        leading={
          <ToolbarButton
            onClick={() => navigate("/shared")}
            aria-label="Back to shared diaries"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
        trailing={
          profile?.scope?.report && ownerUserId ? (
            <ToolbarButton
              onClick={() =>
                navigate(`/nutrition/report?ownerUserId=${ownerUserId}`)
              }
              aria-label="Open the shared nutrition report"
            >
              <Printer size={19} weight="bold" />
            </ToolbarButton>
          ) : undefined
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        <div className="print-hidden flex items-center justify-between gap-2">
          <ToolbarButton
            onClick={() => {
              hapticTap()
              setDateKey((current) => offsetDateKey(current, -1))
            }}
            aria-label="Previous day"
          >
            <ArrowLeft size={17} weight="bold" />
          </ToolbarButton>
          <span className="native-row-title">{formatDay(dateKey)}</span>
          <ToolbarButton
            onClick={() => {
              hapticTap()
              setDateKey((current) => offsetDateKey(current, 1))
            }}
            aria-label="Next day"
          >
            <ArrowLeft size={17} weight="bold" className="rotate-180" />
          </ToolbarButton>
        </div>

        {profile === null ? (
          <EmptyState
            icon={Users}
            title="This diary is no longer shared with you"
            detail="Access was revoked or the link is out of date."
          />
        ) : !inScope ? (
          <EmptyState
            icon={Users}
            title="Outside the dates you were given"
            detail={
              profile?.startDate || profile?.endDate
                ? `You can see ${profile?.startDate ?? "the start"} to ${
                    profile?.endDate ?? "today"
                  }.`
                : undefined
            }
          />
        ) : (
          <>
            <SummaryBlock
              tone="food"
              title="That day"
              value={
                <span className="tabular-nums">
                  {Math.round(totals.calories)} {energyUnit}
                </span>
              }
              detail={
                goals
                  ? `${Math.round(totals.protein)} g protein · goal ${
                      goals.calories
                    } ${energyUnit}`
                  : `${Math.round(totals.protein)} g protein`
              }
            />

            {entries.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nothing logged that day"
                detail="Try another date."
              />
            ) : (
              byMeal.map(([meal, mealEntries]) => (
                <div key={meal} className="print-block">
                  <SectionHeader title={mealLabel(meal)} />
                  <GroupedList label={`${mealLabel(meal)} entries`}>
                    {mealEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                      >
                        <p className="native-row-title min-w-0 flex-1 truncate">
                          {entry.name}
                        </p>
                        <p className="native-row-detail tabular-nums">
                          {Math.round(entry.calories)} {energyUnit}
                        </p>
                      </div>
                    ))}
                  </GroupedList>
                </div>
              ))
            )}

            <SectionHeader title="Notes" />
            {dayComments.length === 0 ? (
              <EmptyState
                icon={ChatCircle}
                title="No notes on this day"
                detail={
                  canComment
                    ? "Leave a note below."
                    : "You have read-only access without comments."
                }
              />
            ) : (
              <GroupedList label="Notes on this day">
                {dayComments.map((comment) => (
                  <div key={comment.id ?? comment._id} className="px-1 py-2.5">
                    <p className="native-row-detail">
                      {comment.authorName ?? "Someone"}
                      {comment.authorRole === "owner" ? " (owner)" : ""}
                    </p>
                    <p className="native-row-title mt-0.5 whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </GroupedList>
            )}

            {canComment && (
              <div className="print-hidden mt-3 flex items-center gap-2">
                <input
                  value={commentDraft}
                  placeholder="Leave a note"
                  aria-label="Comment on this day"
                  onChange={(event) => setCommentDraft(event.target.value)}
                  className="h-11 flex-1 rounded-xl border border-border bg-transparent px-3 outline-none"
                />
                <PrimaryButton
                  onClick={handleComment}
                  disabled={posting || commentDraft.trim().length === 0}
                  aria-label="Add comment"
                >
                  Post
                </PrimaryButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Accept or decline an invite reached from an emailed link. */
export function SharedAccept() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const invite = useQuery(
    api.sharing.diaryShares.getInviteByToken,
    token ? { token } : "skip"
  )
  const acceptInvite = useOfflineMutation(
    api.sharing.diaryShares.acceptInvite,
    "sharing.diaryShares.acceptInvite"
  )
  const declineInvite = useOfflineMutation(
    api.sharing.diaryShares.declineInvite,
    "sharing.diaryShares.declineInvite"
  )
  const [busy, setBusy] = useState(false)

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl text-foreground">
      <NavigationBar
        title="Diary invitation"
        leading={
          <ToolbarButton
            onClick={() => navigate("/shared")}
            aria-label="Back to shared diaries"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        {invite === null || !token ? (
          <EmptyState
            icon={Users}
            title="This invitation is not available"
            detail="It may have been withdrawn, already used, or sent to a different email address."
          />
        ) : invite === undefined ? (
          <EmptyState icon={Users} title="Loading invitation" />
        ) : (
          <div className="motion-content-in">
            <SummaryBlock
              tone="food"
              title={invite.ownerName ?? invite.ownerEmail ?? "A OneRep user"}
              value={<span>wants to share their diary</span>}
              detail={shareScopeLabel(invite.scope)}
            />
            {(invite.startDate || invite.endDate) && (
              <p className="native-row-detail mt-2">
                Limited to {invite.startDate ?? "the start"} –{" "}
                {invite.endDate ?? "today"}.
              </p>
            )}
            <div className="mt-4 flex items-center gap-2">
              <PrimaryButton
                disabled={busy}
                aria-label="Accept diary invitation"
                className="flex-1"
                onClick={async () => {
                  setBusy(true)
                  try {
                    await acceptInvite({ token })
                    toast.success("Invitation accepted")
                    navigate("/shared")
                  } catch (error) {
                    reportOfflineMutationError(
                      error,
                      "Could not accept this invitation"
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Accept
              </PrimaryButton>
              <button
                type="button"
                disabled={busy}
                aria-label="Decline diary invitation"
                className={cn(
                  "native-toolbar-button h-11 px-4",
                  busy && "opacity-50"
                )}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await declineInvite({ token })
                    toast.success("Invitation declined")
                    navigate("/shared")
                  } catch (error) {
                    reportOfflineMutationError(
                      error,
                      "Could not decline this invitation"
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
