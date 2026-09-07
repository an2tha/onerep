import { cssVariable } from "./visual-identity"

/** Serializable product data colors. Do not replace these with CSS values. */
export const ONE_REP_PALETTE = {
  iron: "#5b5bd6",
  rubber: "#2f2d2a",
  tape: "#b55324",
  plate: "#1673b1",
  patina: "#3f7d44",
  brass: "#9a5d00",
  violet: "#9b4d96",
  cordovan: "#b42335",
  zinc: "#77736d",
  chalkLine: "#b8b3aa",
  teal: "#1f7a86",
} as const

/** Runtime-switchable equivalents for visual rendering only. */
export const VISUAL_IDENTITY_PALETTE = {
  iron: cssVariable("--palette-iron", "#5b5bd6"),
  rubber: cssVariable("--palette-rubber", "#2f2d2a"),
  tape: cssVariable("--palette-tape", "#b55324"),
  plate: cssVariable("--palette-plate", "#1673b1"),
  patina: cssVariable("--palette-patina", "#3f7d44"),
  brass: cssVariable("--palette-brass", "#9a5d00"),
  violet: cssVariable("--palette-violet", "#9b4d96"),
  cordovan: cssVariable("--palette-cordovan", "#b42335"),
  zinc: cssVariable("--palette-zinc", "#77736d"),
  chalkLine: cssVariable("--palette-chalk-line", "#b8b3aa"),
  /** The Health page's own accent, same as `--accent-health` in light. */
  teal: cssVariable("--palette-teal", "#1f7a86"),
} as const

