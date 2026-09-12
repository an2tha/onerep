import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { Crosshair, ArrowsOut } from "@phosphor-icons/react"
import "leaflet/dist/leaflet.css"
import type { TrailPoint } from "../../../../convex/lib/trailGeometry"

type Props = {
  points: TrailPoint[]
  plannedPoints?: TrailPoint[]
  onAddPoint?: (point: TrailPoint) => void
  tracking?: boolean
}
const EMPTY: TrailPoint[] = []
function segments(points: TrailPoint[]): L.LatLngTuple[][] {
  const result: L.LatLngTuple[][] = []
  for (const point of points) {
    if (!result.length || point.segmentStart) result.push([])
    result[result.length - 1]!.push([point.latitude, point.longitude])
  }
  return result
}
export function EnduranceRouteMap({
  points,
  plannedPoints = EMPTY,
  onAddPoint,
  tracking = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const route = useRef<L.Polyline | null>(null)
  const planned = useRef<L.Polyline | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const following = useRef(true)
  const hasPosition = useRef(false)
  const addPoint = useRef(onAddPoint)
  addPoint.current = onAddPoint
  const [tileError, setTileError] = useState(false)
  const [locationError, setLocationError] = useState("")
  function fit() {
    map.current?.invalidateSize({ animate: false })
    const all = [...plannedPoints, ...points]
    if (all.length)
      map.current?.fitBounds(
        L.latLngBounds(all.map((p) => [p.latitude, p.longitude])),
        { padding: [55, 65], maxZoom: 16, animate: false }
      )
  }
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { zoomControl: false }).setView(
      [20, 0],
      2
    )
    map.current = instance
    const failedTiles = new Set<HTMLElement>()
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", (event: L.TileErrorEvent) => {
        failedTiles.add(event.tile)
        setTileError(true)
      })
      .on("tileload tileunload", (event: L.TileEvent) => {
        failedTiles.delete(event.tile)
        setTileError(failedTiles.size > 0)
      })
      .addTo(instance)
    L.control.zoom({ position: "topright" }).addTo(instance)
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(instance)
    planned.current = L.polyline([], {
      color: "#8b4cbb",
      weight: 5,
      dashArray: "8 8",
    }).addTo(instance)
    route.current = L.polyline([], { color: "#176bdb", weight: 5 }).addTo(
      instance
    )
    markers.current = L.layerGroup().addTo(instance)
    instance.on("dragstart", () => {
      following.current = false
    })
    instance.on("click", (event: L.LeafletMouseEvent) =>
      addPoint.current?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      })
    )
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      hasPosition.current = false
    }
  }, [])
  useEffect(() => {
    planned.current?.setLatLngs(segments(plannedPoints))
    if (plannedPoints.length && !hasPosition.current) {
      map.current?.fitBounds(
        L.latLngBounds(plannedPoints.map((p) => [p.latitude, p.longitude])),
        { padding: [55, 65], maxZoom: 16, animate: false }
      )
    }
  }, [plannedPoints])
  useEffect(() => {
    route.current?.setLatLngs(segments(points))
    markers.current?.clearLayers()
    const last = points.at(-1)
    if (!last) return
    const first = points[0]!
    L.circleMarker([first.latitude, first.longitude], {
      radius: 6,
      color: "white",
      fillColor: "#16754c",
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip("Start")
      .addTo(markers.current!)
    L.circleMarker([last.latitude, last.longitude], {
      radius: 7,
      color: "white",
      fillColor: "#176bdb",
      fillOpacity: 1,
      weight: 3,
    })
      .bindTooltip(tracking ? "Your position" : "End")
      .addTo(markers.current!)
    if (!hasPosition.current) {
      if (!plannedPoints.length)
        map.current?.fitBounds(
          L.latLngBounds(points.map((p) => [p.latitude, p.longitude])),
          { padding: [55, 65], maxZoom: 16, animate: false }
        )
      hasPosition.current = true
    } else if (tracking && following.current)
      map.current?.panTo([last.latitude, last.longitude], { animate: false })
  }, [points, tracking, plannedPoints])
  function locate() {
    following.current = true
    const last = points.at(-1)
    if (tracking && last) {
      map.current?.setView([last.latitude, last.longitude], 16)
      return
    }
    if (!navigator.geolocation) {
      setLocationError("Location is unavailable. Pan the map to your trail.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocationError("")
        map.current?.setView([p.coords.latitude, p.coords.longitude], 15)
      },
      () =>
        setLocationError(
          "Couldn't find your location. Allow location access or pan the map."
        ),
      { timeout: 15000, maximumAge: 30000 }
    )
  }
  return (
    <div className="relative h-full min-h-[330px]">
      <div
        ref={container}
        className="absolute inset-0 z-0"
        aria-label={
          onAddPoint
            ? "Trail planner map. Tap to add a waypoint, or use the coordinate fields below."
            : "OpenStreetMap route map"
        }
      />
      {(tileError || locationError) && (
        <p
          role="status"
          className="absolute top-16 right-14 left-3 z-[1] rounded-lg bg-background p-3 text-sm text-foreground"
        >
          {locationError ||
            (tracking
              ? "Map tiles are unavailable. Your route is still being recorded."
              : "Map tiles are unavailable. Check your connection; your waypoints are still on the map.")}
        </p>
      )}
      <div className="absolute right-3 bottom-9 z-[1] flex flex-col gap-2">
        <button
          type="button"
          onClick={fit}
          disabled={!points.length && !plannedPoints.length}
          aria-label="Show whole route"
          className="flex size-11 items-center justify-center rounded-lg border border-border bg-background text-foreground disabled:opacity-40"
        >
          <ArrowsOut size={22} />
        </button>
        <button
          type="button"
          onClick={locate}
          aria-label={
            tracking ? "Recenter map on your position" : "Find my location"
          }
          className="flex size-11 items-center justify-center rounded-lg border border-border bg-background text-foreground"
        >
          <Crosshair size={22} />
        </button>
      </div>
    </div>
  )
}
