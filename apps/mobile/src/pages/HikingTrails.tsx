import { useState } from "react"
import { DetailAtmosphere } from "@/components/detail-atmosphere"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Mountains,
  Plus,
  LinkSimple,
  Trash,
  Play,
  ArrowCounterClockwise,
} from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  trailDistance,
  type TrailPoint,
} from "../../../../convex/lib/trailGeometry"
import { EnduranceRouteMap } from "@/components/endurance-route-map"
import { getEmailCallbackUrl } from "@/lib/auth-redirects"
import {
  getActiveEnduranceSport,
  SELECTED_TRAIL_KEY,
} from "@/lib/endurance-workout"
import { safeLocalStorageSet } from "@/lib/utils"

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
const field =
  "mt-2 min-h-11 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
type Trail = {
  name: string
  description: string
  points: TrailPoint[]
  distanceMeters: number
}

function StartTrail({ trail }: { trail: Trail }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useConvexAuth()
  return (
    <button
      className={`${button} bg-foreground text-background`}
      onClick={() => {
        if (!isAuthenticated) {
          navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
          return
        }
        if (getActiveEnduranceSport()) {
          toast.error("Finish your active workout before starting this trail.")
          return
        }
        if (!safeLocalStorageSet(SELECTED_TRAIL_KEY, JSON.stringify(trail))) {
          toast.error(
            "Couldn't prepare this trail. Free some device storage and try again."
          )
          return
        }
        navigate(
          "/endurance/active?sport=hike&environment=outdoor&trail=selected"
        )
      }}
    >
      <Play size={18} />{" "}
      {isAuthenticated ? "Start this hike" : "Sign in to start this hike"}
    </button>
  )
}

export function SharedHikingTrail() {
  const { token = "" } = useParams()
  const trail = useQuery(api.hikingTrails.shared, { token })
  return (
    <DetailAtmosphere tone="endurance" sidebar={false}>
      <main className="outdoor-detail min-h-svh px-5 py-[max(2rem,env(safe-area-inset-top))] text-foreground">
        <div className="mobile-glass trail-detail mx-auto max-w-5xl">
          <Link to="/endurance" className={`${button} mb-6`}>
            <ArrowLeft size={18} /> OneRep endurance
          </Link>
          {trail === undefined ? (
            <p role="status">Loading trail…</p>
          ) : !trail ? (
            <section>
              <h1 className="text-2xl font-semibold">
                This trail link is unavailable
              </h1>
              <p className="mt-3 text-muted-foreground">
                The owner may have stopped sharing it, or the link is
                incomplete.
              </p>
            </section>
          ) : (
            <>
              <h1 className="text-3xl font-semibold break-words">
                {trail.name}
              </h1>
              <p className="mt-3 text-muted-foreground">
                {(trail.distanceMeters / 1000).toFixed(2)} km · Shared hiking
                trail
              </p>
              <div className="relative isolate mt-6 h-[55svh] min-h-[330px] overflow-hidden rounded-xl border border-border">
                <EnduranceRouteMap points={trail.points} tracking={false} />
              </div>
              {trail.description && (
                <p className="mt-5 max-w-prose break-words whitespace-pre-wrap">
                  {trail.description}
                </p>
              )}
              <p className="my-5 text-sm text-muted-foreground">
                A shared route to follow on the map. Check local access and
                conditions before setting out.
              </p>
              <StartTrail trail={trail} />
            </>
          )}
        </div>
      </main>
    </DetailAtmosphere>
  )
}

