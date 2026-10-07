import { useRef, useState } from "react"
import { useMutation } from "convex/react"
import { tr } from "@repo/ui/i18n"
import { MINIMUM_AGE } from "@repo/models"
import { api } from "../../../../../convex/_generated/api"
import type { Doc } from "../../../../../convex/_generated/dataModel"
import type { ProgrammeSettings } from "@repo/models"
import { programmeErrorMessage } from "@/lib/programme-errors"
import { ProgrammeField, ProgrammeNumber, commaList } from "@repo/ui/programmes"
import { ProgrammeAccordion } from "@repo/ui/programmes"

const flags = [
  ["under_18", "Under 18"],
  ["pregnant_or_breastfeeding", "Pregnant or breastfeeding"],
  ["diabetes", "Diabetes"],
  ["kidney_disease", "Kidney disease"],
  ["eating_disorder_history", "Eating disorder history"],
  ["active_treatment", "Active treatment"],
  ["major_gi_disorder", "Major GI disorder"],
  ["purging_laxatives", "Purging or laxative use"],
  ["fasting_cycles", "Fasting cycles"],
  ["binge_distress", "Binge distress"],
  ["fear_weight_gain", "Fear of weight gain"],
  ["compulsive_tracking", "Compulsive tracking"],
] as const

type Profile = Doc<"onboardingProfiles">
export function NutritionProfileEditor({
  profile,
  settings,
  onSaved,
  onCancel,
}: {
  profile: Profile | null | undefined
  settings: ProgrammeSettings
  onSaved: (profile: Profile) => void
  onCancel: () => void
}) {
  const save = useMutation(api.users.onboarding.saveNutritionProfile)
  const fields = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState("")
  const [value, setValue] = useState({
    age: profile?.age ?? NaN,
    heightCm: profile?.heightCm ?? NaN,
    nutritionGoal: profile?.nutritionGoal ?? "maintain",
    safetyMode: profile?.safetyMode ?? "standard",
    safetyFlags: profile?.safetyFlags ?? [],
    trackingMode: profile?.trackingMode ?? "full",
    dietType: profile?.dietType ?? settings.diet,
    allergies: (profile?.allergies ?? settings.allergies).join(", "),
    mealFrequency: profile?.mealFrequency ?? settings.mealsPerDay,
  })
  function patch(update: Partial<typeof value>) {
    setValue((current) => ({ ...current, ...update }))
  }
  async function submit() {
    if (lock.current) return
    for (const input of fields.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input, select") ?? []) {
      if (!input.reportValidity()) return
    }
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const saved = await save({
        ...value,
        allergies: commaList(value.allergies),
      })
      if (!saved)
        throw new Error(tr("Could not save your profile. Please try again."))
      onSaved(saved)
    } catch (cause) {
      setError(
        programmeErrorMessage(
          cause,
          tr("Could not save your profile. Please try again."),
        ),
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const options = [
    ...flags,
    ...value.safetyFlags
      .filter((flag) => flag !== "none" && !flags.some(([key]) => key === flag))
      .map((flag) => [flag, flag] as const),
  ]
  return (
    <section
      ref={fields}
      className="programmes-profile-editor"
      aria-label={tr("Nutrition profile")}
    >
      <h2>{tr("Nutrition profile")}</h2>
      <p className="programmes-muted">
        {tr("Updates your saved profile and this programme.")}
      </p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <div className="programmes-fields">
          <div className="programmes-field-pair">
            <ProgrammeNumber
              label="Age"
              value={value.age}
              min={MINIMUM_AGE}
              max={120}
              onChange={(age) => patch({ age })}
            />
            <ProgrammeNumber
              label="Height · cm"
              value={value.heightCm}
              min={80}
              max={250}
              step={0.1}
              onChange={(heightCm) => patch({ heightCm })}
            />
          </div>
          <ProgrammeField label="Nutrition goal">
            <select
              value={value.nutritionGoal}
              onChange={(event) =>
                patch({
                  nutritionGoal: event.target
                    .value as typeof value.nutritionGoal,
                })
              }
            >
              {[
                ["maintain", "Maintain"],
                ["lose_fat", "Lose fat"],
                ["gain_muscle", "Build muscle"],
                ["performance", "Performance"],
                ["macros_only", "Macros only"],
                ["medical", "Medical nutrition"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {tr(label!)}
                </option>
              ))}
            </select>
          </ProgrammeField>
          <ProgrammeField label="Nutrition guidance">
            <select
              value={value.safetyMode}
              onChange={(event) =>
                patch({
                  safetyMode: event.target.value as typeof value.safetyMode,
                })
              }
            >
              <option value="standard">{tr("Standard")}</option>
              <option value="habit">{tr("Habit focused")}</option>
              <option value="clinician">{tr("Clinician supervised")}</option>
              <option value="recovery">{tr("Recovery")}</option>
            </select>
          </ProgrammeField>
          <ProgrammeField label="Tracking mode">
            <select
              value={value.trackingMode}
              onChange={(event) =>
                patch({
                  trackingMode: event.target.value as typeof value.trackingMode,
                })
              }
            >
              <option value="full">{tr("Calories and macros")}</option>
              <option value="protein_calories">
                {tr("Protein and calories")}
              </option>
              <option value="photo_portion">{tr("Photos and portions")}</option>
              <option value="habit">{tr("Habit focused")}</option>
              <option value="recovery">{tr("Recovery")}</option>
            </select>
          </ProgrammeField>
          <ProgrammeAccordion
            title={tr("Health considerations")}
            defaultOpen={value.safetyFlags.some((flag) => flag !== "none")}
          >
            <div className="programmes-fields">
              {options.map(([key, label]) => (
                <label className="programmes-check" key={key}>
                  <input
                    type="checkbox"
                    checked={value.safetyFlags.includes(key)}
                    onChange={(event) =>
                      patch({
                        safetyFlags: event.target.checked
                          ? [
                              ...value.safetyFlags.filter(
                                (flag) => flag !== "none",
                              ),
                              key,
                            ]
                          : value.safetyFlags.filter((flag) => flag !== key),
                      })
                    }
                  />
                  <span>{tr(label)}</span>
                </label>
              ))}
            </div>
          </ProgrammeAccordion>
          <ProgrammeField label="Dietary preferences">
            <input
              required
              maxLength={120}
              value={value.dietType}
              onChange={(event) => patch({ dietType: event.target.value })}
            />
          </ProgrammeField>
          <ProgrammeField label="Allergies">
            <input
              maxLength={500}
              value={value.allergies}
              onChange={(event) => patch({ allergies: event.target.value })}
            />
          </ProgrammeField>
          <ProgrammeNumber
            label="Meals per day"
            value={value.mealFrequency}
            min={1}
            max={6}
            onChange={(mealFrequency) => patch({ mealFrequency })}
          />
        </div>
        <div className="programmes-actions">
          <button
            type="button"
            className="programmes-link"
            onClick={() => void submit()}
          >
            {busy ? tr("Saving…") : tr("Save nutrition profile")}
          </button>
          <button type="button" className="programmes-link" onClick={onCancel}>
            {tr("Cancel")}
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="programmes-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
