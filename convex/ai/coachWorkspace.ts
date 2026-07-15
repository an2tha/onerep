import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const loadForModel = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const [presets, recipes, foodDays, memories, checkIns, goals, workouts, actions, schedule] =
      await Promise.all([
        ctx.db.query("presets").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(40),
        ctx.db.query("recipes").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(30),
        ctx.db.query("foodLogs").withIndex("by_userId_date", (q) => q.eq("userId", args.userId).lte("date", args.today)).order("desc").take(14),
        ctx.db.query("coachMemories").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(40),
        ctx.db.query("coachCheckIns").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(14),
        ctx.db.query("coachGoals").withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "active")).order("desc").take(20),
        ctx.db.query("workoutLogs").withIndex("by_userId_date", (q) => q.eq("userId", args.userId)).order("desc").take(30),
        ctx.db.query("coachActionEvents").withIndex("by_userId", (q) => q.eq("userId", args.userId)).order("desc").take(30),
        ctx.db.query("schedules").withIndex("by_userId", (q) => q.eq("userId", args.userId)).unique(),
      ]);
    const presetNames = new Map(presets.map((preset) => [String(preset._id), preset.name]));
    const routineRoot = isRecord(schedule?.routine) ? schedule.routine : {};
    const primary = isRecord(routineRoot.primary) ? routineRoot.primary : routineRoot;
    const goalsWithTasks = await Promise.all(goals.map(async (goal) => ({
      id: String(goal._id), title: goal.title, detail: goal.description, startDate: goal.startDate,
      endDate: goal.endDate, durationDays: goal.durationDays, pinned: goal.pinned, status: goal.status,
      tasks: (await ctx.db.query("coachGoalTasks").withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goal._id)).take(12))
        .map((task) => ({ title: task.title, detail: task.detail, completed: task.completed })),
    })));
    return {
      today: args.today,
      presets: presets.map((preset) => ({ id: String(preset._id), name: preset.name, updatedAt: preset.updatedAt, snapshot: { items: preset.items, exerciseData: preset.exerciseData, focus: preset.focus, duration: preset.duration, steps: preset.steps } })),
      recipes: recipes.map((recipe) => ({ id: String(recipe._id), name: recipe.name, updatedAt: recipe.updatedAt, servings: recipe.servings, ingredients: recipe.ingredients.map((item) => ({ id: item.id, name: item.name, grams: item.grams, caloriesPer100: item.caloriesPer100, proteinPer100: item.proteinPer100, carbsPer100: item.carbsPer100, fatPer100: item.fatPer100 })) })),
      foodEntries: foodDays.flatMap((day) => day.entries.slice(-12).filter(isRecord).map((entry) => ({ ...entry, date: day.date }))).slice(0, 50),
      memories: memories.map(({ key, category, value }) => ({ key, category, value })),
      checkIns: checkIns.map(({ date, energy, soreness, sleepQuality, mood }) => ({ date, energy, soreness, sleepQuality, mood })),
      goals: goalsWithTasks,
      recentWorkouts: workouts.map((workout) => ({ id: String(workout._id), date: workout.date, durationMinutes: Math.round(workout.durationSeconds / 60), exercises: workout.exercises })),
      recentActions: actions.map((event) => ({ id: String(event._id), summary: event.summary, status: event.status })),
      routine: DAYS.map((day) => { const raw = primary[day]; const presetId = typeof raw === "string" ? raw : null; return { day, presetId, presetName: presetId ? (presetNames.get(presetId) ?? null) : null }; }),
    };
  },
});
