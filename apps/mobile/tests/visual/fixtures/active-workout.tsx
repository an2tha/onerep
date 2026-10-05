import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { MobileSheet, dismissTopmost } from "@repo/ui"
import { FocusWorkoutView } from "../../../src/pages/active-workout/focus-view"
import {
  ActiveSetRow,
  SetListHeader,
} from "../../../src/pages/active-workout/set-rows"
import { WeightSelectorSheet } from "../../../src/pages/active-workout/weight-selector-sheet"
import {
  AbortSheet,
  AiWorkoutSheet,
  FinishSheet,
  RemoveExerciseSheet,
  ResumeWorkoutSheet,
  RetroSaveSheet,
  BrainDumpSheet,
} from "../../../src/pages/active-workout/session-sheets"
import { NotchRestTimer } from "../../../src/pages/active-workout/notch-rest-timer"
import {
  makeSet,
  type BarType,
  type WorkoutSet,
} from "../../../src/lib/workout-logging"
import "../../../src/styles/index.css"

const initialSets = Array.from({ length: 3 }, (_, index) => ({
  ...makeSet(),
  id: `set-${index}`,
  weight: "60",
  reps: "8",
  restSeconds: 90,
}))
const delay = () => new Promise((resolve) => setTimeout(resolve, 700))
document.addEventListener("fixture-device-back", () => dismissTopmost())

