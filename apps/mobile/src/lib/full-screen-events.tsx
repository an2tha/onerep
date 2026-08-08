import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"

/**
 * The full-screen event layer.
 *
 * A "moment" is the app taking the whole screen to say something that a toast
 * would not survive: you have not logged today, you have not trained in a
 * while, here is your week. Anything can register one — a page, a provider, a
 * feature nobody has written yet — and this decides whether it gets to open.
 *
 * The rules it enforces, so no registrant has to:
 *  - one at a time, highest priority first;
 *  - never on top of a route where the user is mid-task;
 *  - never twice for the same `key`, on any device;
 *  - never in the first seconds after launch, when the app is still settling.
 *
 * Registrants own their own UI. They get a boolean and a `close`; the layer
 * never renders anything itself.
 */

export type FullScreenEventOutcome = "resolved" | "dismissed"

export type FullScreenEventRegistration = {
  /** Stable across renders. Also the server-side bookkeeping id. */
  id: string
  /**
   * The scope one showing covers — a date, an ISO week, a lapse span. `null`
   * means "not now", either because the data has not loaded or because the
   * trigger has not fired, and is how a registrant stays quiet.
   */
  key: string | null
  /** Higher wins when two events are due at once. Defaults to 0. */
  priority?: number
}

type MomentRecord = {
  eventId: string
  key: string
  outcome: "shown" | "resolved" | "dismissed"
  shownAt: number
  updatedAt: number
}

type LayerApi = {
  activeId: string | null
  activeKey: string | null
  register: (registration: Required<FullScreenEventRegistration>) => void
  unregister: (id: string) => void
  close: (id: string, key: string, outcome: FullScreenEventOutcome) => void
  suppress: () => () => void
  /** Recent server records, for registrants that pace themselves. */
  records: MomentRecord[] | undefined
  /** The event forced open from the developer menu, if any. */
  previewId: string | null
  startPreview: (id: string) => void
  endPreview: () => void
}

const noopApi: LayerApi = {
  activeId: null,
  activeKey: null,
  register: () => {},
  unregister: () => {},
  close: () => {},
  suppress: () => () => {},
  records: undefined,
  previewId: null,
  startPreview: () => {},
  endPreview: () => {},
}

const FullScreenEventContext = createContext<LayerApi>(noopApi)

/**
 * Routes where taking the screen would be an ambush: mid-set, mid-signup,
 * mid-camera. The moment waits; it has waited this long already.
 */
const BLOCKED_ROUTE_PREFIXES = [
  "/workout/active",
  "/workout/log",
  "/onboarding",
  "/login",
  "/sso-callback",
  "/reset-password",
  "/verify-email-required",
  "/email-verified",
  "/camera",
  "/foods/review",
  "/foods/search",
  "/shared",
]

/** Launch grace. Long enough for the first paint to stop looking like one. */
const SETTLE_MS = 3500

