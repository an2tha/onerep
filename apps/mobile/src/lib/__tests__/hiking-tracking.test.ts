import { describe, expect, test } from "bun:test"
import {
  acceptGpsPoint,
  appendRoutePoint,
  elevationStep,
  distanceToTrail,
  type GpsPoint,
} from "../hiking-tracking"
import {
  trailDistance,
  validateTrailPoints,
} from "../../../../../convex/lib/trailGeometry"
const start: GpsPoint = {
  latitude: 48,
  longitude: 11,
  altitude: 500,
  altitudeAccuracy: 5,
  accuracy: 5,
  timestamp: 100000,
}
describe("hiking tracking", () => {
  test("rejects poor accuracy, stale timestamps, stationary drift and impossible jumps", () => {
    expect(acceptGpsPoint(null, { ...start, accuracy: 100 }, 5)).toBeNull()
    expect(acceptGpsPoint(start, { ...start, timestamp: 99000 }, 5)).toBeNull()
    expect(
      acceptGpsPoint(
        start,
        { ...start, latitude: 48.000001, timestamp: 120000 },
        5
      )
    ).toBeNull()
    expect(
      acceptGpsPoint(start, { ...start, latitude: 49, timestamp: 110000 }, 5)
    ).toBeNull()
  })
  test("counts real movement but does not connect pauses or missing GPS", () => {
    const moved = { ...start, latitude: 48.0001, timestamp: 110000 }
    expect(acceptGpsPoint(start, moved, 5)?.distance).toBeCloseTo(11.12, 1)
    expect(
      acceptGpsPoint(start, { ...moved, timestamp: 200000 }, 5)
    ).toMatchObject({ distance: 0, point: { segmentStart: true } })
    expect(acceptGpsPoint(null, moved, 5)).toMatchObject({
      distance: 0,
      point: { segmentStart: true },
    })
  })
  test("elevation ignores noisy altitude and small oscillations", () => {
    expect(elevationStep(500, { ...start, altitude: 503 })).toEqual({
      anchor: 500,
      gain: 0,
    })
    expect(
      elevationStep(500, { ...start, altitude: 508, altitudeAccuracy: 80 })
    ).toEqual({ anchor: 500, gain: 0 })
    expect(elevationStep(500, { ...start, altitude: 506 })).toEqual({
      anchor: 506,
      gain: 6,
    })
    expect(elevationStep(500, { ...start, altitude: 494 })).toEqual({
      anchor: 494,
      gain: 0,
    })
    expect(
      elevationStep(500, { ...start, altitude: 600, segmentStart: true })
    ).toEqual({ anchor: 600, gain: 0 })
  })
  test("long routes retain their beginning, end and segment breaks within the limit", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      ...start,
      longitude: 11 + i * 0.001,
      segmentStart: i === 3,
    }))
    const end = { ...start, longitude: 12 }
    const result = appendRoutePoint(points, end, 10)
    expect(result.length).toBeLessThanOrEqual(10)
    expect(result[0]).toEqual(points[0])
    expect(result.at(-1)).toEqual(end)
    expect(result[2]?.segmentStart).toBe(true)
  })
  test("route distance excludes gaps and validation bounds route size and coordinates", () => {
    expect(
      trailDistance([start, { ...start, latitude: 49, segmentStart: true }])
    ).toBe(0)
    expect(() => validateTrailPoints([start])).toThrow()
    expect(() =>
      validateTrailPoints([start, { ...start, latitude: 91 }])
    ).toThrow()
    expect(() => validateTrailPoints(Array(4001).fill(start))).toThrow()
  })
  test("distance to a planned trail uses segments rather than only waypoints", () => {
    const trail = [
      { latitude: 48, longitude: 11 },
      { latitude: 48, longitude: 11.01 },
    ]
    expect(
      distanceToTrail({ latitude: 48, longitude: 11.005 }, trail)
    ).toBeLessThan(1)
    expect(
      distanceToTrail({ latitude: 48.001, longitude: 11.005 }, trail)
    ).toBeCloseTo(111.2, 0)
    expect(
      distanceToTrail({ latitude: 48, longitude: 11.005 }, [
        trail[0]!,
        { ...trail[1]!, segmentStart: true },
      ])
    ).toBeGreaterThan(300)
  })
  test("invalid altitude never makes a good GPS fix unsaveable", () => {
    expect(
      acceptGpsPoint(
        null,
        { ...start, altitude: Infinity, altitudeAccuracy: NaN },
        5
      )?.point
    ).toMatchObject({ altitude: null, altitudeAccuracy: null })
  })
})