export default function HikingTrails() {
  const trails = useQuery(api.hikingTrails.list)
  const create = useMutation(api.hikingTrails.create)
  const setSharing = useMutation(api.hikingTrails.setSharing)
  const remove = useMutation(api.hikingTrails.remove)
  const [selected, setSelected] = useState<Id<"hikingTrails"> | null>(null)
  const trail = useQuery(
    api.hikingTrails.get,
    selected ? { id: selected } : "skip"
  )
  const [creating, setCreating] = useState(false)
  const [points, setPoints] = useState<TrailPoint[]>([])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [busy, setBusy] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  function addPoint(point: TrailPoint) {
    setPoints((current) =>
      current.length >= 4000 ? current : [...current, point]
    )
  }
  async function save() {
    setBusy(true)
    try {
      const id = await create({ name, description, points })
      setSelected(id)
      setCreating(false)
      setPoints([])
      setName("")
      setDescription("")
      toast.success("Trail saved privately.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save trail. Try again."
      )
    } finally {
      setBusy(false)
    }
  }
  async function share() {
    if (!selected) return
    setBusy(true)
    try {
      const token = await setSharing({ id: selected, enabled: true })
      const url = getEmailCallbackUrl(`/trails/${token}`)
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        toast.success("Trail link copied.")
      } catch {
        toast.success("Link ready. Copy it below.")
      }
    } catch {
      toast.error("Couldn't create a share link. Try again.")
    } finally {
      setBusy(false)
    }
  }
  const shown = creating ? points : (trail?.points ?? [])
  return (
    <DetailAtmosphere tone="endurance">
      <main className="outdoor-detail min-h-svh px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-24 text-foreground sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link to="/endurance" className={`${button} mb-6`}>
            <ArrowLeft size={18} /> Endurance
          </Link>
          <header className="mobile-glass trail-header mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">Your hiking trails</h1>
              <p className="mt-2 max-w-prose text-muted-foreground">
                Plan the path, take it outside, pass it on.
              </p>
            </div>
            <button
              className={`${button} bg-foreground text-background`}
              disabled={creating}
              onClick={() => {
                setCreating(true)
                setSelected(null)
                setShareUrl("")
              }}
            >
              <Plus size={18} /> Create a trail
            </button>
          </header>
          <div className="grid gap-7 lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside
              aria-label="Saved trails"
              className={
                creating
                  ? "mobile-glass trail-library hidden min-w-0 lg:block"
                  : "mobile-glass trail-library min-w-0"
              }
            >
              <h2 className="mb-3 font-semibold">Saved trails</h2>
              {trails === undefined ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading trails…
                </p>
              ) : trails.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No trails yet. Create one by adding waypoints on the map, or
                  save a recorded hike from your workout history.
                </p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {trails.map((item) => (
                    <li key={item._id}>
                      <button
                        disabled={creating}
                        aria-pressed={selected === item._id}
                        className={`w-full px-3 py-4 text-left disabled:opacity-40 ${selected === item._id ? "bg-muted" : "hover:bg-muted/50"}`}
                        onClick={() => {
                          setSelected(item._id)
                          setShareUrl("")
                          setDeleteOpen(false)
                        }}
                      >
                        <span className="block font-semibold break-words">
                          {item.name}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {(item.distanceMeters / 1000).toFixed(2)} km ·{" "}
                          {item.shareToken ? "Link sharing on" : "Private"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {trails?.length === 100 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Showing your 100 most recent trails.
                </p>
              )}
            </aside>
            <section className="mobile-glass trail-detail min-w-0">
              {!creating && !selected ? (
                <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-border px-7 text-center">
                  <Mountains size={44} className="mb-4 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">
                    Where will you go next?
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Create a trail to sketch your next hike, or choose a saved
                    trail to see its route and share it.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="mb-3 text-xl font-semibold break-words">
                    {creating
                      ? "Plan a trail"
                      : (trail?.name ?? "Loading trail…")}
                  </h2>
                  <div className="relative isolate h-[48svh] min-h-[330px] overflow-hidden rounded-xl border border-border">
                    <EnduranceRouteMap
                      key={creating ? "new" : selected}
                      points={shown}
                      tracking={false}
                      onAddPoint={creating ? addPoint : undefined}
                    />
                  </div>
                  {creating ? (
                    <form
                      className="mt-5 space-y-5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void save()
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          {points.length} waypoints ·{" "}
                          {(trailDistance(points) / 1000).toFixed(2)} km
                        </p>
                        <button
                          type="button"
                          className={button}
                          disabled={!points.length}
                          onClick={() => setPoints((p) => p.slice(0, -1))}
                        >
                          <ArrowCounterClockwise size={18} /> Undo point
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Tap along the paths on the map to add waypoints. Lines
                        connect your points directly; they do not automatically
                        follow trails.
                      </p>
                      {points.length >= 4000 && (
                        <p role="status">
                          This trail has reached the 4,000-point limit.
                        </p>
                      )}
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold">
                          Add a waypoint by coordinates
                        </summary>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="text-sm">
                            Latitude
                            <input
                              className={field}
                              type="number"
                              step="any"
                              min="-90"
                              max="90"
                              value={latitude}
                              onChange={(e) => setLatitude(e.target.value)}
                            />
                          </label>
                          <label className="text-sm">
                            Longitude
                            <input
                              className={field}
                              type="number"
                              step="any"
                              min="-180"
                              max="180"
                              value={longitude}
                              onChange={(e) => setLongitude(e.target.value)}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className={`${button} mt-3`}
                          disabled={points.length >= 4000}
                          onClick={() => {
                            const lat = Number(latitude),
                              lng = Number(longitude)
                            if (
                              !latitude.trim() ||
                              !longitude.trim() ||
                              !Number.isFinite(lat) ||
                              Math.abs(lat) > 90 ||
                              !Number.isFinite(lng) ||
                              Math.abs(lng) > 180
                            ) {
                              toast.error(
                                "Enter a valid latitude and longitude."
                              )
                              return
                            }
                            addPoint({ latitude: lat, longitude: lng })
                            setLatitude("")
                            setLongitude("")
                          }}
                        >
                          Add waypoint
                        </button>
                      </details>
                      <label className="block text-sm font-semibold">
                        Trail name
                        <input
                          required
                          maxLength={120}
                          className={field}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Give this trail a name"
                        />
                      </label>
                      <label className="block text-sm font-semibold">
                        Trail notes{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                        <textarea
                          maxLength={2000}
                          className={`${field} min-h-24`}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Terrain, landmarks, or things to know"
                        />
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className={`${button} bg-foreground text-background`}
                          disabled={busy || points.length < 2 || !name.trim()}
                        >
                          {busy ? "Saving…" : "Save trail"}
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            setCreating(false)
                            setPoints([])
                            setName("")
                            setDescription("")
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : trail ? (
                    <div className="mt-5 space-y-5">
                      <p className="text-sm text-muted-foreground">
                        {(trail.distanceMeters / 1000).toFixed(2)} km ·{" "}
                        {trail.shareToken
                          ? "Anyone with the link can view this route"
                          : "Private — only you can see this route"}
                      </p>
                      {trail.description && (
                        <p className="break-words whitespace-pre-wrap">
                          {trail.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <StartTrail trail={trail} />
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => void share()}
                        >
                          <LinkSimple size={18} />{" "}
                          {trail.shareToken ? "Copy link" : "Share by link"}
                        </button>
                      </div>
                      {shareUrl && (
                        <label className="block text-sm font-semibold">
                          Share link
                          <input
                            readOnly
                            className={field}
                            value={shareUrl}
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {trail.shareToken && (
                          <button
                            className={button}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true)
                              try {
                                await setSharing({
                                  id: trail._id,
                                  enabled: false,
                                })
                                setShareUrl("")
                                toast.success("Link disabled.")
                              } catch {
                                toast.error(
                                  "Couldn't disable sharing. Try again."
                                )
                              } finally {
                                setBusy(false)
                              }
                            }}
                          >
                            Stop sharing
                          </button>
                        )}
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash size={18} /> Delete trail
                        </button>
                      </div>
                      {deleteOpen && (
                        <div className="rounded-xl border border-border p-4">
                          <p className="mb-3">
                            Delete this trail and disable its shared link?
                          </p>
                          <div className="flex gap-3">
                            <button
                              className={button}
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true)
                                try {
                                  await remove({ id: trail._id })
                                  setSelected(null)
                                  setDeleteOpen(false)
                                } catch {
                                  toast.error(
                                    "Couldn't delete trail. Try again."
                                  )
                                } finally {
                                  setBusy(false)
                                }
                              }}
                            >
                              Delete
                            </button>
                            <button
                              className={button}
                              onClick={() => setDeleteOpen(false)}
                            >
                              Keep trail
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : trail === null ? (
                    <p className="mt-4">This trail is no longer available.</p>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </DetailAtmosphere>
  )
}
