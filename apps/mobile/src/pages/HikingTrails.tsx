import { Message, choice, tr, translateError } from "@repo/ui/i18n"
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
          toast.error(
            translateError(
              tr("Finish your active workout before starting this trail.")
            )
          )
          return
        }
        if (!safeLocalStorageSet(SELECTED_TRAIL_KEY, JSON.stringify(trail))) {
          toast.error(
            translateError(
              tr(
                "Couldn't prepare this trail. Free some device storage and try again."
              )
            )
          )
          return
        }
        navigate(
          "/endurance/active?sport=hike&environment=outdoor&trail=selected"
        )
      }}
    >
      <Play size={18} />{" "}
      {isAuthenticated
        ? tr("Start this hike")
        : tr("Sign in to start this hike")}
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
            <Message
              text={"{{value0}} OneRep endurance"}
              values={{ value0: <ArrowLeft size={18} /> }}
            />
          </Link>
          {trail === undefined ? (
            <p role="status">{tr("Loading trail…")}</p>
          ) : !trail ? (
            <section>
              <h1 className="text-2xl font-semibold">
                {tr("This trail link is unavailable")}
              </h1>
              <p className="mt-3 text-muted-foreground">
                {tr(
                  "The owner may have stopped sharing it, or the link is incomplete."
                )}
              </p>
            </section>
          ) : (
            <>
              <h1 className="text-3xl font-semibold break-words">
                {trail.name}
              </h1>
              <p className="mt-3 text-muted-foreground">
                <Message
                  text={"{{value0}} km · Shared hiking trail"}
                  values={{ value0: (trail.distanceMeters / 1000).toFixed(2) }}
                />
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
                {tr(
                  "A shared route to follow on the map. Check local access and conditions before setting out."
                )}
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
      toast.success(tr("Trail saved privately."))
    } catch (error) {
      toast.error(
        translateError(
          error instanceof Error
            ? error.message
            : tr("Couldn't save trail. Try again.")
        )
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
        toast.success(tr("Trail link copied."))
      } catch {
        toast.success(tr("Link ready. Copy it below."))
      }
    } catch {
      toast.error(
        translateError(tr("Couldn't create a share link. Try again."))
      )
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
            <Message
              text={"{{value0}} Endurance"}
              values={{ value0: <ArrowLeft size={18} /> }}
            />
          </Link>
          <header className="mobile-glass trail-header mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">
                {tr("Your hiking trails")}
              </h1>
              <p className="mt-2 max-w-prose text-muted-foreground">
                {tr("Plan the path, take it outside, pass it on.")}
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
              <Message
                text={"{{value0}} Create a trail"}
                values={{ value0: <Plus size={18} /> }}
              />
            </button>
          </header>
          <div className="grid gap-7 lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside
              aria-label={tr("Saved trails")}
              className={
                creating
                  ? "mobile-glass trail-library hidden min-w-0 lg:block"
                  : "mobile-glass trail-library min-w-0"
              }
            >
              <h2 className="mb-3 font-semibold">{tr("Saved trails")}</h2>
              {trails === undefined ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {tr("Loading trails…")}
                </p>
              ) : trails.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {tr(
                    "No trails yet. Create one by adding waypoints on the map, or save a recorded hike from your workout history."
                  )}
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
                          <Message
                            text={"{{value0}} km · {{value1}}"}
                            values={{
                              value0: (item.distanceMeters / 1000).toFixed(2),
                              value1: choice(
                                item.shareToken ? "Link sharing on" : "Private"
                              ),
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {trails?.length === 100 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {tr("Showing your 100 most recent trails.")}
                </p>
              )}
            </aside>
            <section className="mobile-glass trail-detail min-w-0">
              {!creating && !selected ? (
                <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-border px-7 text-center">
                  <Mountains size={44} className="mb-4 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">
                    {tr("Where will you go next?")}
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {tr(
                      "Create a trail to sketch your next hike, or choose a saved trail to see its route and share it."
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="mb-3 text-xl font-semibold break-words">
                    {creating
                      ? tr("Plan a trail")
                      : (trail?.name ?? tr("Loading trail…"))}
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
                          <Message
                            text={"{{value0}} waypoints · {{value1}} km"}
                            values={{
                              value0: points.length,
                              value1: (trailDistance(points) / 1000).toFixed(2),
                            }}
                          />
                        </p>
                        <button
                          type="button"
                          className={button}
                          disabled={!points.length}
                          onClick={() => setPoints((p) => p.slice(0, -1))}
                        >
                          <Message
                            text={"{{value0}} Undo point"}
                            values={{
                              value0: <ArrowCounterClockwise size={18} />,
                            }}
                          />
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {tr(
                          "Tap along the paths on the map to add waypoints. Lines connect your points directly; they do not automatically follow trails."
                        )}
                      </p>
                      {points.length >= 4000 && (
                        <p role="status">
                          {tr("This trail has reached the 4,000-point limit.")}
                        </p>
                      )}
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold">
                          {tr("Add a waypoint by coordinates")}
                        </summary>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="text-sm">
                            <Message
                              text={"Latitude{{value0}}"}
                              values={{
                                value0: (
                                  <input
                                    className={field}
                                    type="number"
                                    step="any"
                                    min="-90"
                                    max="90"
                                    value={latitude}
                                    onChange={(e) =>
                                      setLatitude(e.target.value)
                                    }
                                  />
                                ),
                              }}
                            />
                          </label>
                          <label className="text-sm">
                            <Message
                              text={"Longitude{{value0}}"}
                              values={{
                                value0: (
                                  <input
                                    className={field}
                                    type="number"
                                    step="any"
                                    min="-180"
                                    max="180"
                                    value={longitude}
                                    onChange={(e) =>
                                      setLongitude(e.target.value)
                                    }
                                  />
                                ),
                              }}
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
                                translateError(
                                  tr("Enter a valid latitude and longitude.")
                                )
                              )
                              return
                            }
                            addPoint({ latitude: lat, longitude: lng })
                            setLatitude("")
                            setLongitude("")
                          }}
                        >
                          {tr("Add waypoint")}
                        </button>
                      </details>
                      <label className="block text-sm font-semibold">
                        <Message
                          text={"Trail name{{value0}}"}
                          values={{
                            value0: (
                              <input
                                required
                                maxLength={120}
                                className={field}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={tr("Give this trail a name")}
                              />
                            ),
                          }}
                        />
                      </label>
                      <label className="block text-sm font-semibold">
                        <Message
                          text={"Trail notes {{value0}}{{value1}}"}
                          values={{
                            value0: (
                              <span className="font-normal text-muted-foreground">
                                {tr("(optional)")}
                              </span>
                            ),
                            value1: (
                              <textarea
                                maxLength={2000}
                                className={`${field} min-h-24`}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={tr(
                                  "Terrain, landmarks, or things to know"
                                )}
                              />
                            ),
                          }}
                        />
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className={`${button} bg-foreground text-background`}
                          disabled={busy || points.length < 2 || !name.trim()}
                        >
                          {busy ? tr("Saving…") : tr("Save trail")}
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
                          {tr("Cancel")}
                        </button>
                      </div>
                    </form>
                  ) : trail ? (
                    <div className="mt-5 space-y-5">
                      <p className="text-sm text-muted-foreground">
                        <Message
                          text={"{{value0}} km · {{value1}}"}
                          values={{
                            value0: (trail.distanceMeters / 1000).toFixed(2),
                            value1: choice(
                              trail.shareToken
                                ? "Anyone with the link can view this route"
                                : "Private — only you can see this route"
                            ),
                          }}
                        />
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
                          {trail.shareToken
                            ? tr("Copy link")
                            : tr("Share by link")}
                        </button>
                      </div>
                      {shareUrl && (
                        <label className="block text-sm font-semibold">
                          <Message
                            text={"Share link{{value0}}"}
                            values={{
                              value0: (
                                <input
                                  readOnly
                                  className={field}
                                  value={shareUrl}
                                  onFocus={(e) => e.target.select()}
                                />
                              ),
                            }}
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
                                toast.success(tr("Link disabled."))
                              } catch {
                                toast.error(
                                  translateError(
                                    tr("Couldn't disable sharing. Try again.")
                                  )
                                )
                              } finally {
                                setBusy(false)
                              }
                            }}
                          >
                            {tr("Stop sharing")}
                          </button>
                        )}
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Message
                            text={"{{value0}} Delete trail"}
                            values={{ value0: <Trash size={18} /> }}
                          />
                        </button>
                      </div>
                      {deleteOpen && (
                        <div className="rounded-xl border border-border p-4">
                          <p className="mb-3">
                            {tr(
                              "Delete this trail and disable its shared link?"
                            )}
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
                                    translateError(
                                      tr("Couldn't delete trail. Try again.")
                                    )
                                  )
                                } finally {
                                  setBusy(false)
                                }
                              }}
                            >
                              {tr("Delete")}
                            </button>
                            <button
                              className={button}
                              onClick={() => setDeleteOpen(false)}
                            >
                              {tr("Keep trail")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : trail === null ? (
                    <p className="mt-4">
                      {tr("This trail is no longer available.")}
                    </p>
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
