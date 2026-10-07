import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { tr } from "@repo/ui/i18n";
import { defaultProgrammeSettings, type ProgrammeSettings } from "@repo/models";
import { useQuestionMotion } from "@/pages/onboarding/use-question-motion";
import { hapticOnboardingCue } from "@/lib/haptics";
import { ProgrammeAccordion, ProgrammeStars } from "./motion";
import {
  ProgrammeChoices,
  ProgrammeField,
  ProgrammeNumber,
  commaList,
} from "./fields";

export type ProgrammeTrackChoice = "nutrition" | "training" | "both";
export type SetupDraft = {
  settings: ProgrammeSettings;
  targetsSource?: "profile" | "default";
  track: ProgrammeTrackChoice;
  step: number;
  ids?: Partial<Record<"nutrition" | "training", string>>;
  requestIds?: Partial<Record<"nutrition" | "training", string>>;
  generationSignature?: string;
  completedTracks?: ("nutrition" | "training")[];
};

export function ProgrammeSetup({
  initial,
  busy,
  error,
  onSaveDraft,
  onComplete,
  onClose,
}: {
  initial: SetupDraft;
  busy: boolean;
  error: string;
  onSaveDraft: (draft: SetupDraft) => void;
  onComplete: (draft: SetupDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(initial.step);
  const form = useRef<HTMLFormElement>(null);
  const nutrition = draft.track !== "training";
  const training = draft.track !== "nutrition";
  const steps = [
    "mode",
    "track",
    "goal",
    ...(nutrition ? ["food", "targets"] : []),
    ...(training ? ["training"] : []),
    "review",
  ];
  const current = steps[Math.min(step, steps.length - 1)];
  const motion = useQuestionMotion(step, setStep);
  useEffect(() => {
    onSaveDraft({ ...draft, step });
  }, [draft, step, onSaveDraft]);
  function patch(value: Partial<ProgrammeSettings>) {
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...value } }));
  }
  function next() {
    if (!form.current?.reportValidity()) return;
    hapticOnboardingCue("continue");
    motion.goTo(Math.min(step + 1, steps.length - 1));
  }
  const s = draft.settings;
  const tracks =
    draft.track === "both" ? ["nutrition", "training"] : [draft.track];
  const completed =
    draft.generationSignature === JSON.stringify(draft.settings)
      ? (draft.completedTracks ?? [])
      : [];
  const cost =
    5 *
    tracks.filter(
      (track) => !completed.includes(track as "nutrition" | "training"),
    ).length;
  const headings: Record<string, string> = {
    mode: "How would you like to begin?",
    track: "What would you like help with?",
    goal: "Your goal.",
    food: "Food that fits your life.",
    targets: "Daily targets.",
    training: "Training on your terms.",
    review: "Your programme.",
  };
  return (
    <main
      className="programmes-screen"
      data-motion={motion.phase}
      data-dragging={motion.drag !== 0}
      style={
        {
          "--star-pan-x": `${10 - motion.panStage * 3}%`,
          "--star-pan-y": `${motion.panStage * -0.6}%`,
          "--star-drag": `${motion.drag * 0.12}px`,
          "--question-direction": motion.direction,
          "--question-drag": `${motion.drag}px`,
          "--question-leave-from": `${motion.departureDrag}px`,
        } as CSSProperties
      }
    >
      <div className="programmes-backdrop" aria-hidden="true" />
      <ProgrammeStars />
      <header>
        <button
          className="programmes-link"
          disabled={busy || motion.phase !== "idle"}
          aria-label={tr("Back")}
          onClick={() => (step > 0 ? motion.goTo(step - 1) : onClose())}
        >
          <ArrowLeft size={20} />
        </button>
        <span className="programmes-muted">
          {tr("Programme setup")} · {step + 1}/{steps.length}
        </span>
        <button className="programmes-link" disabled={busy} onClick={onClose}>
          {tr("Save & close")}
        </button>
      </header>
      <div
        {...motion.swipeHandlers(
          () => step > 0 && motion.goTo(step - 1),
          current === "review" ? undefined : next,
          busy,
        )}
      >
        <form
          ref={form}
          className="programmes-setup programmes-question"
          inert={motion.phase !== "idle" || undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (current === "review") void onComplete({ ...draft, step });
            else next();
          }}
        >
          <h1 id="setup-heading" tabIndex={-1}>
            {tr(headings[current]!)}
          </h1>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {current === "mode" && (
              <ProgrammeChoices
                value={s.mode}
                onChange={(mode) => patch({ mode })}
                options={[
                  {
                    value: "guided",
                    label: "Guided programme",
                  },
                  {
                    value: "manual",
                    label: "Create my own",
                  },
                ]}
              />
            )}
            {current === "track" && (
              <ProgrammeChoices
                value={draft.track}
                onChange={(track) => setDraft((d) => ({ ...d, track }))}
                options={[
                  {
                    value: "nutrition",
                    label: "Nutrition",
                  },
                  {
                    value: "training",
                    label: "Training",
                  },
                  {
                    value: "both",
                    label: "Both",
                  },
                ]}
              />
            )}
            {current === "goal" && (
              <div className="programmes-fields">
                <ProgrammeField label="Your goal">
                  <input
                    required
                    maxLength={300}
                    value={s.goal}
                    onChange={(e) => patch({ goal: e.target.value })}
                  />
                </ProgrammeField>
                <ProgrammeField label="Duration">
                  <select
                    value={s.weeks}
                    onChange={(e) => patch({ weeks: Number(e.target.value) })}
                  >
                    {[4, 6, 8, 12].map((weeks) => (
                      <option key={weeks} value={weeks}>
                        {weeks} {tr("weeks")}
                      </option>
                    ))}
                  </select>
                </ProgrammeField>
                <ProgrammeAccordion
                  title={tr("Name your programme")}
                  defaultOpen={!!s.name}
                >
                  <ProgrammeField label="Programme name">
                    <input
                      maxLength={100}
                      value={s.name}
                      placeholder={tr("My next chapter")}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </ProgrammeField>
                </ProgrammeAccordion>
              </div>
            )}
            {current === "food" && (
              <div className="programmes-fields">
                <ProgrammeField label="Dietary preferences">
                  <input
                    maxLength={300}
                    value={s.diet}
                    onChange={(e) => patch({ diet: e.target.value })}
                  />
                </ProgrammeField>
                <ProgrammeField
                  label="Allergies"
                  hint="Comma-separated, if any."
                >
                  <input
                    maxLength={500}
                    defaultValue={s.allergies.join(", ")}
                    onBlur={(e) =>
                      patch({ allergies: commaList(e.target.value) })
                    }
                  />
                </ProgrammeField>
                <div className="programmes-field-pair">
                  <ProgrammeNumber
                    label="Cooking time · minutes"
                    value={s.cookingMinutes}
                    min={5}
                    max={180}
                    onChange={(cookingMinutes) => patch({ cookingMinutes })}
                  />
                  <ProgrammeNumber
                    label="Meals each day"
                    value={s.mealsPerDay}
                    min={1}
                    max={6}
                    onChange={(mealsPerDay) => patch({ mealsPerDay })}
                  />
                </div>
                <ProgrammeAccordion title={tr("Food preferences")}>
                  <div className="programmes-fields">
                    <ProgrammeField label="Foods you dislike">
                      <input
                        maxLength={500}
                        defaultValue={s.dislikes.join(", ")}
                        onBlur={(e) =>
                          patch({ dislikes: commaList(e.target.value) })
                        }
                      />
                    </ProgrammeField>
                    <ProgrammeField label="Grocery budget">
                      <select
                        value={s.budget}
                        onChange={(e) => patch({ budget: e.target.value })}
                      >
                        {["Budget-friendly", "Moderate", "Flexible"].map(
                          (item) => (
                            <option key={item} value={item}>
                              {tr(item)}
                            </option>
                          ),
                        )}
                      </select>
                    </ProgrammeField>
                  </div>
                </ProgrammeAccordion>
              </div>
            )}
            {current === "targets" && (
              <div className="programmes-fields">
                <ProgrammeField label="Nutrition direction">
                  <select
                    value={s.nutritionGoal}
                    onChange={(e) =>
                      patch({
                        nutritionGoal: e.target
                          .value as ProgrammeSettings["nutritionGoal"],
                        changePercent: e.target.value === "maintain" ? 0 : 10,
                      })
                    }
                  >
                    <option value="maintain">
                      {tr("Maintain a consistent intake")}
                    </option>
                    <option value="step_down">
                      {tr("Gradually reduce intake")}
                    </option>
                    <option value="step_up">
                      {tr("Gradually increase intake")}
                    </option>
                  </select>
                </ProgrammeField>
                <ProgrammeNumber
                  label="Starting calories · kcal/day"
                  value={s.baselineCalories}
                  min={1600}
                  max={5000}
                  onChange={(baselineCalories) => patch({ baselineCalories })}
                />
                <div className="programmes-field-pair">
                  <ProgrammeNumber
                    label="Protein · g/day"
                    value={s.protein}
                    min={40}
                    max={300}
                    onChange={(protein) => patch({ protein })}
                  />
                  <ProgrammeNumber
                    label="Fat · g/day"
                    value={s.fat}
                    min={40}
                    max={150}
                    onChange={(fat) => patch({ fat })}
                  />
                </div>
                {s.nutritionGoal !== "maintain" && (
                  <ProgrammeNumber
                    label="Total change over programme · %"
                    value={s.changePercent}
                    min={5}
                    max={15}
                    step={5}
                    onChange={(changePercent) => patch({ changePercent })}
                  />
                )}
                <small>
                  {tr(
                    draft.targetsSource === "profile"
                      ? "From your saved profile."
                      : "Default values. Review these targets before continuing.",
                  )}
                </small>
                <label className="programmes-check">
                  <input
                    required
                    type="checkbox"
                    checked={s.screeningConfirmed}
                    onChange={(e) =>
                      patch({ screeningConfirmed: e.target.checked })
                    }
                  />
                  <span>
                    {tr(
                      "I’m 18 or older and do not need a supervised nutrition plan for pregnancy, breastfeeding, undernutrition, an eating disorder, or a medical condition or medication.",
                    )}
                  </span>
                </label>
              </div>
            )}
            {current === "training" && (
              <div className="programmes-fields">
                <div className="programmes-field-pair">
                  <ProgrammeNumber
                    label="Training days per week"
                    value={s.daysPerWeek}
                    min={1}
                    max={6}
                    onChange={(daysPerWeek) => patch({ daysPerWeek })}
                  />
                  <ProgrammeNumber
                    label="Session length · minutes"
                    value={s.sessionMinutes}
                    min={10}
                    max={180}
                    onChange={(sessionMinutes) => patch({ sessionMinutes })}
                  />
                </div>
                <ProgrammeField
                  label="Equipment"
                  hint="For example: dumbbells or bodyweight."
                >
                  <input
                    required
                    maxLength={500}
                    defaultValue={s.equipment.join(", ")}
                    onBlur={(e) =>
                      patch({ equipment: commaList(e.target.value) })
                    }
                  />
                </ProgrammeField>
                <ProgrammeAccordion title={tr("Preferences & limitations")}>
                  <div className="programmes-fields">
                    <ProgrammeField label="Training experience">
                      <select
                        value={s.experience}
                        onChange={(e) => patch({ experience: e.target.value })}
                      >
                        {["beginner", "intermediate", "advanced"].map(
                          (item) => (
                            <option key={item} value={item}>
                              {tr(item.charAt(0).toUpperCase() + item.slice(1))}
                            </option>
                          ),
                        )}
                      </select>
                    </ProgrammeField>
                    <ProgrammeField label="Exercises you enjoy">
                      <input
                        maxLength={500}
                        defaultValue={s.preferredExercises.join(", ")}
                        onBlur={(e) =>
                          patch({
                            preferredExercises: commaList(e.target.value),
                          })
                        }
                      />
                    </ProgrammeField>
                    <ProgrammeField label="Anything your plan should accommodate?">
                      <textarea
                        maxLength={1000}
                        value={s.limitations}
                        onChange={(e) => patch({ limitations: e.target.value })}
                      />
                    </ProgrammeField>
                  </div>
                </ProgrammeAccordion>
              </div>
            )}
            {current === "review" && (
              <>
                <ul className="programmes-list">
                  <li>
                    <strong>{s.name || s.goal}</strong>
                    <p>
                      {s.weeks} {tr("weeks")} ·{" "}
                      {tr(
                        draft.track === "both"
                          ? "Nutrition and training"
                          : draft.track === "nutrition"
                            ? "Nutrition"
                            : "Training",
                      )}
                    </p>
                  </li>
                </ul>
                {nutrition && (
                  <ProgrammeAccordion title={tr("Nutrition")}>
                    <p className="programmes-muted">
                      {s.baselineCalories} kcal · {s.protein}g {tr("protein")} ·{" "}
                      {s.fat}g {tr("fat")}
                    </p>
                    {s.mode === "guided" && (
                      <p className="programmes-muted">
                        {tr("12 recipes · 7-day meal plan")}
                      </p>
                    )}
                  </ProgrammeAccordion>
                )}
                {training && (
                  <ProgrammeAccordion title={tr("Training")}>
                    <p className="programmes-muted">
                      {s.daysPerWeek} {tr("days each week")} ·{" "}
                      {s.sessionMinutes} {tr("minutes per session")}
                    </p>
                  </ProgrammeAccordion>
                )}
                <p className="programmes-notice">
                  {completed.length > 0 &&
                    tr(
                      "Completed programme saved. Only the remainder is charged.",
                    )}{" "}
                  {s.mode === "guided"
                    ? tr(
                        "{{cost}} AI tokens total, 5 per programme. Failed attempts are free. Preview before starting.",
                        { cost },
                      )
                    : tr("No AI tokens.")}
                </p>
              </>
            )}
          </fieldset>
          {error && (
            <p className="programmes-error" role="alert">
              {error}
            </p>
          )}
          <div className="programmes-actions">
            <button className="programmes-link" disabled={busy} type="submit">
              {busy
                ? tr("Preparing your programme…")
                : current === "review"
                  ? s.mode === "guided"
                    ? tr("Generate · {{cost}} AI tokens", { cost })
                    : tr("Open programme builder")
                  : tr("Continue")}{" "}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
          {busy && (
            <p role="status">{tr("Your plans are saved as they finish.")}</p>
          )}
        </form>
      </div>
    </main>
  );
}

export function newSetupDraft(
  track: ProgrammeTrackChoice = "nutrition",
  mode: "guided" | "manual" = "guided",
): SetupDraft {
  return {
    track,
    step: 0,
    settings: {
      ...defaultProgrammeSettings(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
      mode,
    },
  };
}
