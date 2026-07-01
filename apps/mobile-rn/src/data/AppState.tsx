import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  authSession as seedAuthSession,
  bodyEntries,
  foodLogs as seedFood,
  profile as seedProfile,
  presets as seedPresets,
  recipes as seedRecipes,
  reminders as seedReminders,
  supplements as seedSupplements,
  waterLogs as seedWater,
  workoutLogs as seedWorkoutLogs,
} from "./seed";
import type {
  AuthSession,
  BodyEntry,
  FoodLog,
  Meal,
  Recipe,
  Reminder,
  SupplementLog,
  UserProfile,
  WaterLog,
  WorkoutLog,
  WorkoutPreset,
} from "@/types/domain";

type State = {
  auth: AuthSession;
  profile: UserProfile;
  foods: FoodLog[];
  water: WaterLog[];
  supplements: SupplementLog[];
  presets: WorkoutPreset[];
  workoutLogs: WorkoutLog[];
  body: BodyEntry[];
  recipes: Recipe[];
  reminders: Reminder[];
};
type Ctx = State & {
  signIn(email: string): void;
  signOut(): void;
  addFood(food: Omit<FoodLog, "id" | "time">): void;
  deleteFood(id: string): void;
  addWater(amountMl: number): void;
  deleteWater(id: string): void;
  toggleSupplement(id: string): void;
  addSupplement(name: string, dose: string): void;
  deleteSupplement(id: string): void;
  toggleSet(exerciseId: string, setId: string): void;
  addExercise(presetId: string, name: string): void;
  addSet(exerciseId: string): void;
  finishWorkout(presetId: string): void;
  createPreset(name: string): void;
  deletePreset(id: string): void;
  addBody(weightKg: number, waistCm?: number): void;
  addRecipe(name: string): void;
  logRecipe(recipeId: string, meal: Meal): void;
  toggleReminder(id: string): void;
  updateProfile(profile: Partial<UserProfile>): void;
  resetDemo(): void;
};
const KEY = "onerep-rn-state-v3";
const AppStateContext = createContext<Ctx | null>(null);
const initial: State = {
  auth: seedAuthSession,
  profile: seedProfile,
  foods: seedFood,
  water: seedWater,
  supplements: seedSupplements,
  presets: seedPresets,
  workoutLogs: seedWorkoutLogs,
  body: bodyEntries,
  recipes: seedRecipes,
  reminders: seedReminders,
};
const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setState({ ...initial, ...JSON.parse(v) }))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state]);
  const value = useMemo<Ctx>(
    () => ({
      ...state,
      signIn: (email) =>
        setState((s) => ({
          ...s,
          auth: {
            isAuthenticated: true,
            email,
            displayName: email.split("@")[0],
          },
          profile: {
            ...s.profile,
            name: email.split("@")[0] || s.profile.name,
          },
        })),
      signOut: () =>
        setState((s) => ({ ...s, auth: { isAuthenticated: false } })),
      addFood: (food) =>
        setState((s) => ({
          ...s,
          foods: [{ ...food, id: nowId(), time: nowTime() }, ...s.foods],
        })),
      deleteFood: (id) =>
        setState((s) => ({ ...s, foods: s.foods.filter((f) => f.id !== id) })),
      addWater: (amountMl) =>
        setState((s) => ({
          ...s,
          water: [{ id: nowId(), amountMl, time: nowTime() }, ...s.water],
        })),
      deleteWater: (id) =>
        setState((s) => ({ ...s, water: s.water.filter((w) => w.id !== id) })),
      toggleSupplement: (id) =>
        setState((s) => ({
          ...s,
          supplements: s.supplements.map((x) =>
            x.id === id ? { ...x, taken: !x.taken } : x,
          ),
        })),
      addSupplement: (name, dose) =>
        setState((s) => ({
          ...s,
          supplements: [
            ...s.supplements,
            { id: nowId(), name, dose, schedule: "daily", taken: false },
          ],
        })),
      deleteSupplement: (id) =>
        setState((s) => ({
          ...s,
          supplements: s.supplements.filter((x) => x.id !== id),
        })),
      toggleSet: (exerciseId, setId) =>
        setState((s) => ({
          ...s,
          presets: s.presets.map((p) => ({
            ...p,
            exercises: p.exercises.map((e) =>
              e.id === exerciseId
                ? {
                    ...e,
                    sets: e.sets.map((set) =>
                      set.id === setId ? { ...set, done: !set.done } : set,
                    ),
                  }
                : e,
            ),
          })),
        })),
      addExercise: (presetId, name) =>
        setState((s) => ({
          ...s,
          presets: s.presets.map((p) =>
            p.id === presetId
              ? {
                  ...p,
                  exercises: [
                    ...p.exercises,
                    {
                      id: nowId(),
                      name,
                      muscle: "General",
                      sets: [
                        {
                          id: nowId(),
                          weight: 0,
                          reps: 10,
                          restSeconds: 90,
                          done: false,
                        },
                      ],
                    },
                  ],
                }
              : p,
          ),
        })),
      createPreset: (name) =>
        setState((s) => ({
          ...s,
          presets: [
            ...s.presets,
            {
              id: nowId(),
              name,
              duration: "45 min",
              focus: "Strength",
              exercises: [],
            },
          ],
        })),
      deletePreset: (id) =>
        setState((s) => ({
          ...s,
          presets: s.presets.filter((p) => p.id !== id),
        })),
      addSet: (exerciseId) =>
        setState((s) => ({
          ...s,
          presets: s.presets.map((p) => ({
            ...p,
            exercises: p.exercises.map((e) =>
              e.id === exerciseId
                ? {
                    ...e,
                    sets: [
                      ...e.sets,
                      {
                        id: nowId(),
                        weight: e.sets.at(-1)?.weight ?? 0,
                        reps: e.sets.at(-1)?.reps ?? 8,
                        restSeconds: 90,
                        done: false,
                      },
                    ],
                  }
                : e,
            ),
          })),
        })),
      finishWorkout: (presetId) =>
        setState((s) => {
          const preset = s.presets.find((p) => p.id === presetId);
          if (!preset) return s;
          const volumeKg = preset.exercises
            .flatMap((e) => e.sets)
            .reduce((sum, set) => sum + set.weight * set.reps, 0);
          return {
            ...s,
            workoutLogs: [
              {
                id: nowId(),
                presetName: preset.name,
                completedAt: todayLabel(),
                volumeKg,
                durationMin: Number.parseInt(preset.duration, 10) || 45,
              },
              ...s.workoutLogs,
            ],
            presets: s.presets.map((p) =>
              p.id === presetId
                ? {
                    ...p,
                    exercises: p.exercises.map((e) => ({
                      ...e,
                      sets: e.sets.map((set) => ({ ...set, done: false })),
                    })),
                  }
                : p,
            ),
          };
        }),
      addBody: (weightKg, waistCm) =>
        setState((s) => ({
          ...s,
          body: [
            ...s.body,
            { id: nowId(), date: todayLabel(), weightKg, waistCm },
          ],
        })),
      addRecipe: (name) =>
        setState((s) => ({
          ...s,
          recipes: [
            ...s.recipes,
            { id: nowId(), name, servings: 1, ingredients: [] },
          ],
        })),
      logRecipe: (recipeId, meal) =>
        setState((s) => {
          const recipe = s.recipes.find((r) => r.id === recipeId);
          if (!recipe) return s;
          const totals = recipe.ingredients.reduce(
            (a, i) => ({
              calories: a.calories + i.calories,
              protein: a.protein + i.protein,
              carbs: a.carbs + i.carbs,
              fat: a.fat + i.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 },
          );
          return {
            ...s,
            foods: [
              {
                id: nowId(),
                name: recipe.name,
                meal,
                time: nowTime(),
                ...totals,
              },
              ...s.foods,
            ],
          };
        }),
      toggleReminder: (id) =>
        setState((s) => ({
          ...s,
          reminders: s.reminders.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ),
        })),
      updateProfile: (profile) =>
        setState((s) => ({ ...s, profile: { ...s.profile, ...profile } })),
      resetDemo: () => setState(initial),
    }),
    [state],
  );
  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}
export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be inside AppStateProvider");
  return ctx;
}
export function mealLabel(meal: Meal) {
  return meal[0].toUpperCase() + meal.slice(1);
}
