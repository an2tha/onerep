// Fan-out for the reactive orb's appetite: logging feeds it, deletions
// starve it. Fire-and-forget window events so any surface — drawers,
// moments, timeline, coach — can talk to the orb without importing it.
// The orb only listens while animated; under reduced motion it stays
// static and these announcements go nowhere, which is exactly right.

export type OrbActivityKind = "log" | "delete"

export function announceOrbActivity(kind: OrbActivityKind, magnitude = 1) {
  window.dispatchEvent(
    new CustomEvent("orb-activity", { detail: { kind, magnitude } })
  )
}
