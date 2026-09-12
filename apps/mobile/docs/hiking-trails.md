# Hiking trails

Plan a hike on OpenStreetMap, save it privately, and optionally share a revocable link. This is an extension of the existing OneRep interface; the onboarding-scoped `DESIGN.md` and its sidecar remain unchanged.

## Route planning and sharing

- The saved list shows trail names, distance in kilometres, and privacy state. It displays up to the 100 most recent trails. Selecting a trail opens its map and actions; before selection, an empty-state prompt explains how to begin.
- Create a trail by tapping waypoints on the map or entering latitude and longitude in the expandable coordinate fields. Undo removes the last point. Lines connect points directly, without automatically following paths or providing turn-by-turn routing.
- Saving requires at least two points and a nonblank name. Routes are bounded at 4,000 points; names allow 120 characters and optional notes allow 2,000. Cancel discards the draft. A successful save selects the new private trail.
- Share by link enables public viewing at `/trails/:token`. Copy link uses the clipboard and exposes a selectable URL field as a fallback. Stop sharing revokes access through that link. Deletion asks for confirmation and removes the trail and shared access.
- The public page shows the name, distance, map and notes. Missing or revoked links show an unavailable state. Viewing does not require sign-in; starting the hike does. Starting is blocked while another endurance workout is active.

## Following a hike

Starting a saved or shared trail opens an outdoor hiking workout with the planned route. The planned line is purple and dashed; the recorded route is solid blue with a green start marker and a blue latest-position marker. Recorded segment boundaries remain disconnected.

The active screen identifies the planned trail and displays an approximate distance warning when the latest recorded position is more than 50 metres from it. GPS accuracy is shown, and fixes worse than 50 metres are held back from recording. Native builds with the EnduranceLocation bridge keep recording when the screen is locked or another app is open. Browser recordings pause when the page is hidden. See [native endurance recording](native-endurance.md) for recovery behavior and device-validation status. Map tiles require a connection; there is no offline tile download. The workout recording is saved on the device.

## Local UI conventions

The map is the focal surface after selection and during planning. Desktop places a 270-pixel saved-trail column alongside the flexible map/detail area. Smaller screens stack the content and hide the saved list during creation. Map frames have a minimum height of 330 pixels and rounded, bordered edges.

Use the inherited Instrument Sans family and semantic background, foreground, muted and border colours. Page headings are semibold at 30 pixels, section headings at 20 pixels, and supporting copy and controls at 14 pixels. Primary actions invert foreground and background; secondary actions use a border. Controls have modest 10-pixel corners, a minimum height of 44 pixels, and visible keyboard focus outlines. Phosphor icons accompany action labels; map-only buttons have accessible names.

The map offers zoom, metric scale, whole-route framing and location/recentering controls, with OpenStreetMap attribution visible. Dragging stops automatic following; recentering resumes it. Coordinate entry provides an alternative to adding points by map interaction. Tile and location failures use inline status text; save and share failures use toasts. Saved-list loading, empty, selected and privacy states remain explicit.

## Implementation references

- `src/pages/HikingTrails.tsx`: private library, planner, sharing and public trail view.
- `src/components/endurance-route-map.tsx`: Leaflet map, route overlays, markers and controls.
- `src/pages/ActiveEnduranceWorkout.tsx`: planned-trail handoff, recording and deviation feedback.

These conventions describe this feature, rather than establishing new global design tokens or prescribing map layouts for unrelated screens.
