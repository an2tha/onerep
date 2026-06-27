export const ONE_REP_PALETTE = {
  iron: "#66645e",
  rubber: "#2f2d2a",
  tape: "#746f68",
  plate: "#6e7472",
  patina: "#6f726a",
  brass: "#7a705f",
  violet: "#716f76",
  cordovan: "#7b6464",
  zinc: "#77736d",
  chalkLine: "#b8b3aa",
} as const

export function tint(color: string, amount = 10) {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`
}

export const APP_ACCENT_COLORS = {
  food: ONE_REP_PALETTE.tape,
  water: ONE_REP_PALETTE.plate,
  supplement: ONE_REP_PALETTE.patina,
  workout: ONE_REP_PALETTE.iron,
  progress: ONE_REP_PALETTE.violet,
  complete: ONE_REP_PALETTE.patina,
  caution: ONE_REP_PALETTE.brass,
  danger: ONE_REP_PALETTE.cordovan,
  neutral: ONE_REP_PALETTE.zinc,
} as const

export const MACRO_COLORS = {
  protein: ONE_REP_PALETTE.tape,
  carbs: ONE_REP_PALETTE.plate,
  fat: ONE_REP_PALETTE.violet,
} as const

export const MACRO_TONES = {
  protein: { solid: MACRO_COLORS.protein, bg: tint(MACRO_COLORS.protein, 13) },
  carbs: { solid: MACRO_COLORS.carbs, bg: tint(MACRO_COLORS.carbs, 13) },
  fat: { solid: MACRO_COLORS.fat, bg: tint(MACRO_COLORS.fat, 13) },
} as const

export const DEFAULT_MEAL_TONES = {
  breakfast: {
    color: ONE_REP_PALETTE.tape,
    bg: tint(ONE_REP_PALETTE.tape, 12),
  },
  lunch: {
    color: ONE_REP_PALETTE.plate,
    bg: tint(ONE_REP_PALETTE.plate, 12),
  },
  dinner: {
    color: ONE_REP_PALETTE.violet,
    bg: tint(ONE_REP_PALETTE.violet, 12),
  },
  snack: {
    color: ONE_REP_PALETTE.brass,
    bg: tint(ONE_REP_PALETTE.brass, 12),
  },
} as const

export const CUSTOM_CATEGORY_TONES = [
  { color: ONE_REP_PALETTE.cordovan, bg: tint(ONE_REP_PALETTE.cordovan, 12) },
  { color: ONE_REP_PALETTE.tape, bg: tint(ONE_REP_PALETTE.tape, 12) },
  { color: ONE_REP_PALETTE.plate, bg: tint(ONE_REP_PALETTE.plate, 12) },
  { color: ONE_REP_PALETTE.violet, bg: tint(ONE_REP_PALETTE.violet, 12) },
  { color: ONE_REP_PALETTE.patina, bg: tint(ONE_REP_PALETTE.patina, 12) },
  { color: ONE_REP_PALETTE.brass, bg: tint(ONE_REP_PALETTE.brass, 12) },
] as const

export const EXERCISE_CATEGORY_COLORS = {
  strength: ONE_REP_PALETTE.iron,
  cardio: ONE_REP_PALETTE.tape,
  mobility: ONE_REP_PALETTE.patina,
  core: ONE_REP_PALETTE.plate,
} as const

export const SET_TYPE_TONES = {
  working: {
    color: ONE_REP_PALETTE.plate,
    bg: tint(ONE_REP_PALETTE.plate, 10),
  },
  warmup: {
    color: ONE_REP_PALETTE.zinc,
    bg: tint(ONE_REP_PALETTE.zinc, 10),
  },
  failure: {
    color: ONE_REP_PALETTE.cordovan,
    bg: tint(ONE_REP_PALETTE.cordovan, 10),
  },
  myoreps: {
    color: ONE_REP_PALETTE.brass,
    bg: tint(ONE_REP_PALETTE.brass, 10),
  },
  drop: {
    color: ONE_REP_PALETTE.patina,
    bg: tint(ONE_REP_PALETTE.patina, 10),
  },
} as const

export const MUSCLE_COLORS = {
  quadriceps: ONE_REP_PALETTE.plate,
  glutes: ONE_REP_PALETTE.brass,
  hamstrings: ONE_REP_PALETTE.violet,
  chest: ONE_REP_PALETTE.cordovan,
  back: ONE_REP_PALETTE.patina,
  shoulders: ONE_REP_PALETTE.tape,
  biceps: "#736a78",
  triceps: "#687078",
  core: ONE_REP_PALETTE.brass,
  calves: "#667572",
} as const

export const MICRO_COLORS = {
  fiber: ONE_REP_PALETTE.patina,
  sugar: ONE_REP_PALETTE.brass,
  saturatedFat: "#7d6a6c",
  transFat: ONE_REP_PALETTE.cordovan,
  cholesterol: ONE_REP_PALETTE.tape,
  sodium: ONE_REP_PALETTE.plate,
  potassium: "#6e7466",
  calcium: "#6b7678",
  iron: ONE_REP_PALETTE.violet,
  magnesium: "#6a7773",
  phosphorus: "#70727c",
  zinc: ONE_REP_PALETTE.brass,
  vitaminC: "#7d7465",
  vitaminA: "#7d6f66",
  vitaminD: "#7d7668",
  vitaminB12: "#776c7c",
  caffeine: ONE_REP_PALETTE.zinc,
  alcohol: "#7c6868",
} as const

export const SUPPLEMENT_TONES = {
  creatine: {
    color: ONE_REP_PALETTE.patina,
    bg: tint(ONE_REP_PALETTE.patina, 14),
  },
  protein: {
    color: MACRO_COLORS.protein,
    bg: tint(MACRO_COLORS.protein, 14),
  },
  vitamins: {
    color: ONE_REP_PALETTE.violet,
    bg: tint(ONE_REP_PALETTE.violet, 14),
  },
  caffeine: {
    color: ONE_REP_PALETTE.brass,
    bg: tint(ONE_REP_PALETTE.brass, 14),
  },
} as const

export const NUTRITION_SCORE_COLORS = {
  a: ONE_REP_PALETTE.patina,
  b: "#707566",
  c: ONE_REP_PALETTE.brass,
  d: ONE_REP_PALETTE.tape,
  e: ONE_REP_PALETTE.cordovan,
} as const

export const NOVA_COLORS = [
  ONE_REP_PALETTE.patina,
  ONE_REP_PALETTE.brass,
  ONE_REP_PALETTE.tape,
  ONE_REP_PALETTE.cordovan,
] as const
