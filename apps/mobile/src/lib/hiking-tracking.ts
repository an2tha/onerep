import {
  distanceMeters,
  type TrailPoint,
} from "../../../../convex/lib/trailGeometry"
export type GpsPoint = TrailPoint & {
  altitude: number | null
  accuracy?: number
  altitudeAccuracy?: number | null
  timestamp: number
}

/** Reject uncertain fixes and stationary drift; gaps start a new line. */
export function acceptGpsPoint(
  previous: GpsPoint | null,
  point: GpsPoint,
  maximumSpeed: number
) {
  if (
    !Number.isFinite(point.timestamp) ||
    !Number.isFinite(point.latitude) ||
    Math.abs(point.latitude) > 90 ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.longitude) > 180 ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy! < 0 ||
    point.accuracy! > 50
  )
    return null
  point = {
    ...point,
    altitude:
      point.altitude != null &&
      Number.isFinite(point.altitude) &&
      point.altitude >= -12000 &&
      point.altitude <= 20000
        ? point.altitude
        : null,
    altitudeAccuracy:
      point.altitudeAccuracy != null && Number.isFinite(point.altitudeAccuracy)
        ? point.altitudeAccuracy
        : null,
  }
  if (!previous) return { point: { ...point, segmentStart: true }, distance: 0 }
  const seconds = (point.timestamp - previous.timestamp) / 1000
  if (seconds <= 0) return null
  if (seconds > 60)
    return { point: { ...point, segmentStart: true }, distance: 0 }
  const distance = distanceMeters(previous, point)
  if (distance / seconds > maximumSpeed) return null
  const noise = Math.max(
    3,
    Math.min(12, ((previous.accuracy ?? 20) + point.accuracy!) * 0.2)
  )
  if (distance < noise) return null
  return { point, distance }
}

/** A five-metre hysteresis prevents summing every tiny upward GPS wobble. */
export function elevationStep(anchor: number | null, point: GpsPoint) {
  if (
    point.altitude == null ||
    !Number.isFinite(point.altitude) ||
    point.altitudeAccuracy == null ||
    !Number.isFinite(point.altitudeAccuracy) ||
    point.altitudeAccuracy > 20 ||
    point.altitudeAccuracy < 0
  )
    return { anchor, gain: 0 }
  if (anchor == null || point.segmentStart)
    return { anchor: point.altitude, gain: 0 }
  const delta = point.altitude - anchor
  return Math.abs(delta) >= 5
    ? { anchor: point.altitude, gain: Math.max(0, delta) }
    : { anchor, gain: 0 }
}

/** Downsample the full path rather than throwing away the start of a long hike. */
export function appendRoutePoint<T extends TrailPoint>(
  points: T[],
  point: T,
  limit = 4000
): T[] {
  if (points.length < limit) return [...points, point]
  const sampled = points
    .filter((_, i) => i % 2 === 0 || i === points.length - 1)
    .map((p, i) => {
      const previousIndex = i === 0 ? 0 : (i - 1) * 2
      const index = Math.min(i * 2, points.length - 1)
      return points
        .slice(previousIndex + 1, index + 1)
        .some((p) => p.segmentStart)
        ? { ...p, segmentStart: true }
        : p
    })
  return [...sampled, point]
}

/** Distance to the closest route segment, ignoring gaps in recorded trails. */
export function distanceToTrail(point: TrailPoint, trail: TrailPoint[]) {
  let nearest = Infinity
  for (let i = 0; i < trail.length; i++) {
    const a = trail[i]!
    nearest = Math.min(nearest, distanceMeters(point, a))
    const b = trail[i + 1]
    if (!b || b.segmentStart) continue
    const scale = Math.cos((point.latitude * Math.PI) / 180)
    const dx = (b.longitude - a.longitude) * scale
    const dy = b.latitude - a.latitude
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) continue
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.longitude - a.longitude) * scale * dx +
          (point.latitude - a.latitude) * dy) /
          lengthSquared
      )
    )
    nearest = Math.min(
      nearest,
      distanceMeters(point, {
        latitude: a.latitude + t * dy,
        longitude: a.longitude + t * (b.longitude - a.longitude),
      })
    )
  }
  return nearest
}
