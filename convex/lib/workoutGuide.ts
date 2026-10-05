import { EXTRA_GUIDE_QUESTIONS } from "./workoutGuideQuestions";
export const MAX_GUIDE_QUESTIONS = 10;
export const MUSCLE_GROUPS = {
  "Upper body": [
    "Chest",
    "Lats",
    "Upper back",
    "Shoulders",
    "Biceps",
    "Triceps",
  ],
  "Lower body and core": [
    "Quads",
    "Glutes",
    "Hamstrings",
    "Calves",
    "Abs",
    "Obliques",
  ],
} as const;
export const GUIDE_MUSCLES = Object.values(MUSCLE_GROUPS).flat();
export function selectedMuscles(value?: string): string[] {
  return value?.startsWith("Muscles: ")
    ? value
        .slice(9)
        .split(", ")
        .filter((name) => (GUIDE_MUSCLES as readonly string[]).includes(name))
    : [];
}
function validMuscles(value: string) {
  const values = selectedMuscles(value);
  return (
    values.length > 0 &&
    values.length <= GUIDE_MUSCLES.length &&
    new Set(values).size === values.length &&
    `Muscles: ${values.join(", ")}` === value
  );
}

/** Reviewed question bank. IDs and option values are the wire protocol. */
export const GUIDE_QUESTIONS = [
  {
    id: "goal",
    title: "What are we training for?",
    detail: "Give this session one clear purpose.",
    options: ["Build strength", "Build muscle", "General fitness"],
  },
  {
    id: "change",
    title: "What needs to change?",
    detail: "Start with your current workout. Keep what already works.",
    options: ["Make it shorter", "Change equipment", "Refresh the exercises"],
  },
  {
    id: "focus",
    title: "Which muscles do you want to train?",
    detail: "This sets the balance of your session.",
    options: ["Full body", "Upper body", "Lower body"],
  },
  {
    id: "equipment",
    title: "What can you train with?",
    detail: "Jev will work within the equipment you have.",
    options: ["Full gym", "Dumbbells only", "Bodyweight only"],
  },
  {
    id: "duration",
    title: "How much time do you have?",
    detail: "Include time for warming up and resting between sets.",
    options: ["20 minutes", "30 minutes", "45 minutes", "60 minutes"],
  },
  {
    id: "experience",
    title: "How familiar is strength training?",
    detail: "Choose what describes you today.",
    options: ["Just starting", "Training regularly", "Very experienced"],
  },
  {
    id: "constraints",
    title: "Anything to work around?",
    detail:
      "Exclude uncomfortable movements. You can add specifics before building.",
    options: [
      "No restrictions",
      "Avoid jumping",
      "Avoid overhead work",
      "I have specific restrictions",
    ],
  },
  {
    id: "priority",
    title: "Which lift gets your best energy?",
    detail: "Your priority movement goes near the start.",
    options: ["Squat pattern", "Pressing", "Pulling", "Keep it balanced"],
  },
  {
    id: "pace",
    title: "What rhythm suits you?",
    detail: "Rest is part of the workout, not an afterthought.",
    options: ["Unhurried sets", "Steady pace", "Shorter rests"],
  },
  {
    id: "style",
    title: "How do you like to train?",
    detail: "Build a session you will want to come back to.",
    options: ["Familiar basics", "A little variety", "A mix of both"],
  },
  {
    id: "effort",
    title: "How are you arriving today?",
    detail: "The session should fit the energy you actually have.",
    options: ["Ready to push", "Normal day", "Keep it lighter"],
  },
  {
    id: "upper",
    title: "What matters most for upper body?",
    detail: "Give a little more room to your priority.",
    options: ["Chest and shoulders", "Back and arms", "Balanced upper body"],
  },
  {
    id: "lower",
    title: "What matters most for lower body?",
    detail: "Keep the session balanced around your main focus.",
    options: ["Quads", "Glutes and hamstrings", "Balanced lower body"],
  },
  {
    id: "finish",
    title: "How would you like to finish?",
    detail: "Only add a finisher if it fits your time.",
    options: [
      "Keep it strength only",
      "A little core work",
      "Easy conditioning",
    ],
  },
  ...EXTRA_GUIDE_QUESTIONS,
] as const;
export type GuideQuestionId = (typeof GUIDE_QUESTIONS)[number]["id"];
export type GuideAnswers = Partial<Record<GuideQuestionId, string>>;
export type GuidedDraft = {
  name: string;
  notes?: string;
  exercises: {
    name: string;
    sets?: {
      type?: "working" | "warmup" | "failure" | "myoreps" | "drop";
      weight?: string;
      reps?: string;
      restSeconds?: number;
    }[];
  }[];
};
export const CORE_GUIDE_IDS: GuideQuestionId[] = [
  "focus",
  "equipment",
  "duration",
  "experience",
  "constraints",
];
export function validateGuideAnswers(
  raw: Record<string, string>
): GuideAnswers {
  if (Object.keys(raw).length >= MAX_GUIDE_QUESTIONS)
    throw new Error("Use no more than 10 questions including notes.");
  const answers: GuideAnswers = {};
  for (const [id, value] of Object.entries(raw)) {
    const question = GUIDE_QUESTIONS.find((q) => q.id === id);
    if (
      !question ||
      (!(question.options as readonly string[]).includes(value) &&
        !(id === "focus" && validMuscles(value)) &&
        !(
          value.startsWith("Custom: ") &&
          value.slice(8).trim().length > 0 &&
          value.length <= 308
        ))
    )
      throw new Error("Choose one of the available answers.");
    answers[question.id] = value;
  }
  return answers;
}
export function eligibleFollowups(answers: GuideAnswers): GuideQuestionId[] {
  const tags = new Set<string>(["general", "preference"]);
  if (answers.goal === "Build strength") tags.add("strength");
  if (answers.goal === "Build muscle") tags.add("muscle");
  if (/Upper|Chest|Lats|Shoulders|Biceps|Triceps/.test(answers.focus ?? ""))
    tags.add("upper");
  if (/Lower|Quads|Glutes|Hamstrings|Calves/.test(answers.focus ?? ""))
    tags.add("lower");
  if (/Abs|Obliques/.test(answers.focus ?? "")) tags.add("core");
  if (answers.equipment !== "Full gym") tags.add("home");
  if (answers.experience === "Just starting") tags.add("beginner");
  if (answers.experience === "Very experienced") tags.add("experienced");
  if (/20|30/.test(answers.duration ?? "")) tags.add("time");
  const extra = EXTRA_GUIDE_QUESTIONS.map((q, index) => ({
    q,
    index,
    rank: q.tags.filter((tag) => tags.has(tag)).length,
  }))
    .filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, 8)
    .map((item) => item.q.id);
  return (
    [
      "effort",
      "pace",
      ...(answers.goal === "Build strength" ? ["priority" as const] : []),
      ...extra,
    ] as GuideQuestionId[]
  ).slice(0, 11);
}
export function selectFollowups(
  value: unknown,
  answers: GuideAnswers
): GuideQuestionId[] {
  const allowed = eligibleFollowups(answers);
  const selected = Array.isArray(value)
    ? value.filter((id): id is GuideQuestionId => allowed.includes(id))
    : [];
  return [...new Set([...selected, "effort" as const, "pace" as const])].slice(
    0,
    2
  );
}
export function requireGuideCore(answers: GuideAnswers, editing: boolean) {
  for (const id of [
    editing ? "change" : "goal",
    ...CORE_GUIDE_IDS,
  ] as GuideQuestionId[]) {
    if (!answers[id])
      throw new Error(
        "Finish the session questions before building your workout."
      );
  }
}