export function tint(color: string, amount = 10) {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`
}

export const APP_ACCENT_COLORS = {
  food: VISUAL_IDENTITY_PALETTE.tape,
  water: VISUAL_IDENTITY_PALETTE.plate,
  supplement: VISUAL_IDENTITY_PALETTE.patina,
  workout: VISUAL_IDENTITY_PALETTE.iron,
  progress: VISUAL_IDENTITY_PALETTE.violet,
  health: VISUAL_IDENTITY_PALETTE.teal,
  complete: VISUAL_IDENTITY_PALETTE.patina,
  caution: VISUAL_IDENTITY_PALETTE.brass,
  danger: VISUAL_IDENTITY_PALETTE.cordovan,
  neutral: VISUAL_IDENTITY_PALETTE.zinc,
} as const

export const MACRO_COLORS = {
  protein: VISUAL_IDENTITY_PALETTE.tape,
  carbs: VISUAL_IDENTITY_PALETTE.plate,
  fat: VISUAL_IDENTITY_PALETTE.violet,
} as const

export const MACRO_TONES = {
  protein: { solid: MACRO_COLORS.protein, bg: tint(MACRO_COLORS.protein, 13) },
  carbs: { solid: MACRO_COLORS.carbs, bg: tint(MACRO_COLORS.carbs, 13) },
  fat: { solid: MACRO_COLORS.fat, bg: tint(MACRO_COLORS.fat, 13) },
} as const

export const DEFAULT_MEAL_TONES = {
  breakfast: {
    color: VISUAL_IDENTITY_PALETTE.tape,
    bg: tint(VISUAL_IDENTITY_PALETTE.tape, 12),
  },
  lunch: {
    color: VISUAL_IDENTITY_PALETTE.plate,
    bg: tint(VISUAL_IDENTITY_PALETTE.plate, 12),
  },
  dinner: {
    color: VISUAL_IDENTITY_PALETTE.violet,
    bg: tint(VISUAL_IDENTITY_PALETTE.violet, 12),
  },
  snack: {
    color: VISUAL_IDENTITY_PALETTE.brass,
    bg: tint(VISUAL_IDENTITY_PALETTE.brass, 12),
  },
} as const

export const CUSTOM_CATEGORY_TONES = [
  { color: VISUAL_IDENTITY_PALETTE.cordovan, bg: tint(VISUAL_IDENTITY_PALETTE.cordovan, 12) },
  { color: VISUAL_IDENTITY_PALETTE.tape, bg: tint(VISUAL_IDENTITY_PALETTE.tape, 12) },
  { color: VISUAL_IDENTITY_PALETTE.plate, bg: tint(VISUAL_IDENTITY_PALETTE.plate, 12) },
  { color: VISUAL_IDENTITY_PALETTE.violet, bg: tint(VISUAL_IDENTITY_PALETTE.violet, 12) },
  { color: VISUAL_IDENTITY_PALETTE.patina, bg: tint(VISUAL_IDENTITY_PALETTE.patina, 12) },
  { color: VISUAL_IDENTITY_PALETTE.brass, bg: tint(VISUAL_IDENTITY_PALETTE.brass, 12) },
] as const

export const EXERCISE_CATEGORY_COLORS = {
  strength: ONE_REP_PALETTE.iron,
  cardio: ONE_REP_PALETTE.tape,
  mobility: ONE_REP_PALETTE.patina,
  core: ONE_REP_PALETTE.plate,
} as const

export const SET_TYPE_TONES = {
  working: {
    color: VISUAL_IDENTITY_PALETTE.plate,
    bg: tint(VISUAL_IDENTITY_PALETTE.plate, 10),
  },
  warmup: {
    color: VISUAL_IDENTITY_PALETTE.zinc,
    bg: tint(VISUAL_IDENTITY_PALETTE.zinc, 10),
  },
  failure: {
    color: VISUAL_IDENTITY_PALETTE.cordovan,
    bg: tint(VISUAL_IDENTITY_PALETTE.cordovan, 10),
  },
  myoreps: {
    color: VISUAL_IDENTITY_PALETTE.brass,
    bg: tint(VISUAL_IDENTITY_PALETTE.brass, 10),
  },
  drop: {
    color: VISUAL_IDENTITY_PALETTE.patina,
    bg: tint(VISUAL_IDENTITY_PALETTE.patina, 10),
  },
} as const

export const MUSCLE_COLORS = {
  quadriceps: VISUAL_IDENTITY_PALETTE.plate,
  glutes: VISUAL_IDENTITY_PALETTE.brass,
  hamstrings: VISUAL_IDENTITY_PALETTE.violet,
  chest: VISUAL_IDENTITY_PALETTE.cordovan,
  back: VISUAL_IDENTITY_PALETTE.patina,
  shoulders: VISUAL_IDENTITY_PALETTE.tape,
  biceps: cssVariable("--muscle-biceps", "#736a78"),
  triceps: cssVariable("--muscle-triceps", "#687078"),
  core: VISUAL_IDENTITY_PALETTE.brass,
  calves: cssVariable("--muscle-calves", "#667572"),
} as const

export const MICRO_COLORS = {
  fiber: VISUAL_IDENTITY_PALETTE.patina,
  sugar: VISUAL_IDENTITY_PALETTE.brass,
  saturatedFat: cssVariable("--micro-saturated-fat", "#7d6a6c"),
  transFat: VISUAL_IDENTITY_PALETTE.cordovan,
  cholesterol: VISUAL_IDENTITY_PALETTE.tape,
  sodium: VISUAL_IDENTITY_PALETTE.plate,
  potassium: cssVariable("--micro-potassium", "#6e7466"),
  calcium: cssVariable("--micro-calcium", "#6b7678"),
  iron: VISUAL_IDENTITY_PALETTE.violet,
  magnesium: cssVariable("--micro-magnesium", "#6a7773"),
  phosphorus: cssVariable("--micro-phosphorus", "#70727c"),
  zinc: VISUAL_IDENTITY_PALETTE.brass,
  vitaminC: cssVariable("--micro-vitamin-c", "#7d7465"),
  vitaminA: cssVariable("--micro-vitamin-a", "#7d6f66"),
  vitaminD: cssVariable("--micro-vitamin-d", "#7d7668"),
  vitaminB12: cssVariable("--micro-vitamin-b12", "#776c7c"),
  caffeine: VISUAL_IDENTITY_PALETTE.zinc,
  alcohol: cssVariable("--micro-alcohol", "#7c6868"),
} as const

export const SUPPLEMENT_TONES = {
  creatine: {
    color: VISUAL_IDENTITY_PALETTE.patina,
    bg: tint(VISUAL_IDENTITY_PALETTE.patina, 14),
  },
  protein: {
    color: MACRO_COLORS.protein,
    bg: tint(MACRO_COLORS.protein, 14),
  },
  vitamins: {
    color: VISUAL_IDENTITY_PALETTE.violet,
    bg: tint(VISUAL_IDENTITY_PALETTE.violet, 14),
  },
  caffeine: {
    color: VISUAL_IDENTITY_PALETTE.brass,
    bg: tint(VISUAL_IDENTITY_PALETTE.brass, 14),
  },
} as const

export const NUTRITION_SCORE_COLORS = {
  a: VISUAL_IDENTITY_PALETTE.patina,
  b: cssVariable("--nutrition-score-b", "#707566"),
  c: VISUAL_IDENTITY_PALETTE.brass,
  d: VISUAL_IDENTITY_PALETTE.tape,
  e: VISUAL_IDENTITY_PALETTE.cordovan,
} as const

export const NOVA_COLORS = [
  VISUAL_IDENTITY_PALETTE.patina,
  VISUAL_IDENTITY_PALETTE.brass,
  VISUAL_IDENTITY_PALETTE.tape,
  VISUAL_IDENTITY_PALETTE.cordovan,
] as const
