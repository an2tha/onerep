import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import { Crosshair } from "@phosphor-icons/react"
import "leaflet/dist/leaflet.css"

type Point = { latitude: number; longitude: number }

/** Geographic coordinates stay in Leaflet's projection, including on resize. */
export function EnduranceRouteMap({ points }: { points: Point[] }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const route = useRef<L.Polyline | null>(null)
  const position = useRef<L.CircleMarker | null>(null)
  const following = useRef(true)
  const hasPosition = useRef(false)
  const [tileError, setTileError] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { zoomControl: false }).setView(
      [20, 0],
      2
    )
    map.current = instance
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    ).addTo(instance)
    tiles.on("tileerror", () => setTileError(true))
    tiles.on("tileload", () => setTileError(false))
    L.control.zoom({ position: "topright" }).addTo(instance)
    route.current = L.polyline([], {
      color: "#176bdb",
      weight: 5,
      lineCap: "round",
    }).addTo(instance)
    instance.on("dragstart", () => {
      following.current = false
    })
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      position.current = null
      hasPosition.current = false
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    const last = points.at(-1)
    if (!instance || !last) return
    const latLngs = points.map((point): L.LatLngTuple => [
      point.latitude,
      point.longitude,
    ])
    route.current?.setLatLngs(latLngs)
    const current: L.LatLngTuple = [last.latitude, last.longitude]
    if (!position.current) {
      position.current = L.circleMarker(current, {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#176bdb",
        fillOpacity: 1,
      })
        .addTo(instance)
        .bindTooltip("Current position")
    } else position.current.setLatLng(current)
    if (!hasPosition.current) {
      if (points.length > 1)
        instance.fitBounds(L.latLngBounds(latLngs), {
          padding: [45, 65],
          maxZoom: 16,
        })
      else instance.setView(current, 16)
      hasPosition.current = true
    } else if (following.current) instance.panTo(current, { animate: false })
  }, [points])

  return (
    <div className="relative h-full min-h-[300px]">
      <div
        ref={container}
        className="absolute inset-0 z-0"
        role="region"
        aria-label="Live street map and recorded GPS route"
      />
      {tileError && (
        <p
          role="status"
          className="endurance-glass absolute top-16 right-3 left-16 z-[1] rounded-xl p-3 text-[12px]"
        >
          Map tiles couldn’t load. Check your connection; GPS recording
          continues.
        </p>
      )}
      <button
        type="button"
        disabled={!points.length}
        aria-label="Recenter map on your position"
        onClick={() => {
          const last = points.at(-1)
          if (!last) return
          following.current = true
          map.current?.setView([last.latitude, last.longitude], 16)
        }}
        className="endurance-glass motion-tactile absolute right-3 bottom-9 z-[1] flex size-11 items-center justify-center rounded-full disabled:opacity-40"
      >
        <Crosshair size={22} weight="bold" />
      </button>
    </div>
  )
}
