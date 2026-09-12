import { v } from "convex/values";

export const MAX_TRAIL_POINTS = 4000;
export const trailPointValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  altitude: v.optional(v.union(v.number(), v.null())),
  segmentStart: v.optional(v.boolean()),
});
export type TrailPoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  segmentStart?: boolean;
};
export function distanceMeters(a: TrailPoint, b: TrailPoint): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function validateTrailPoints(points: TrailPoint[]) {
  if (
    points.length < 2 ||
    points.length > MAX_TRAIL_POINTS ||
    points.some(
      (p) =>
        !Number.isFinite(p.latitude) ||
        Math.abs(p.latitude) > 90 ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.longitude) > 180 ||
        (p.altitude != null &&
          (!Number.isFinite(p.altitude) ||
            p.altitude < -12000 ||
            p.altitude > 20000)),
    )
  )
    throw new Error("A trail needs 2–4,000 valid map points.");
}
export function trailDistance(points: TrailPoint[]) {
  return points.reduce(
    (total, p, i) =>
      total + (i && !p.segmentStart ? distanceMeters(points[i - 1]!, p) : 0),
    0,
  );
}
