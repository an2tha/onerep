// Fan-out for the reactive orb's appetite: a log shakes a droplet loose,
// a deletion calls the leaks home. (Resting size comes from the streak,
// which the orb reads itself.) Fire-and-forget window events so any
// surface — drawers, moments, timeline, coach — can talk to the orb
// without importing it. The orb only listens while animated; under reduced
// motion it stays static and these announcements go nowhere, which is
// exactly right.

export type OrbActivityKind =
  | "log"
  | "delete"
  | "workout-set"
  | "workout-undo"
  | "workout-ready"

export function announceOrbActivity(kind: OrbActivityKind, magnitude = 1) {
  window.dispatchEvent(
    new CustomEvent("orb-activity", { detail: { kind, magnitude } })
  )
}
