import { useState } from "react"
import { ArrowRight, Plus, Trash } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import type {
  ProgrammePlan,
  ProgrammeRecipe,
  ProgrammeSession,
  ProgrammeTrack,
} from "@repo/models"
import { ProgrammeField, ProgrammeNumber } from "./fields"
import { ProgrammeAccordion, ProgrammeTransition } from "./motion"

export const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
export type LibraryRecipe = ProgrammeRecipe
export type ExerciseOption = {
  id: string
  name: string
  equipment?: string
  primaryMuscles?: string[]
}
const id = () => crypto.randomUUID()
function emptyRecipe(): ProgrammeRecipe {
  return {
    id: id(),
    name: "",
    category: "Lunch",
    servings: 1,
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: [],
    steps: [],
  }
}

export function ProgrammePlanView({
  plan,
  track,
  editable = false,
  library = [],
  exercises = [],
  onChange,
  onLogMeal,
  onStartSession,
  active = false,
  busy = false,
  currentWeek = 1,
  today,
  loggedMealIds = [],
}: {
  plan: ProgrammePlan
  track: ProgrammeTrack
  editable?: boolean
  library?: LibraryRecipe[]
  exercises?: ExerciseOption[]
  onChange: (plan: ProgrammePlan) => void
  onLogMeal?: (mealId: string) => void
  onStartSession?: (session: ProgrammeSession) => void
  active?: boolean
  busy?: boolean
  currentWeek?: number
  today?: string
  loggedMealIds?: string[]
}) {
  const [day, setDay] = useState(() =>
    today ? new Date(`${today}T12:00:00`).getDay() : new Date().getDay(),
  )
  const [blockChoice, setBlockChoice] = useState<string | null>(null)
  const [recipeEditor, setRecipeEditor] = useState<ProgrammeRecipe | null>(null)
  const [recipeChoice, setRecipeChoice] = useState("")
  const [exerciseSearch, setExerciseSearch] = useState("")
  const nutrition = plan.nutrition ?? { recipes: [], meals: [] }
  const training = plan.training ?? { mesocycles: [], sessions: [] }
  const currentBlock = training.mesocycles.find(
    (block) => block.startWeek <= currentWeek && block.endWeek >= currentWeek,
  )
  const selectedBlock = training.mesocycles.some(
    (block) => block.id === blockChoice,
  )
    ? blockChoice
    : (currentBlock?.id ?? training.mesocycles[0]?.id)
  const updateNutrition = (value: Partial<typeof nutrition>) =>
    onChange({ ...plan, nutrition: { ...nutrition, ...value } })
  const updateTraining = (value: Partial<typeof training>) =>
    onChange({ ...plan, training: { ...training, ...value } })
  function saveRecipe(recipe: ProgrammeRecipe) {
    updateNutrition({
      recipes: [
        ...nutrition.recipes.filter((item) => item.id !== recipe.id),
        recipe,
      ],
    })
    setRecipeEditor(null)
  }
  const meals = nutrition.meals.filter((meal) => meal.day === day)
  const sessions = training.sessions.filter(
    (session) =>
      session.dayOfWeek === day &&
      (!session.blockId || session.blockId === selectedBlock),
  )
  const shopping = new Map<string, number>()
  for (const meal of nutrition.meals) {
    const recipe = nutrition.recipes.find((item) => item.id === meal.recipeId)
    for (const ingredient of recipe?.ingredients ?? [])
      shopping.set(
        ingredient.name,
        (shopping.get(ingredient.name) ?? 0) +
          (ingredient.grams * meal.servings) / (recipe?.servings || 1),
      )
  }
  return (
    <div className="programmes-plan">
      {track === "training" && training.mesocycles.length > 1 && (
        <ProgrammeField label="View training block">
          <select
            value={selectedBlock ?? ""}
            onChange={(event) => setBlockChoice(event.target.value)}
          >
            {training.mesocycles.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name} ·{" "}
                {tr("Weeks {{start}} to {{end}}", {
                  start: block.startWeek,
                  end: block.endWeek,
                })}
              </option>
            ))}
          </select>
        </ProgrammeField>
      )}
      <div className="programmes-week-days" aria-label={tr("Day of week")}>
        {WEEK_DAYS.map((name, index) => (
          <button
            key={name}
            aria-label={tr(name)}
            aria-pressed={day === index}
            onClick={() => setDay(index)}
          >
            {tr(name).slice(0, 3)}
          </button>
        ))}
      </div>
      <ProgrammeTransition viewKey={`${day}-${selectedBlock}-${editable}`}>
        <h3 className="sr-only">{tr(WEEK_DAYS[day]!)}</h3>
        {track === "nutrition" ? (
          <>
            {!meals.length && (
              <p className="programmes-muted">
                {tr("No meals planned for this day.")}
              </p>
            )}
            <ul className="programmes-list">
              {meals.map((meal) => {
                const recipe = nutrition.recipes.find(
                  (item) => item.id === meal.recipeId,
                )
                const calories =
                  recipe?.ingredients.reduce(
                    (sum, ingredient) =>
                      sum +
                      (ingredient.grams * ingredient.caloriesPer100) / 100,
                    0,
                  ) ?? 0
                const macro = (
                  key: "proteinPer100" | "carbsPer100" | "fatPer100",
                ) =>
                  Math.round(
                    ((recipe?.ingredients.reduce(
                      (sum, ingredient) =>
                        sum + (ingredient.grams * ingredient[key]) / 100,
                      0,
                    ) ?? 0) *
                      meal.servings) /
                      (recipe?.servings || 1),
                  )
                return (
                  <li key={meal.id}>
                    <span className="programmes-kicker">{meal.slot}</span>
                    <strong>{recipe?.name ?? tr("Choose a recipe")}</strong>
                    <p>
                      {tr(
                        "{{servings}} servings · {{calories}} kcal estimated",
                        {
                          servings: meal.servings,
                          calories: Math.round(
                            (calories * meal.servings) /
                              (recipe?.servings || 1),
                          ),
                        },
                      )}
                    </p>
                    <ProgrammeAccordion title={tr("Nutrition details")}>
                      <p>
                        {tr(
                          "{{protein}}g protein · {{carbs}}g carbs · {{fat}}g fat",
                          {
                            protein: macro("proteinPer100"),
                            carbs: macro("carbsPer100"),
                            fat: macro("fatPer100"),
                          },
                        )}
                      </p>
                    </ProgrammeAccordion>
                    {editable && (
                      <div className="programmes-fields">
                        <ProgrammeField label="Recipe">
                          <select
                            value={meal.recipeId}
                            onChange={(e) =>
                              updateNutrition({
                                meals: nutrition.meals.map((item) =>
                                  item.id === meal.id
                                    ? { ...item, recipeId: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          >
                            {nutrition.recipes.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </ProgrammeField>
                        <div className="programmes-field-pair">
                          <ProgrammeNumber
                            label="Servings"
                            value={meal.servings}
                            min={0.25}
                            max={10}
                            step={0.25}
                            onChange={(servings) =>
                              updateNutrition({
                                meals: nutrition.meals.map((item) =>
                                  item.id === meal.id
                                    ? { ...item, servings }
                                    : item,
                                ),
                              })
                            }
                          />
                          <ProgrammeField label="Move to">
                            <select
                              value={meal.day}
                              onChange={(e) =>
                                updateNutrition({
                                  meals: nutrition.meals.map((item) =>
                                    item.id === meal.id
                                      ? { ...item, day: Number(e.target.value) }
                                      : item,
                                  ),
                                })
                              }
                            >
                              {WEEK_DAYS.map((name, index) => (
                                <option key={name} value={index}>
                                  {tr(name)}
                                </option>
                              ))}
                            </select>
                          </ProgrammeField>
                        </div>
                        <ProgrammeField label="Meal">
                          <select
                            value={meal.slot}
                            onChange={(e) =>
                              updateNutrition({
                                meals: nutrition.meals.map((item) =>
                                  item.id === meal.id
                                    ? { ...item, slot: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          >
                            {["Breakfast", "Lunch", "Dinner", "Snack"].map(
                              (slot) => (
                                <option key={slot} value={slot}>
                                  {tr(slot)}
                                </option>
                              ),
                            )}
                          </select>
                        </ProgrammeField>
                        <button
                          className="programmes-link"
                          onClick={() =>
                            updateNutrition({
                              meals: nutrition.meals.filter(
                                (item) => item.id !== meal.id,
                              ),
                            })
                          }
                        >
                          {tr("Remove meal")}
                        </button>
                      </div>
                    )}
                    {active && !editable && onLogMeal && (
                      <button
                        className="programmes-link"
                        disabled={busy || loggedMealIds.includes(meal.id)}
                        onClick={() => onLogMeal(meal.id)}
                      >
                        {loggedMealIds.includes(meal.id)
                          ? tr("Logged today")
                          : tr("Log this meal today")}{" "}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            {editable && nutrition.recipes.length > 0 && (
              <button
                className="programmes-link"
                onClick={() =>
                  updateNutrition({
                    meals: [
                      ...nutrition.meals,
                      {
                        id: id(),
                        day,
                        slot:
                          meals.length === 0
                            ? "Breakfast"
                            : meals.length === 1
                              ? "Lunch"
                              : meals.length === 2
                                ? "Dinner"
                                : "Snack",
                        recipeId: nutrition.recipes[0]!.id,
                        servings: 1,
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                {tr("Add meal")}
              </button>
            )}
            <ProgrammeAccordion
              key={`recipes-${editable}`}
              defaultOpen={editable && nutrition.recipes.length === 0}
              title={
                <>
                  {tr("Recipes")} · {nutrition.recipes.length}
                </>
              }
            >
              {nutrition.recipes.map((recipe) => (
                <ProgrammeAccordion key={recipe.id} title={recipe.name}>
                  <p className="programmes-muted">
                    {recipe.category} ·{" "}
                    {recipe.prepMinutes + recipe.cookMinutes} {tr("minutes")} ·{" "}
                    {recipe.servings} {tr("servings")}
                  </p>
                  <ul className="programmes-recipe-ingredients">
                    {recipe.ingredients.map((ingredient, i) => (
                      <li key={i}>
                        {ingredient.grams}g {ingredient.name}
                      </li>
                    ))}
                  </ul>
                  <ol className="programmes-recipe-ingredients">
                    {recipe.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {editable && (
                    <div className="programmes-actions">
                      <button
                        className="programmes-link"
                        onClick={() => setRecipeEditor(structuredClone(recipe))}
                      >
                        {tr("Edit recipe")}
                      </button>
                      <button
                        className="programmes-link"
                        onClick={() =>
                          updateNutrition({
                            recipes: nutrition.recipes.filter(
                              (item) => item.id !== recipe.id,
                            ),
                            meals: nutrition.meals.filter(
                              (meal) => meal.recipeId !== recipe.id,
                            ),
                          })
                        }
                      >
                        {tr("Remove recipe and its planned meals")}
                      </button>
                    </div>
                  )}
                </ProgrammeAccordion>
              ))}
              {editable && (
                <>
                  <div className="programmes-fields">
                    <ProgrammeField label="Add one of your saved recipes">
                      <select
                        value={recipeChoice}
                        onChange={(e) => setRecipeChoice(e.target.value)}
                      >
                        <option value="">{tr("Choose a recipe")}</option>
                        {library
                          .filter(
                            (recipe) =>
                              !nutrition.recipes.some(
                                (item) =>
                                  item.recipeId &&
                                  item.recipeId === recipe.recipeId,
                              ),
                          )
                          .map((recipe) => (
                            <option key={recipe.id} value={recipe.id}>
                              {recipe.name}
                            </option>
                          ))}
                      </select>
                    </ProgrammeField>
                    <button
                      className="programmes-link"
                      disabled={!recipeChoice}
                      onClick={() => {
                        const recipe = library.find(
                          (item) => item.id === recipeChoice,
                        )
                        if (recipe) saveRecipe({ ...recipe, id: id() })
                        setRecipeChoice("")
                      }}
                    >
                      {tr("Add saved recipe")}
                    </button>
                  </div>
                  <button
                    className="programmes-link"
                    onClick={() => setRecipeEditor(emptyRecipe())}
                  >
                    <Plus size={16} />
                    {tr("Create a recipe")}
                  </button>
                </>
              )}
            </ProgrammeAccordion>
            {recipeEditor && (
              <RecipeEditor
                key={recipeEditor.id}
                initial={recipeEditor}
                onSave={saveRecipe}
                onCancel={() => setRecipeEditor(null)}
              />
            )}
            <ProgrammeAccordion title={tr("Shopping list")}>
              {shopping.size ? (
                <ul className="programmes-list">
                  {[...shopping.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, grams]) => (
                      <li key={name}>
                        <label className="programmes-check">
                          <input type="checkbox" />
                          <span>
                            {name} · {Math.round(grams)}g
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="programmes-muted">
                  {tr("Add meals to build your shopping list.")}
                </p>
              )}
            </ProgrammeAccordion>
          </>
        ) : (
          <>
            {!sessions.length && (
              <p className="programmes-muted">{tr("Rest day")}</p>
            )}
            {sessions.map((session) => (
              <section className="programmes-track" key={session.id}>
                <h3>{session.name}</h3>

                {editable && (
                  <div className="programmes-fields">
                    <ProgrammeField label="Session name">
                      <input
                        value={session.name}
                        maxLength={100}
                        onChange={(e) =>
                          updateTraining({
                            sessions: training.sessions.map((item) =>
                              item.id === session.id
                                ? { ...item, name: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </ProgrammeField>
                    <ProgrammeField label="Move to">
                      <select
                        value={session.dayOfWeek}
                        onChange={(e) =>
                          updateTraining({
                            sessions: training.sessions.map((item) =>
                              item.id === session.id
                                ? { ...item, dayOfWeek: Number(e.target.value) }
                                : item,
                            ),
                          })
                        }
                      >
                        {WEEK_DAYS.map((name, index) => (
                          <option key={name} value={index}>
                            {tr(name)}
                          </option>
                        ))}
                      </select>
                    </ProgrammeField>
                    <ProgrammeField label="Training block">
                      <select
                        value={session.blockId ?? ""}
                        onChange={(e) =>
                          updateTraining({
                            sessions: training.sessions.map((item) =>
                              item.id === session.id
                                ? {
                                    ...item,
                                    blockId: e.target.value || undefined,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="">{tr("Every block")}</option>
                        {training.mesocycles.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.name}
                          </option>
                        ))}
                      </select>
                    </ProgrammeField>
                  </div>
                )}
                <ProgrammeAccordion
                  key={`${session.id}-${editable}`}
                  defaultOpen={editable}
                  title={
                    <>
                      {tr("Exercises")} · {session.exercises.length}
                    </>
                  }
                >
                  <ul className="programmes-list">
                    {session.exercises.map((exercise) => (
                      <li key={exercise.id}>
                        <strong>{exercise.name}</strong>
                        <p>
                          {exercise.sets} × {exercise.reps} ·{" "}
                          {exercise.restSeconds}s {tr("rest")}
                        </p>
                        {exercise.notes && <p>{exercise.notes}</p>}
                        {exercise.alternatives.length > 0 && (
                          <p>
                            {tr("Alternatives")}:{" "}
                            {exercise.alternatives
                              .map(
                                (exerciseId) =>
                                  exercises.find(
                                    (item) => item.id === exerciseId,
                                  )?.name ?? exerciseId,
                              )
                              .join(", ")}
                          </p>
                        )}
                        {editable && (
                          <>
                            <div className="programmes-field-pair">
                              <ProgrammeNumber
                                label="Sets"
                                value={exercise.sets}
                                min={1}
                                max={12}
                                onChange={(sets) =>
                                  updateTraining({
                                    sessions: training.sessions.map((item) =>
                                      item.id === session.id
                                        ? {
                                            ...item,
                                            exercises: item.exercises.map(
                                              (ex) =>
                                                ex.id === exercise.id
                                                  ? { ...ex, sets }
                                                  : ex,
                                            ),
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <ProgrammeField label="Reps">
                                <input
                                  value={exercise.reps}
                                  onChange={(e) =>
                                    updateTraining({
                                      sessions: training.sessions.map((item) =>
                                        item.id === session.id
                                          ? {
                                              ...item,
                                              exercises: item.exercises.map(
                                                (ex) =>
                                                  ex.id === exercise.id
                                                    ? {
                                                        ...ex,
                                                        reps: e.target.value,
                                                      }
                                                    : ex,
                                              ),
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              </ProgrammeField>
                            </div>
                            <ProgrammeField label="Swap exercise">
                              <select
                                value={exercise.exerciseId}
                                onChange={(e) => {
                                  const replacement = exercises.find(
                                    (item) => item.id === e.target.value,
                                  )
                                  if (replacement)
                                    updateTraining({
                                      sessions: training.sessions.map((item) =>
                                        item.id === session.id
                                          ? {
                                              ...item,
                                              exercises: item.exercises.map(
                                                (ex) =>
                                                  ex.id === exercise.id
                                                    ? {
                                                        ...ex,
                                                        exerciseId:
                                                          replacement.id,
                                                        name: replacement.name,
                                                        notes: tr(
                                                          "Choose an appropriate starting load for this exercise.",
                                                        ),
                                                      }
                                                    : ex,
                                              ),
                                            }
                                          : item,
                                      ),
                                    })
                                }}
                              >
                                <option value={exercise.exerciseId}>
                                  {exercise.name}
                                </option>
                                {exercises
                                  .filter(
                                    (item) => item.id !== exercise.exerciseId,
                                  )
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                              </select>
                            </ProgrammeField>
                            <button
                              className="programmes-link"
                              onClick={() =>
                                updateTraining({
                                  sessions: training.sessions.map((item) =>
                                    item.id === session.id
                                      ? {
                                          ...item,
                                          exercises: item.exercises.filter(
                                            (ex) => ex.id !== exercise.id,
                                          ),
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <Trash size={14} />
                              {tr("Remove exercise")}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </ProgrammeAccordion>
                {editable && (
                  <>
                    <ProgrammeField label="Find an exercise">
                      <input
                        value={exerciseSearch}
                        onChange={(e) => setExerciseSearch(e.target.value)}
                        placeholder={tr("Search exercises")}
                      />
                    </ProgrammeField>
                    <ProgrammeField label="Add exercise">
                      <select
                        value=""
                        onChange={(e) => {
                          const exercise = exercises.find(
                            (item) => item.id === e.target.value,
                          )
                          if (exercise)
                            updateTraining({
                              sessions: training.sessions.map((item) =>
                                item.id === session.id
                                  ? {
                                      ...item,
                                      exercises: [
                                        ...item.exercises,
                                        {
                                          id: id(),
                                          exerciseId: exercise.id,
                                          name: exercise.name,
                                          sets: 3,
                                          reps: "8-12",
                                          restSeconds: 90,
                                          notes: "",
                                          alternatives: [],
                                        },
                                      ],
                                    }
                                  : item,
                              ),
                            })
                        }}
                      >
                        <option value="">{tr("Choose an exercise")}</option>
                        {exercises
                          .filter((item) =>
                            item.name
                              .toLowerCase()
                              .includes(exerciseSearch.toLowerCase()),
                          )
                          .slice(0, 100)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </ProgrammeField>
                    <button
                      className="programmes-link"
                      onClick={() =>
                        updateTraining({
                          sessions: training.sessions.filter(
                            (item) => item.id !== session.id,
                          ),
                        })
                      }
                    >
                      {tr("Remove session")}
                    </button>
                  </>
                )}
                {active && !editable && session.presetId && onStartSession && (
                  <button
                    className="programmes-link"
                    onClick={() => onStartSession(session)}
                  >
                    {tr("Start workout")} <ArrowRight size={16} />
                  </button>
                )}
              </section>
            ))}
            {editable && (
              <button
                className="programmes-link"
                onClick={() =>
                  updateTraining({
                    sessions: [
                      ...training.sessions,
                      {
                        id: id(),
                        name: `${tr(WEEK_DAYS[day]!)} ${tr("session")}`,
                        dayOfWeek: day,
                        exercises: [],
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                {tr("Add session")}
              </button>
            )}
            <ProgrammeAccordion
              key={`blocks-${editable}`}
              defaultOpen={editable && training.mesocycles.length === 0}
              title={tr("Training blocks")}
            >
              {training.mesocycles.map((block) => (
                <section key={block.id} className="programmes-track">
                  <h3>{block.name}</h3>
                  <p className="programmes-muted">
                    {tr("Weeks {{start}} to {{end}}", {
                      start: block.startWeek,
                      end: block.endWeek,
                    })}
                    {block.deload ? ` · ${tr("Lighter week")}` : ""}
                  </p>
                  <p className="programmes-muted">{block.objective}</p>
                  <p className="programmes-muted">{block.progression}</p>
                  {editable && (
                    <div className="programmes-fields">
                      <ProgrammeField label="Block name">
                        <input
                          value={block.name}
                          onChange={(e) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, name: e.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      </ProgrammeField>
                      <div className="programmes-field-pair">
                        <ProgrammeNumber
                          label="Start week"
                          value={block.startWeek}
                          min={1}
                          max={12}
                          onChange={(startWeek) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, startWeek }
                                  : item,
                              ),
                            })
                          }
                        />
                        <ProgrammeNumber
                          label="End week"
                          value={block.endWeek}
                          min={block.startWeek}
                          max={12}
                          onChange={(endWeek) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, endWeek }
                                  : item,
                              ),
                            })
                          }
                        />
                      </div>
                      <ProgrammeField label="Objective">
                        <input
                          value={block.objective}
                          onChange={(e) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, objective: e.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      </ProgrammeField>
                      <ProgrammeField label="Progression">
                        <textarea
                          value={block.progression}
                          onChange={(e) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, progression: e.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      </ProgrammeField>
                      <label className="programmes-check">
                        <input
                          type="checkbox"
                          checked={block.deload}
                          onChange={(e) =>
                            updateTraining({
                              mesocycles: training.mesocycles.map((item) =>
                                item.id === block.id
                                  ? { ...item, deload: e.target.checked }
                                  : item,
                              ),
                            })
                          }
                        />
                        {tr("A lighter recovery block")}
                      </label>
                      <button
                        className="programmes-link"
                        onClick={() =>
                          updateTraining({
                            mesocycles: training.mesocycles.filter(
                              (item) => item.id !== block.id,
                            ),
                            sessions: training.sessions.map((item) =>
                              item.blockId === block.id
                                ? { ...item, blockId: undefined }
                                : item,
                            ),
                          })
                        }
                      >
                        {tr("Remove block")}
                      </button>
                    </div>
                  )}
                </section>
              ))}
              {editable && (
                <button
                  className="programmes-link"
                  onClick={() =>
                    updateTraining({
                      mesocycles: [
                        ...training.mesocycles,
                        {
                          id: id(),
                          name: tr("New training block"),
                          startWeek: 1,
                          endWeek: 4,
                          objective: "",
                          progression: "",
                          deload: false,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  {tr("Add training block")}
                </button>
              )}
            </ProgrammeAccordion>
          </>
        )}
      </ProgrammeTransition>
      {plan.summary && (
        <ProgrammeAccordion title={tr("Overview")}>
          <p className="programmes-muted">{plan.summary}</p>
        </ProgrammeAccordion>
      )}
    </div>
  )
}

function RecipeEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProgrammeRecipe
  onSave: (recipe: ProgrammeRecipe) => void
  onCancel: () => void
}) {
  const [recipe, setRecipe] = useState(initial)
  return (
    <form
      className="programmes-inline-editor programmes-fields"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          ...recipe,
          steps: recipe.steps.map((step) => step.trim()).filter(Boolean),
        })
      }}
    >
      <h3>{tr("Recipe details")}</h3>
      <ProgrammeField label="Recipe name">
        <input
          required
          maxLength={100}
          value={recipe.name}
          onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
        />
      </ProgrammeField>
      <div className="programmes-field-pair">
        <ProgrammeNumber
          label="Servings"
          min={1}
          max={20}
          value={recipe.servings}
          onChange={(servings) => setRecipe({ ...recipe, servings })}
        />
        <ProgrammeNumber
          label="Prep minutes"
          min={0}
          max={180}
          value={recipe.prepMinutes}
          onChange={(prepMinutes) => setRecipe({ ...recipe, prepMinutes })}
        />
      </div>
      <ProgrammeNumber
        label="Cooking minutes"
        min={0}
        max={360}
        value={recipe.cookMinutes}
        onChange={(cookMinutes) => setRecipe({ ...recipe, cookMinutes })}
      />
      <ProgrammeField label="Category">
        <select
          value={recipe.category}
          onChange={(e) => setRecipe({ ...recipe, category: e.target.value })}
        >
          {["Breakfast", "Lunch", "Dinner", "Snack"].map((category) => (
            <option key={category} value={category}>
              {tr(category)}
            </option>
          ))}
        </select>
      </ProgrammeField>
      {recipe.ingredients.map((ingredient, index) => (
        <fieldset
          key={index}
          className="programmes-fields"
          style={{ border: 0, padding: 0 }}
        >
          <legend>
            {tr("Ingredient")} {index + 1}
          </legend>
          <ProgrammeField label="Name">
            <input
              required
              value={ingredient.name}
              onChange={(e) =>
                setRecipe({
                  ...recipe,
                  ingredients: recipe.ingredients.map((item, i) =>
                    i === index ? { ...item, name: e.target.value } : item,
                  ),
                })
              }
            />
          </ProgrammeField>
          <div className="programmes-field-pair">
            {(
              [
                ["grams", "Grams"],
                ["caloriesPer100", "kcal per 100g"],
                ["proteinPer100", "Protein per 100g"],
                ["carbsPer100", "Carbs per 100g"],
                ["fatPer100", "Fat per 100g"],
              ] as const
            ).map(([field, label]) => (
              <ProgrammeNumber
                key={field}
                label={label}
                min={field === "grams" ? 0.1 : 0}
                step={0.1}
                max={
                  field === "grams"
                    ? 5000
                    : field === "caloriesPer100"
                      ? 950
                      : 100
                }
                value={ingredient[field]}
                onChange={(value) =>
                  setRecipe({
                    ...recipe,
                    ingredients: recipe.ingredients.map((item, i) =>
                      i === index ? { ...item, [field]: value } : item,
                    ),
                  })
                }
              />
            ))}
          </div>
          <button
            className="programmes-link"
            type="button"
            onClick={() =>
              setRecipe({
                ...recipe,
                ingredients: recipe.ingredients.filter((_, i) => i !== index),
              })
            }
          >
            {tr("Remove ingredient")}
          </button>
        </fieldset>
      ))}
      <button
        className="programmes-link"
        type="button"
        onClick={() =>
          setRecipe({
            ...recipe,
            ingredients: [
              ...recipe.ingredients,
              {
                name: "",
                grams: 100,
                caloriesPer100: 0,
                proteinPer100: 0,
                carbsPer100: 0,
                fatPer100: 0,
              },
            ],
          })
        }
      >
        <Plus size={16} />
        {tr("Add ingredient")}
      </button>
      <ProgrammeField label="Instructions" hint="One step per line.">
        <textarea
          required
          value={recipe.steps.join("\n")}
          onChange={(e) =>
            setRecipe({ ...recipe, steps: e.target.value.split("\n") })
          }
        />
      </ProgrammeField>
      <div className="programmes-actions">
        <button
          className="programmes-link"
          type="submit"
          disabled={!recipe.ingredients.length}
        >
          {tr("Save recipe")}
        </button>
        <button className="programmes-link" type="button" onClick={onCancel}>
          {tr("Cancel")}
        </button>
      </div>
    </form>
  )
}
