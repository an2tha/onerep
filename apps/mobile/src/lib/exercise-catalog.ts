export type ExerciseCategory = "strength" | "cardio" | "mobility" | "core"

export type Exercise = {
  id: string
  name: string
  category: ExerciseCategory
  muscle: string
  description: string
  sets: string
  color: string
  level?: string
  mechanic?: string | null
  equipment?: string | null
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
  instructions?: string[]
}

export const EXERCISES: Exercise[] = [
  {
    id: "e1",
    name: "Barbell Squat",
    category: "strength",
    muscle: "Quads · Glutes · Core",
    description:
      "The foundational lower-body compound movement. Builds quad, glute, and core strength simultaneously. Keep your chest tall and knees tracking over your toes.",
    sets: "4 × 5 reps",
    color: "#78716c",
  },
  {
    id: "e2",
    name: "Bench Press",
    category: "strength",
    muscle: "Chest · Triceps · Front Deltoids",
    description:
      "The premier horizontal pressing movement. Develops chest thickness and pushing power. Lower the bar under control to mid-chest, drive up explosively.",
    sets: "4 × 6 reps",
    color: "#57534e",
  },
  {
    id: "e3",
    name: "Deadlift",
    category: "strength",
    muscle: "Hamstrings · Back · Glutes",
    description:
      "The heaviest full-body lift. Trains the entire posterior chain. Hinge at the hips, keep a neutral spine, and drive through the floor.",
    sets: "3 × 5 reps",
    color: "#44403c",
  },
  {
    id: "e4",
    name: "Pull-up",
    category: "strength",
    muscle: "Lats · Biceps · Rear Delts",
    description:
      "The upper-body benchmark. Builds vertical pulling strength and a wide back. Start from a dead hang, pull your chin over the bar, lower with control.",
    sets: "4 × max reps",
    color: "#78716c",
  },
  {
    id: "e5",
    name: "Overhead Press",
    category: "strength",
    muscle: "Shoulders · Triceps · Upper Chest",
    description:
      "Standing vertical pressing movement. Builds shoulder mass and pressing strength. Brace your core tightly to avoid lower-back extension.",
    sets: "4 × 6 reps",
    color: "#57534e",
  },
  {
    id: "e6",
    name: "Barbell Row",
    category: "strength",
    muscle: "Lats · Rhomboids · Biceps",
    description:
      "Horizontal pulling movement that counters the bench press. Hinge to around 45°, row the bar into your lower chest, squeeze the shoulder blades.",
    sets: "4 × 8 reps",
    color: "#44403c",
  },
  {
    id: "e7",
    name: "Dumbbell Curl",
    category: "strength",
    muscle: "Biceps · Forearms",
    description:
      "Classic bicep isolation. Supinate the wrist at the top for a full contraction. Avoid swinging the elbow forward.",
    sets: "3 × 12 reps",
    color: "#78716c",
  },
  {
    id: "e8",
    name: "Tricep Dip",
    category: "strength",
    muscle: "Triceps · Chest · Front Delts",
    description:
      "Compound pushing movement that loads the triceps and chest through a long range of motion. Keep elbows close and lean slightly forward.",
    sets: "3 × 10 reps",
    color: "#57534e",
  },
  {
    id: "e9",
    name: "Zone 2 Run",
    category: "cardio",
    muscle: "Full Body · Cardiovascular",
    description:
      "Sustained aerobic effort at 60–70% max heart rate. Builds mitochondrial density and fat-burning capacity. Should feel conversational.",
    sets: "20–40 min",
    color: "#f97316",
  },
  {
    id: "e10",
    name: "Jump Rope",
    category: "cardio",
    muscle: "Calves · Coordination · Cardiovascular",
    description:
      "High-skill conditioning tool. Improves footwork, timing, and anaerobic capacity. Start with 30-second intervals, rest 30 seconds.",
    sets: "10 × 30 s",
    color: "#ef4444",
  },
  {
    id: "e11",
    name: "Rowing Machine",
    category: "cardio",
    muscle: "Full Body · Back · Legs",
    description:
      "Low-impact, full-body cardio. 60% legs, 20% core, 20% arms on each stroke. Drive with the legs first, then lean back, then pull the handle.",
    sets: "2000 m",
    color: "#f97316",
  },
  {
    id: "e12",
    name: "Burpees",
    category: "cardio",
    muscle: "Full Body · Explosive",
    description:
      "High-intensity movement combining a squat, plank, push-up, and jump. Excellent for conditioning in minimal space. Control the descent.",
    sets: "5 × 10 reps",
    color: "#dc2626",
  },
  {
    id: "e13",
    name: "Hip Flexor Stretch",
    category: "mobility",
    muscle: "Hip Flexors · Quads",
    description:
      "Addresses tightness from prolonged sitting. Lunge low, tuck the pelvis, and reach the same-side arm overhead for a deeper stretch.",
    sets: "3 × 60 s / side",
    color: "#10b981",
  },
  {
    id: "e14",
    name: "Thoracic Rotation",
    category: "mobility",
    muscle: "Thoracic Spine · Shoulders",
    description:
      "Restores mid-back rotation that daily sitting limits. Side-lying with knees stacked, reach the top arm across the body and rotate open.",
    sets: "2 × 10 reps / side",
    color: "#059669",
  },
  {
    id: "e15",
    name: "Pigeon Pose",
    category: "mobility",
    muscle: "Hips · Glutes · Piriformis",
    description:
      "Deep external hip rotation stretch that releases chronic tightness in the glutes and piriformis. Fold forward over the front shin for a deeper hold.",
    sets: "2 × 90 s / side",
    color: "#10b981",
  },
  {
    id: "e16",
    name: "World's Greatest Stretch",
    category: "mobility",
    muscle: "Hips · Thoracic Spine · Hamstrings",
    description:
      "The single best dynamic warm-up exercise. Combines a lunge, rotation, and hamstring stretch in one flowing sequence. Take it slow.",
    sets: "2 × 5 reps / side",
    color: "#34d399",
  },
  {
    id: "e17",
    name: "Plank",
    category: "core",
    muscle: "Core · Shoulders · Glutes",
    description:
      "The foundation of core training. Maintain a rigid body position from head to heels — no sagging hips. Squeeze everything.",
    sets: "3 × 60 s",
    color: "#3b82f6",
  },
  {
    id: "e18",
    name: "Russian Twist",
    category: "core",
    muscle: "Obliques · Hip Flexors",
    description:
      "Rotational core exercise. Keep your feet off the ground and rotate through the thoracic spine, not just the arms. Add a weight plate for more challenge.",
    sets: "3 × 20 reps",
    color: "#2563eb",
  },
  {
    id: "e19",
    name: "Dead Bug",
    category: "core",
    muscle: "Core · Hip Flexors · Stability",
    description:
      "Anti-extension core stability drill. Press your lower back into the floor throughout. Extend opposite arm and leg slowly, return without losing position.",
    sets: "3 × 10 reps / side",
    color: "#3b82f6",
  },
  {
    id: "e20",
    name: "Hanging Leg Raise",
    category: "core",
    muscle: "Lower Abs · Hip Flexors",
    description:
      "Hanging core exercise targeting the lower abdominals. Avoid swinging — initiate by posteriorly tilting the pelvis, then raise the legs.",
    sets: "3 × 12 reps",
    color: "#1d4ed8",
  },
]

export function getExerciseById(id: string) {
  return EXERCISES.find((e) => e.id === id) ?? null
}