function isBlockedRoute(pathname: string) {
  return BLOCKED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function FullScreenEventProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { isAuthenticated } = useConvexAuth()
  const recordsQuery = useQuery(
    api.users.moments.listRecent,
    isAuthenticated ? {} : "skip"
  ) as MomentRecord[] | undefined
  const recordMoment = useMutation(api.users.moments.record)

  const [registrations, setRegistrations] = useState<
    Required<FullScreenEventRegistration>[]
  >([])
  const [settled, setSettled] = useState(false)
  const [suppressors, setSuppressors] = useState(0)
  /**
   * One interruption per launch. Answering a nudge and being handed a second
   * full-screen question on the way out is how an app earns the reputation
   * this layer exists to avoid.
   */
  const [spent, setSpent] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  /**
   * Closing writes through the network, and the query it invalidates takes a
   * round trip to come back. Without a local copy the moment reopens on the
   * very next render, on top of whatever the user tapped through to.
   */
  const [localKeys, setLocalKeys] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const register = useCallback(
    (registration: Required<FullScreenEventRegistration>) => {
      setRegistrations((current) => {
        const existing = current.find((item) => item.id === registration.id)
        if (
          existing &&
          existing.key === registration.key &&
          existing.priority === registration.priority
        ) {
          return current
        }
        return [
          ...current.filter((item) => item.id !== registration.id),
          registration,
        ]
      })
    },
    []
  )

  const unregister = useCallback((id: string) => {
    setRegistrations((current) => current.filter((item) => item.id !== id))
  }, [])

  const suppress = useCallback(() => {
    setSuppressors((count) => count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setSuppressors((count) => Math.max(0, count - 1))
    }
  }, [])

  const seenKeys = useMemo(() => {
    const keys = new Set(localKeys)
    for (const record of recordsQuery ?? []) {
      keys.add(`${record.eventId}:${record.key}`)
    }
    return keys
  }, [localKeys, recordsQuery])

  const startPreview = useCallback((id: string) => setPreviewId(id), [])
  const endPreview = useCallback(() => setPreviewId(null), [])

  const blocked =
    previewId !== null ||
    !settled ||
    spent ||
    suppressors > 0 ||
    !isAuthenticated ||
    recordsQuery === undefined ||
    isBlockedRoute(location.pathname)

  const active = useMemo(() => {
    if (blocked) return null
    const eligible = registrations.filter(
      (item) => item.key !== null && !seenKeys.has(`${item.id}:${item.key}`)
    )
    if (eligible.length === 0) return null
    // Ties break on id so the winner does not flip between renders.
    return [...eligible].sort(
      (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
    )[0]
  }, [blocked, registrations, seenKeys])

  // Record the showing immediately: a moment the user swipes the app away from
  // has still been asked, and asking again tomorrow is how nagging starts.
  const shownRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active || active.key === null) return
    const stamp = `${active.id}:${active.key}`
    if (shownRef.current === stamp) return
    shownRef.current = stamp
    void recordMoment({
      eventId: active.id,
      key: active.key,
      outcome: "shown",
    }).catch(() => {})
  }, [active, recordMoment])

  const close = useCallback(
    (id: string, key: string, outcome: FullScreenEventOutcome) => {
      setLocalKeys((current) => new Set(current).add(`${id}:${key}`))
      setSpent(true)
      void recordMoment({ eventId: id, key, outcome }).catch(() => {})
    },
    [recordMoment]
  )

  const layer = useMemo<LayerApi>(
    () => ({
      activeId: active?.id ?? null,
      activeKey: active?.key ?? null,
      register,
      unregister,
      close,
      suppress,
      records: recordsQuery,
      previewId,
      startPreview,
      endPreview,
    }),
    [
      active,
      close,
      endPreview,
      previewId,
      recordsQuery,
      register,
      startPreview,
      suppress,
      unregister,
    ]
  )

  return (
    <FullScreenEventContext.Provider value={layer}>
      {children}
    </FullScreenEventContext.Provider>
  )
}

/**
 * Registers one full-screen event and reports whether it is on screen.
 *
 * ```tsx
 * const { active, close } = useFullScreenEvent({
 *   id: "moment.missed-log",
 *   key: shouldAsk ? todayKey : null,
 *   priority: 20,
 * })
 * if (!active) return null
 * return <MomentScreen onClose={() => close("dismissed")}>…</MomentScreen>
 * ```
 *
 * The caller renders its own screen. That keeps the moment's data, its
 * mutations and its copy in the component that understands them, instead of
 * marooning a render callback in a registry that has no idea what it is
 * drawing.
 */
export function useFullScreenEvent({
  id,
  key,
  priority = 0,
}: FullScreenEventRegistration) {
  const layer = useContext(FullScreenEventContext)
  const { register, unregister } = layer

  useEffect(() => {
    register({ id, key, priority })
    return () => unregister(id)
  }, [id, key, priority, register, unregister])

  /**
   * Forced open from the developer menu. The trigger has not fired and there
   * may be no `key`, so a registrant in this state has to render from whatever
   * data it happens to have.
   */
  const previewing = layer.previewId === id

  const active =
    previewing ||
    (key !== null && layer.activeId === id && layer.activeKey === key)

  const close = useCallback(
    (outcome: FullScreenEventOutcome = "dismissed") => {
      if (previewing) {
        layer.endPreview()
        return
      }
      if (key === null) return
      layer.close(id, key, outcome)
    },
    [id, key, layer, previewing]
  )

  return { active, previewing, close }
}

/**
 * Opens a moment on demand, trigger and bookkeeping bypassed.
 *
 * For the developer menu only. A preview writes nothing: previewing the
 * weekly report on a Tuesday must not be the reason the real one never
 * arrives on Sunday.
 */
export function useMomentPreview() {
  const { previewId, startPreview, endPreview } = useContext(
    FullScreenEventContext
  )
  return { previewId, startPreview, endPreview }
}

/** Holds every moment back while `active` — a tour, a modal, a recording. */
export function useSuppressFullScreenEvents(active: boolean) {
  const { suppress } = useContext(FullScreenEventContext)

  useEffect(() => {
    if (!active) return
    return suppress()
  }, [active, suppress])
}

/** Recent moment history, for triggers that need to pace themselves. */
export function useMomentRecords() {
  return useContext(FullScreenEventContext).records
}