function Fixture() {
  const [sets, setSets] = useState<WorkoutSet[]>(initialSets)
  const [simple, setSimple] = useState(true)
  const [rest, setRest] = useState(false)
  const [sheet, setSheet] = useState("")
  const [nested, setNested] = useState(false)
  const [barType, setBarType] = useState<BarType>("olympic")
  const [barWeight, setBarWeight] = useState("")
  const [outcome, setOutcome] = useState("")
  const [calls, setCalls] = useState(0)
  const [date, setDate] = useState("2026-10-02")
  const [duration, setDuration] = useState(1800)
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const attempts = useRef<Record<string, number>>({})
  const index = sets.findIndex((set) => !set.completed)
  const done = sets.filter((set) => set.completed).length
  const update = (position: number, patch: WorkoutSet) =>
    setSets((current) =>
      current.map((set, i) => (i === position ? patch : set))
    )
  const close = () => setSheet("")
  async function submit(name: string) {
    setCalls((current) => current + 1)
    await delay()
    attempts.current[name] = (attempts.current[name] ?? 0) + 1
    if (attempts.current[name] === 1)
      throw new Error("Simulated connection failure")
    setOutcome(name)
    close()
  }
  return (
    <main
      className="min-h-svh bg-background text-foreground"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="mx-auto max-w-2xl pb-8">
        {simple ? (
          <FocusWorkoutView
            exerciseName="Single Arm Incline Dumbbell Bench Press"
            set={index < 0 ? null : sets[index]}
            allSets={sets}
            setNumber={index < 0 ? sets.length : index + 1}
            setCount={sets.length}
            unit="kg"
            barWeight={barWeight}
            barType={barType}
            isCardio={false}
            isResting={rest}
            restRemaining={75}
            restDuration={90}
            doneSets={done}
            totalSets={sets.length}
            nextExerciseName="Romanian Deadlift"
            onUpdateSet={(set) => update(index, set)}
            onWeightConfigChange={(change) => {
              if (change.weight !== undefined)
                update(index, { ...sets[index]!, weight: change.weight })
              if (change.barType) setBarType(change.barType)
              if (change.barWeight !== undefined) setBarWeight(change.barWeight)
            }}
            onCompleteSet={() => {
              if (index >= 0) {
                update(index, { ...sets[index]!, completed: true })
                setRest(true)
              }
            }}
            onSkipRest={() => setRest(false)}
            onAddSet={() => setSets((current) => [...current, makeSet()])}
            onSkipSet={() =>
              setSets((current) => current.filter((_, i) => i !== index))
            }
            onUncompleteSet={(i) => {
              update(i, { ...sets[i]!, completed: false })
              setRest(false)
            }}
            onShowInstructions={() => setSheet("instructions")}
            onExpand={() => setSimple(false)}
            onEnd={() => setSheet("leave")}
            onFinish={() => setSheet("finish")}
            isComplete={done > 0 && index < 0}
          />
        ) : (
          <div className="p-4">
            <button className="min-h-11" onClick={() => setSimple(true)}>
              Simple view
            </button>
            <section className="rounded-3xl border border-border bg-card">
              <h2 className="p-4 text-lg font-semibold">
                Single Arm Incline Dumbbell Bench Press
              </h2>
              <SetListHeader unit="kg" />
              {sets.map((set, i) => (
                <ActiveSetRow
                  key={set.id}
                  set={set}
                  index={i}
                  unit="kg"
                  onUpdate={(next) => update(i, next)}
                  onRepsChange={(reps) => update(i, { ...set, reps })}
                  onDelete={() =>
                    setSets((current) => current.filter((_, j) => j !== i))
                  }
                  canDelete={sets.length > 1}
                  onComplete={() => setRest(true)}
                  isNext={i === index}
                  barWeight={barWeight}
                  barType={barType}
                  onWeightConfigChange={(change) => {
                    if (change.weight !== undefined)
                      update(i, { ...set, weight: change.weight })
                  }}
                />
              ))}
            </section>
            <button className="min-h-11" onClick={() => setSheet("finish")}>
              Finish workout
            </button>
          </div>
        )}
        <nav
          className="flex flex-wrap gap-2 px-4 pt-4"
          aria-label="Fixture states"
        >
          {[
            "finish",
            "leave",
            "abort",
            "resume",
            "remove",
            "coach",
            "retro",
            "dictation",
            "parent",
            "empty",
          ].map((name) => (
            <button
              className="min-h-11 rounded-lg border border-border px-3"
              key={name}
              onClick={() => setSheet(name)}
            >
              Open {name}
            </button>
          ))}
        </nav>
        <output aria-label="Outcome">{outcome}</output>
        <output aria-label="Requests">{calls}</output>
        <div aria-label="background scroll" className="h-[100vh]" />
      </div>
      <NotchRestTimer
        remaining={!simple && rest ? 75 : null}
        duration={90}
        onSkip={() => setRest(false)}
      />
      {(sheet === "finish" || sheet === "empty") && (
        <FinishSheet
          elapsed={1800}
          totalSets={sheet === "empty" ? 0 : sets.length}
          doneSets={sheet === "empty" ? 0 : Math.max(1, done)}
          onFinish={() => submit("finished")}
          onCancel={close}
        />
      )}
      {(sheet === "leave" || sheet === "abort") && (
        <AbortSheet
          onConfirm={() => submit("discarded")}
          onCancel={close}
          onLeave={
            sheet === "leave"
              ? () => {
                  setOutcome("left with progress")
                  close()
                }
              : undefined
          }
          onFinish={sheet === "leave" ? () => setSheet("finish") : undefined}
        />
      )}
      {sheet === "resume" && (
        <ResumeWorkoutSheet
          source="local"
          savedAt={Date.now()}
          onResume={() => {
            setOutcome("resumed")
            close()
          }}
          onDiscard={() => submit("discarded")}
        />
      )}
      {sheet === "remove" && (
        <RemoveExerciseSheet
          exerciseName="Single Arm Incline Dumbbell Bench Press"
          onConfirm={() => {
            setOutcome("removed")
            close()
          }}
          onCancel={close}
        />
      )}
      {sheet === "coach" && (
        <AiWorkoutSheet
          target={null}
          loading={loading}
          contextReady
          contextSummary=""
          onClose={close}
          onAsk={async () => {
            setLoading(true)
            await delay()
            setLoading(false)
            return {
              reply: "Keep your completed sets and lower the remaining load.",
              mode: "replace",
              draft: {
                name: "Lighter upper body session",
                exercises: [
                  { name: "Bench Press", sets: [{ reps: "8", weight: "40" }] },
                ],
              },
            }
          }}
          onApply={() => submit("plan applied")}
        />
      )}
      {sheet === "retro" && (
        <RetroSaveSheet
          date={date}
          onDateChange={setDate}
          durationSeconds={duration}
          onDurationChange={setDuration}
          completedAt={completedAt}
          onCompletedAtChange={setCompletedAt}
          totalSets={3}
          doneSets={2}
          mode="create"
          onSave={() => submit("past saved")}
          onCancel={close}
        />
      )}
      {sheet === "dictation" && (
        <BrainDumpSheet
          unit="kg"
          pending={loading}
          onClose={close}
          onSubmit={async () => {
            setLoading(true)
            try {
              await submit("description saved")
            } finally {
              setLoading(false)
            }
          }}
        />
      )}
      {sheet === "instructions" && (
        <MobileSheet onClose={close} ariaLabel="Exercise instructions">
          <div className="p-5">
            <h2>Instructions</h2>
            <button onClick={close}>Close instructions</button>
          </div>
        </MobileSheet>
      )}
      {sheet === "parent" && (
        <MobileSheet onClose={close} ariaLabel="Parent sheet" minHeight="35vh">
          <div className="p-5">
            <button className="min-h-11" onClick={() => setNested(true)}>
              Open nested weight
            </button>
            <button className="min-h-11" onClick={() => dismissTopmost()}>
              Device back
            </button>
            <button className="min-h-11" onClick={close}>
              Close parent
            </button>
            {nested && (
              <WeightSelectorSheet
                currentWeight={sets[0]!.weight}
                barWeight={barWeight}
                barType={barType}
                unit="kg"
                onChange={() => {}}
                onClose={() => setNested(false)}
              />
            )}
          </div>
        </MobileSheet>
      )}
    </main>
  )
}

document.documentElement.classList.toggle(
  "dark",
  window.matchMedia("(prefers-color-scheme: dark)").matches
)
createRoot(document.getElementById("root")!).render(<Fixture />)
