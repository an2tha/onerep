import { useMemo, useState } from "react"
import {
  ArrowRight,
  Bug,
  Check,
  CheckCircle,
  Lightbulb,
  MagnifyingGlass,
  ThumbsUp,
  X,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { toast } from "@repo/ui"

import { api } from "../../../../convex/_generated/api"

type FeedbackKind = "bug" | "feature"

function errorMessage(error: unknown) {
  if (error instanceof ConvexError) return String(error.data)
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again."
}

function StatusBadge({ status }: { status: string }) {
  const copy =
    status === "approved"
      ? "On the board"
      : status === "completed"
        ? "Completed"
        : status === "declined"
          ? "Closed"
          : "In review"
  return (
    <span className="inline-flex min-h-7 items-center rounded-full bg-muted px-2.5 text-[12px] font-semibold text-muted-foreground">
      {copy}
    </span>
  )
}

function SubmissionForm({ kind }: { kind: FeedbackKind }) {
  const submit = useMutation(api.feedback.submit)
  const preferences = useQuery(api.users.users.getPreferences, {})
  const [title, setTitle] = useState("")
  const [details, setDetails] = useState("")
  const [saving, setSaving] = useState(false)
  const titleId = `feedback-${kind}-title`
  const detailsId = `feedback-${kind}-details`

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await submit({
        kind,
        title,
        details,
        appVersion: preferences?.lastAppVersion,
        platform: preferences?.lastPlatform,
      })
      setTitle("")
      setDetails("")
      toast.success(
        kind === "bug" ? "Bug report sent for review" : "Idea sent for review"
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-[var(--app-page-x)] pt-5">
      <div className="space-y-5">
        <label className="block" htmlFor={titleId}>
          <span className="native-row-title block">
            {kind === "bug" ? "What went wrong?" : "Give your idea a name"}
          </span>
          <span className="native-row-detail mt-0.5 block">
            Keep it short so the team can scan it quickly.
          </span>
          <input
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={5}
            maxLength={100}
            required
            placeholder={
              kind === "bug"
                ? "Workout timer stops early"
                : "Compare two workout weeks"
            }
            className="native-input mt-2 w-full"
          />
        </label>

        <label className="block" htmlFor={detailsId}>
          <span className="native-row-title block">
            {kind === "bug"
              ? "Help us reproduce it"
              : "What would this help you do?"}
          </span>
          <span className="native-row-detail mt-0.5 block">
            {kind === "bug"
              ? "Tell us what you expected, what happened, and the steps just before it."
              : "Describe the outcome you want rather than prescribing the interface."}
          </span>
          <textarea
            id={detailsId}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            minLength={20}
            maxLength={4000}
            required
            rows={6}
            placeholder={
              kind === "bug"
                ? "I started a rest timer after my third set…"
                : "I want to compare volume across two weeks so I can…"
            }
            className="native-input mt-2 w-full resize-y leading-6"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={
          saving || title.trim().length < 5 || details.trim().length < 20
        }
        aria-busy={saving}
        className="native-primary-button mt-6 w-full disabled:opacity-45"
      >
        {saving
          ? "Sending…"
          : kind === "bug"
            ? "Send bug report"
            : "Submit feature idea"}
      </button>
      <p className="native-row-detail mt-3 text-center">
        Submissions are reviewed before anything appears publicly.
      </p>
    </form>
  )
}

function ModerationQueue() {
  const items = useQuery(api.feedback.moderationQueue, {})
  const moderate = useMutation(api.feedback.moderate)
  const [workingId, setWorkingId] = useState<string | null>(null)

  async function decide(
    itemId: Parameters<typeof moderate>[0]["itemId"],
    status: "approved" | "declined" | "completed"
  ) {
    setWorkingId(itemId)
    try {
      await moderate({ itemId, status })
      toast.success(
        status === "approved" ? "Added to the board" : "Feedback closed"
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="px-[var(--app-page-x)]">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Moderation queue
        </h2>
        <p className="native-row-detail mt-0.5">
          Review private reports and choose which ideas reach the public board.
        </p>
      </div>
      {items === undefined ? (
        <p
          className="native-row-detail px-[var(--app-page-x)] py-6"
          role="status"
        >
          Loading queue…
        </p>
      ) : items.length === 0 ? (
        <p className="native-row-detail px-[var(--app-page-x)] py-6">
          The queue is clear.
        </p>
      ) : (
        <div className="mt-3 border-y border-border">
          {items.map((item) => (
            <article
              key={item._id}
              className="border-b border-border px-[var(--app-page-x)] py-4 last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">
                  {item.kind === "bug" ? (
                    <Bug size={19} />
                  ) : (
                    <Lightbulb size={19} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] leading-5 font-semibold">
                    {item.title}
                  </h3>
                  <p className="native-row-detail mt-1 whitespace-pre-wrap">
                    {item.details}
                  </p>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {item.authorName}
                    {item.platform ? ` · ${item.platform}` : ""}
                    {item.appVersion ? ` · ${item.appVersion}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.kind === "feature" && (
                      <button
                        type="button"
                        disabled={workingId === item._id}
                        onClick={() => void decide(item._id, "approved")}
                        className="feedback-small-action"
                      >
                        <Check size={15} weight="bold" /> Approve
                      </button>
                    )}
                    {item.kind === "bug" && (
                      <button
                        type="button"
                        disabled={workingId === item._id}
                        onClick={() => void decide(item._id, "completed")}
                        className="feedback-small-action"
                      >
                        <CheckCircle size={15} weight="bold" /> Resolved
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={workingId === item._id}
                      onClick={() => void decide(item._id, "declined")}
                      className="feedback-small-action"
                    >
                      <X size={15} weight="bold" /> Close
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function FeedbackSubmit({ onOpenBoard }: { onOpenBoard: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("bug")
  const mine = useQuery(api.feedback.mine, {})
  const viewer = useQuery(api.feedback.viewer, {})

  return (
    <>
      <p className="native-supporting px-[var(--app-page-x)] pb-4 md:max-w-xl">
        Tell us what is getting in your way, or help choose what OneRep builds
        next.
      </p>

      <div className="px-[var(--app-page-x)]">
        <div
          className="feedback-kind-tabs"
          role="tablist"
          aria-label="Feedback type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === "bug"}
            onClick={() => setKind("bug")}
            className="feedback-kind-tab"
          >
            <Bug size={18} /> Report a bug
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "feature"}
            onClick={() => setKind("feature")}
            className="feedback-kind-tab"
          >
            <Lightbulb size={18} /> Share an idea
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        key={kind}
        className=""
      >
        {kind === "feature" && (
          <button
            type="button"
            onClick={onOpenBoard}
            className="feedback-board-link"
          >
            <span>
              <span className="block text-[15px] font-semibold">
                Vote on feature ideas
              </span>
              <span className="native-row-detail mt-0.5 block">
                See what other members want most.
              </span>
            </span>
            <ArrowRight size={19} weight="bold" />
          </button>
        )}
        <SubmissionForm kind={kind} />
      </div>

      {(mine?.length ?? 0) > 0 && (
        <section className="mt-9">
          <div className="px-[var(--app-page-x)] pb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              Your recent feedback
            </h2>
          </div>
          <div className="border-y border-border">
            {mine?.slice(0, 5).map((item) => (
              <div
                key={item._id}
                className="flex items-start gap-3 border-b border-border px-[var(--app-page-x)] py-3.5 last:border-b-0"
              >
                <span className="mt-0.5 text-muted-foreground">
                  {item.kind === "bug" ? (
                    <Bug size={18} />
                  ) : (
                    <Lightbulb size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {item.title}
                  </span>
                  <span className="native-row-detail block capitalize">
                    {item.kind}
                  </span>
                </span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {viewer?.canModerate && <ModerationQueue />}
    </>
  )
}

export function FeatureBoard() {
  const features = useQuery(api.feedback.listFeatures, {})
  const toggleVote = useMutation(api.feedback.toggleVote)
  const [query, setQuery] = useState("")
  const [workingId, setWorkingId] = useState<string | null>(null)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return features ?? []
    return (features ?? []).filter((item) =>
      `${item.title} ${item.details}`.toLowerCase().includes(needle)
    )
  }, [features, query])

  async function vote(itemId: Parameters<typeof toggleVote>[0]["itemId"]) {
    setWorkingId(itemId)
    try {
      await toggleVote({ itemId })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <>
      <p className="native-supporting px-[var(--app-page-x)] pb-4 md:max-w-xl">
        Vote for the ideas that would make the biggest difference to you. The
        board is ordered by community support.
      </p>
      <div className="px-[var(--app-page-x)] pb-4">
        <label className="relative block">
          <span className="sr-only">Search feature ideas</span>
          <MagnifyingGlass
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            size={18}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search feature ideas"
            className="native-input w-full pl-10"
          />
        </label>
      </div>

      {features === undefined ? (
        <div role="status" className="px-[var(--app-page-x)] py-12 text-center">
          <div className="mx-auto size-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
          <p className="native-row-detail mt-3">Loading the feature board…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-[var(--app-page-x)] py-12 text-center">
          <Lightbulb size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-[15px] font-semibold">
            {query ? "No ideas match that search" : "No approved ideas yet"}
          </p>
          <p className="native-row-detail mx-auto mt-1 max-w-[20rem]">
            {query
              ? "Try a different word or clear the search."
              : "New ideas will appear here after moderation."}
          </p>
        </div>
      ) : (
        <div className="border-y border-border">
          {visible.map((item) => (
            <article
              key={item._id}
              className="flex items-start gap-4 border-b border-border px-[var(--app-page-x)] py-5 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => void vote(item._id)}
                disabled={workingId === item._id || item.status === "completed"}
                aria-pressed={item.hasVoted}
                aria-label={
                  item.status === "completed"
                    ? `Voting closed for ${item.title}`
                    : `${item.hasVoted ? "Remove vote from" : "Vote for"} ${item.title}`
                }
                className="feedback-vote-button"
              >
                <ThumbsUp
                  size={18}
                  weight={item.hasVoted ? "fill" : "regular"}
                />
                <span className="tabular-nums">{item.voteCount}</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-[16px] leading-5 font-semibold tracking-tight">
                    {item.title}
                  </h2>
                  {item.status === "completed" && (
                    <StatusBadge status="completed" />
                  )}
                </div>
                <p className="mt-2 text-[14px] leading-6 whitespace-pre-wrap text-muted-foreground">
                  {item.details}
                </p>
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Suggested by {item.authorName.split(/\s+/)[0]}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
