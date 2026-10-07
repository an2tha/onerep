/** Derive a protected mode from the answers, never from a selected mode alone. */
export function nutritionProfileSafetyMode(input: {
  age: number;
  nutritionGoal: string;
  safetyFlags: string[];
  safetyMode: "standard" | "habit" | "clinician" | "recovery";
  trackingMode: string;
}): "standard" | "habit" | "clinician" | "recovery" {
  const flags = input.safetyFlags
    .map((flag) => flag.trim().toLowerCase())
    .filter((flag) => flag && flag !== "none");
  const recovery = [
    "purging_laxatives",
    "fasting_cycles",
    "binge_distress",
    "fear_weight_gain",
    "compulsive_tracking",
    "eating_disorder_history",
  ];
  if (
    input.safetyMode === "recovery" ||
    input.trackingMode === "recovery" ||
    flags.some((flag) => recovery.includes(flag))
  )
    return "recovery";
  if (
    input.safetyMode === "clinician" ||
    input.nutritionGoal === "medical" ||
    flags.some((flag) => flag !== "under_18")
  )
    return "clinician";
  if (
    input.safetyMode === "habit" ||
    input.trackingMode === "habit" ||
    input.age < 18 ||
    flags.includes("under_18")
  )
    return "habit";
  return "standard";
}
