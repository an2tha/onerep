import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { useQuery } from "convex/react"
import {
  ArrowLeft,
  ArrowUp,
  Barbell,
  BookOpen,
  Camera,
  ChartLineUp,
  ChatCircleDots,
  ClockCounterClockwise,
  ForkKnife,
  GearSix,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react"
import {
  NavigationBar,
  GroupedList,
  DisclosureRow,
  ToolbarButton,
} from "@repo/ui/components/mobile-ui"
import { Button } from "@repo/ui/components/ui/button"
import { Textarea } from "@repo/ui/components/ui/textarea"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import {
  ActiveGoals,
  DailyCheckIn,
  FocusTools,
  SavedResults,
  TrainingSnapshot,
  TodayContext,
} from "@/components/coach-center/Dashboard"
import { Briefing } from "@/components/coach-center/Briefing"
import { Atmosphere } from "@repo/ui/coach"
import {
  CenterResult,
  resultTitle,
} from "@/components/coach-center/CenterResult"
import { WeeklyReviewMoment } from "@/components/moments/weekly-review-moment"
import type { CoachCenterKind } from "../../../../packages/models/src/coach-center"
import "@/components/coach-center/center.css"
import "@/components/coach-center/briefing.css"
const Chat = lazy(() => import("./Coach"))
const Library = lazy(() =>
  import("@/components/coach-center/KnowledgeLibrary").then((m) => ({
    default: m.KnowledgeLibrary,
  })),
)
const tasks = [
  {
    kind: "review",
    label: () => tr("Review week"),
    icon: ClockCounterClockwise,
  },
  { kind: "plan", label: () => tr("Build a plan"), icon: Barbell },
  { kind: "progress", label: () => tr("Explore progress"), icon: ChartLineUp },
  { kind: "meals", label: () => tr("Plan meals"), icon: ForkKnife },
] as const
export default function CoachCenter({
  preview = false,
}: { preview?: boolean } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const [showReview, setShowReview] = useState(false)
  const [goalFocus, setGoalFocus] = useState<{ id: string; request: number }>()
  const [panel, setPanel] = useState<
    "checkin" | "goals" | "progress" | "saved" | "explore" | null
  >(null)
  const panelRef = useRef<HTMLElement>(null)
  const panelTrigger = useRef<HTMLElement | null>(null)
  function openPanel(next: NonNullable<typeof panel>) {
    if (!panelRef.current?.contains(document.activeElement))
      panelTrigger.current = document.activeElement as HTMLElement | null
    setPanel(next)
  }
  function closePanel() {
    setPanel(null)
    const target = panelTrigger.current?.isConnected
      ? panelTrigger.current
      : scroll.current?.querySelector<HTMLButtonElement>(
          ".center-browse button",
        )
    target?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!panel) return
    const frame = requestAnimationFrame(() => {
      if (panel === "checkin") {
        const details = panelRef.current?.querySelector("details")
        if (details) details.open = true
      }
      panelRef.current?.focus({ preventScroll: true })
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" })
    })
    return () => cancelAnimationFrame(frame)
  }, [panel])
  const scroll = useRef<HTMLDivElement>(null)
  const review = useQuery(api.ai.coachReviews.latest, {})
  const page = location.pathname.split("/")[2] || "home"
  const kind = tasks.find((t) => t.kind === page)?.kind
  const handoff =
    Boolean(location.state?.coachMode) ||
    new URLSearchParams(location.search).has("sleep")
  useEffect(() => {
    scroll.current?.scrollTo(0, 0)
  }, [location.pathname])
  const openChat = (
    text = "",
    centerResultKind?: CoachCenterKind,
    autoSend = false,
  ) =>
    navigate("/coach/chat", {
      state: {
        coachMode: "chat",
        initialInput: text,
        centerResultKind,
        autoSend,
      },
    })
  if (page === "chat" || handoff)
    return (
      <div className="coach-center-chat">
        <Suspense fallback={<p role="status">{tr("Loading Coach…")}</p>}>
          <Chat inCoachCenter />
        </Suspense>
      </div>
    )
  const library = page === "guides" || page === "glossary"
  return (
    <main
      className="coach-center desktop-canvas lg:pl-64"
      data-coach-home={page === "home"}
    >
      <Atmosphere quiet={page !== "home"} entrance={false} />
      <div className="center-shell" ref={scroll}>
        <NavigationBar
          title={
            kind
              ? resultTitle(kind)
              : page === "guides"
                ? tr("Improvement guides")
                : page === "glossary"
                  ? tr("Glossary")
                  : tr("Coach")
          }
          large={false}
          leading={
            page !== "home" && (
              <ToolbarButton
                aria-label={tr("Back to Coach")}
                onClick={() => navigate("/coach")}
              >
                <ArrowLeft size={20} />
              </ToolbarButton>
            )
          }
          trailing={
            <>
              <ToolbarButton
                aria-label={tr("Open Coach conversation")}
                onClick={() => openChat()}
              >
                <ChatCircleDots size={20} />
              </ToolbarButton>
              <ToolbarButton
                aria-label={tr("Settings")}
                onClick={() => navigate("/settings")}
              >
                <GearSix size={20} />
              </ToolbarButton>
            </>
          }
        />
        <div className="center-scroll">
          {page === "home" ? (
            <>
              <Briefing
                preview={preview}
                review={review}
                onReview={() => setShowReview(true)}
                onDiscuss={openChat}
                onGoal={(id) => {
                  setGoalFocus({ id, request: Date.now() })
                  openPanel("goals")
                }}
                onCheckIn={() => openPanel("checkin")}
              />
              <section
                className="center-home center-command-dock"
                aria-label={tr("Coach tools")}
              >
                <div className="center-portal-content">
                  <form
                    className="center-composer"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (draft.trim()) openChat(draft.trim(), undefined, true)
                    }}
                  >
                    <Textarea
                      aria-label={tr("Message Coach")}
                      placeholder={tr("Ask Coach…")}
                      rows={1}
                      value={draft}
                      maxLength={1200}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault()
                          if (draft.trim())
                            openChat(draft.trim(), undefined, true)
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!draft.trim()}
                      aria-label={tr("Send message")}
                    >
                      <ArrowUp size={20} />
                    </Button>
                  </form>
                </div>
              </section>
              <TodayContext
                onProgress={() => openPanel("progress")}
                onCheckIn={() => openPanel("checkin")}
                onGoal={(id) => {
                  setGoalFocus({ id, request: Date.now() })
                  openPanel("goals")
                }}
              />
              <nav className="center-browse" aria-label={tr("Coach tools")}>
                {(
                  [
                    ["progress", tr("Explore progress")],
                    ["saved", tr("Your Coach workspace")],
                    ["explore", tr("Explore")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    aria-expanded={panel === id}
                    aria-controls="coach-context"
                    onClick={() =>
                      panel === id ? closePanel() : openPanel(id)
                    }
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {panel && (
                <section
                  id="coach-context"
                  className="center-context"
                  ref={panelRef}
                  tabIndex={-1}
                  aria-label={
                    panel === "checkin"
                      ? tr("Daily check-in")
                      : panel === "goals"
                        ? tr("Your focus")
                        : panel === "progress"
                          ? tr("Explore progress")
                          : panel === "saved"
                            ? tr("Your Coach workspace")
                            : tr("Explore")
                  }
                >
                  <Button
                    className="center-context-close"
                    variant="ghost"
                    size="icon"
                    aria-label={tr("Close")}
                    onClick={closePanel}
                  >
                    <X size={18} />
                  </Button>
                  {panel === "checkin" && <DailyCheckIn onDiscuss={openChat} />}
                  {panel === "goals" && (
                    <ActiveGoals
                      onDiscuss={openChat}
                      focusGoal={goalFocus}
                      onlyGoalId={goalFocus?.id}
                    />
                  )}
                  {panel === "progress" && <TrainingSnapshot />}
                  {panel === "saved" && (
                    <>
                      <SavedResults />
                      <details className="center-workspace-goals">
                        <summary>{tr("Your focus")}</summary>
                        <ActiveGoals onDiscuss={openChat} />
                      </details>
                    </>
                  )}
                  {panel === "explore" && (
                    <>
                      <div className="center-section-heading">
                        <h2>{tr("Explore")}</h2>
                      </div>
                      <GroupedList label={tr("Coach tools")}>
                        {tasks.map(({ kind, label, icon: Icon }) => (
                          <DisclosureRow
                            key={kind}
                            title={label()}
                            leading={<Icon size={20} />}
                            onClick={() => navigate("/coach/" + kind)}
                          />
                        ))}
                        <DisclosureRow
                          title={tr("Daily check-in")}
                          leading={<ChatCircleDots size={20} />}
                          onClick={() => openPanel("checkin")}
                        />
                      </GroupedList>
                      <div className="center-resources">
                        <GroupedList>
                          <DisclosureRow
                            title={tr("Form check")}
                            leading={<Camera size={21} />}
                            onClick={() => navigate("/coach/chat?form=1")}
                          />
                          <DisclosureRow
                            title={tr("Improvement guides")}
                            leading={<BookOpen size={21} />}
                            onClick={() => navigate("/coach/guides")}
                          />
                          <DisclosureRow
                            title={tr("Glossary")}
                            leading={<MagnifyingGlass size={21} />}
                            onClick={() => navigate("/coach/glossary")}
                          />
                        </GroupedList>
                      </div>
                      <details className="center-secondary-tools">
                        <summary>{tr("Work on something specific")}</summary>
                        <FocusTools />
                      </details>
                    </>
                  )}
                </section>
              )}
            </>
          ) : kind ? (
            <CenterResult
              key={kind}
              kind={kind as CoachCenterKind}
              onDiscuss={openChat}
            />
          ) : library ? (
            <Suspense fallback={<p role="status">{tr("Loading library…")}</p>}>
              <Library mode={page} onModeChange={() => {}} onAsk={openChat} />
            </Suspense>
          ) : (
            <section className="center-result">
              <h2>{tr("Page not found")}</h2>
              <Button onClick={() => navigate("/coach")}>
                {tr("Back to Coach")}
              </Button>
            </section>
          )}
        </div>
      </div>
      {showReview && review && (
        <WeeklyReviewMoment
          review={review}
          onClose={() => setShowReview(false)}
        />
      )}
    </main>
  )
}
