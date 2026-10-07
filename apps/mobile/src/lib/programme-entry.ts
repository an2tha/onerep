export type ProgrammeMode = "guided" | "manual" | "explore"
export type ProgrammeTrack = "nutrition" | "training" | "both"

export function isProgrammeMode(value: unknown): value is ProgrammeMode {
  return value === "guided" || value === "manual" || value === "explore"
}

export function isProgrammeTrack(value: unknown): value is ProgrammeTrack {
  return value === "nutrition" || value === "training" || value === "both"
}

export function programmeSetupDestination(
  mode: ProgrammeMode | null,
  track: ProgrammeTrack | null,
): string | null {
  if (!mode || mode === "explore" || !track) return null
  return `/programmes?setup=1&track=${track}&mode=${mode}`
}
