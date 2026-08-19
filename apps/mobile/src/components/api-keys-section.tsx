import { useEffect, useRef, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Copy, Plus } from "@phosphor-icons/react"
import {
  GroupedList,
  ListRow,
  PrimaryButton,
  SegmentedControl,
  toast,
} from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { hapticSelection, hapticMedium } from "@/lib/haptics"
import { logDevWarn } from "@/lib/utils"

/**
 * Settings → API & MCP.
 *
 * Four groups, in the order a person actually needs them: where to point a
 * client, what is already connected, the keys they minted by hand, and the
 * escape hatch for clients that want an ID and secret typed into a form.
 * The two creation flows live in sheets — a form you are not filling in is
 * furniture, and this screen had two of them.
 *
 * Nothing here is revoked in one accidental tap. The first tap arms the row
 * and says so; the second one within a few seconds does it. No dialog, no
 * "are you sure" theatre — just enough friction that a scroll-thumb cannot
 * disconnect your assistant.
 */

type KeyRow = {
  id: Id<"mcpTokens">
  name: string
  prefix: string
  scopes: Array<"read" | "write" | "delete">
  createdAt: number
  lastUsedAt: number | null
}

type ConnectionRow = {
  id: Id<"mcpTokens">
  clientId: string
  name: string
  scopes: Array<"read" | "write" | "delete">
  createdAt: number
  expiresAt: number | null
  lastUsedAt: number | null
}

type ClientRow = {
  id: Id<"mcpOauthClients">
  clientId: string
  clientName: string
  redirectUris: string[]
  createdAt: number
}

type Scope = "read" | "write" | "delete"

const ARM_WINDOW_MS = 4000

function usedLabel(row: { scopes: Scope[]; lastUsedAt: number | null }) {
  const scope = row.scopes.includes("delete")
    ? "full access"
    : row.scopes.includes("write")
      ? "read & write"
      : "read only"
  if (!row.lastUsedAt) return `${scope} · never used`
  const days = Math.floor((Date.now() - row.lastUsedAt) / 86_400_000)
  if (days === 0) return `${scope} · used today`
  if (days === 1) return `${scope} · used yesterday`
  return `${scope} · used ${days} days ago`
}

async function copy(value: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(what)
  } catch {
    toast.error("Couldn't copy. Select it by hand.")
  }
}

/**
 * Two taps to destroy something, a few seconds apart at most. One state slot
 * for the whole screen, so arming a second row quietly stands the first down.
 */
function useArmedRevoke() {
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const timer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function arm(key: string, action: () => void) {
    if (armedKey === key) {
      window.clearTimeout(timer.current)
      setArmedKey(null)
      action()
      return
    }
    hapticSelection()
    setArmedKey(key)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setArmedKey(null), ARM_WINDOW_MS)
  }

  return { armedKey, arm }
}

function ShownOnce({
  values,
  note,
  onDone,
}: {
  values: Array<{ label: string; value: string }>
  note: string
  onDone: () => void
}) {
  return (
    <div className="motion-content-in">
      <h2 className="text-[20px] font-bold">Copy this now</h2>
      <p className="native-row-detail mt-1">{note}</p>

      {values.map((entry) => (
        <div key={entry.label} className="mt-4">
          <p className="native-field-label">{entry.label}</p>
          <button
            type="button"
            onClick={() => void copy(entry.value, `${entry.label} copied`)}
            className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-[0.65rem] bg-muted/60 px-3 py-3 text-left"
          >
            <code className="min-w-0 font-mono text-[12px] break-all">
              {entry.value}
            </code>
            <Copy size={15} className="shrink-0 text-muted-foreground" />
          </button>
        </div>
      ))}

      <PrimaryButton className="mt-6 w-full" onClick={onDone}>
        I've copied it
      </PrimaryButton>
    </div>
  )
}

/**
 * A ladder, not a set of switches: nobody wants a key that can delete a
 * workout but not read one back, and every rung above the first has to be
 * chosen on purpose.
 */
const SCOPE_LADDER: Record<Scope, Scope[]> = {
  read: ["read"],
  write: ["read", "write"],
  delete: ["read", "write", "delete"],
}

const SCOPE_LABELS: Record<Scope, string> = {
  read: "Read only",
  write: "Read & write",
  delete: "Full access",
}

const SCOPE_NOTES: Record<Scope, string> = {
  read: "Sees your log and your health data, and can never change either. Start here.",
  write:
    "Also adds food, water, weight, workouts and activity sessions. It cannot remove anything.",
  delete:
    "Also removes entries, sessions, measurements and days of health readings. Every change lands in the coach's history, so you can undo it in the app — but a key that can delete is one somebody else can delete with.",
}

function NewKeySheet({ onClose }: { onClose: () => void }) {
  const createKey = useAction(api.mcp.tokens.create)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<Scope>("read")
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)

  async function create() {
    if (creating) return
    hapticSelection()
    setCreating(true)
    try {
      const { token } = await createKey({
        name: name.trim() || SCOPE_LABELS[scope],
        scopes: SCOPE_LADDER[scope],
      })
      hapticMedium()
      setIssued(token)
    } catch (error) {
      logDevWarn("Failed to create an API key", error)
      toast.error(
        error instanceof Error ? error.message : "Couldn't create that key"
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel="New key"
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card"
    >
      <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {issued ? (
          <ShownOnce
            values={[{ label: "Your key", value: issued }]}
            note="This is the only time it will be shown. Lose it and you mint another; nobody can read it back out, including us."
            onDone={onClose}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <h2 className="text-[20px] font-bold">New key</h2>
            <p className="native-row-detail mt-1">
              For a config file you control. Assistants that can ask for access
              themselves don't need one of these.
            </p>

            <label className="native-field mt-5">
              <span className="native-field-label">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                className="native-input"
                placeholder="Laptop Claude"
              />
            </label>

            <div className="native-field mt-4">
              <span className="native-field-label">Access</span>
              <SegmentedControl<Scope>
                label="Access"
                value={scope}
                onChange={setScope}
                onInteract={hapticSelection}
                options={[
                  { value: "read", label: "Read" },
                  { value: "write", label: "Write" },
                  { value: "delete", label: "Full" },
                ]}
              />
            </div>

            <p className="native-row-detail mt-2">{SCOPE_NOTES[scope]}</p>

            <PrimaryButton
              type="submit"
              disabled={creating}
              aria-busy={creating}
              className="mt-6 w-full disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create key"}
            </PrimaryButton>
          </form>
        )}
      </div>
    </MobileSheet>
  )
}

function NewClientSheet({ onClose }: { onClose: () => void }) {
  const createClient = useAction(api.mcp.oauth.createClient)
  const [clientName, setClientName] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered] = useState<{
    clientId: string
    clientSecret: string
  } | null>(null)

  async function register() {
    if (registering) return
    hapticSelection()
    setRegistering(true)
    try {
      const result = await createClient({
        clientName: clientName.trim() || "Untitled client",
        redirectUris: [redirectUri.trim()],
      })
      hapticMedium()
      setRegistered(result)
    } catch (error) {
      logDevWarn("Failed to register an OAuth client", error)
      toast.error(
        error instanceof Error ? error.message : "Couldn't register that client"
      )
    } finally {
      setRegistering(false)
    }
  }

  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel="Register an OAuth client"
      overlayClassName="bg-black/45"
      panelClassName="sheet-panel mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card"
    >
      <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {registered ? (
          <ShownOnce
            values={[
              { label: "Client ID", value: registered.clientId },
              { label: "Client secret", value: registered.clientSecret },
            ]}
            note="The ID stays visible in the list. The secret is the only time it will be shown."
            onDone={onClose}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void register()
            }}
          >
            <h2 className="text-[20px] font-bold">Register an OAuth client</h2>
            <p className="native-row-detail mt-1">
              Only for a client that asks you for a Client ID and secret instead
              of registering itself. If yours connected without asking, close
              this and keep your evening.
            </p>

            <label className="native-field mt-5">
              <span className="native-field-label">Name</span>
              <input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                maxLength={80}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                className="native-input"
                placeholder="Claude Desktop"
              />
            </label>

            <label className="native-field mt-4">
              <span className="native-field-label">Redirect URI</span>
              <input
                value={redirectUri}
                onChange={(event) => setRedirectUri(event.target.value)}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                className="native-input"
                placeholder="https://claude.ai/api/mcp/auth_callback"
              />
            </label>

            <p className="native-row-detail mt-2">
              Copy it out of the client exactly — it must match to the
              character. That exactness is what keeps somebody else's app from
              catching your approval.
            </p>

            <PrimaryButton
              type="submit"
              disabled={registering || redirectUri.trim().length === 0}
              aria-busy={registering}
              className="mt-6 w-full disabled:opacity-60"
            >
              {registering ? "Registering…" : "Register client"}
            </PrimaryButton>
          </form>
        )}
      </div>
    </MobileSheet>
  )
}

export function ApiKeysSection({
  apiBaseUrl,
  mcpEndpoint,
}: {
  apiBaseUrl?: string
  mcpEndpoint?: string
}) {
  const keys = useQuery(api.mcp.tokens.list) as KeyRow[] | undefined
  const revokeKey = useMutation(api.mcp.tokens.revoke)

  const connections = useQuery(api.mcp.oauth.listConnections) as
    ConnectionRow[] | undefined
  const revokeConnection = useMutation(api.mcp.oauth.revokeConnection)

  const clients = useQuery(api.mcp.oauth.listClients) as ClientRow[] | undefined
  const revokeClient = useMutation(api.mcp.oauth.revokeClient)

  const [sheet, setSheet] = useState<"key" | "client" | null>(null)
  const { armedKey, arm } = useArmedRevoke()

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      hapticMedium()
      toast.success(done)
    } catch (error) {
      logDevWarn("Revocation failed", error)
      toast.error("That didn't go through. Try again.")
    }
  }

  return (
    <>
      <GroupedList label="Addresses">
        {mcpEndpoint && (
          <ListRow
            title="MCP endpoint"
            detail={
              <code className="font-mono text-[12px]">{mcpEndpoint}</code>
            }
            trailing={<Copy size={16} className="text-muted-foreground" />}
            onClick={() => void copy(mcpEndpoint, "MCP endpoint copied")}
          />
        )}
        {apiBaseUrl && (
          <ListRow
            title="API base URL"
            detail={<code className="font-mono text-[12px]">{apiBaseUrl}</code>}
            trailing={<Copy size={16} className="text-muted-foreground" />}
            onClick={() => void copy(apiBaseUrl, "API base URL copied")}
          />
        )}
      </GroupedList>
      <p className="native-row-detail px-[var(--app-page-x)] pt-2">
        Point an MCP client at the endpoint and it will ask for access itself —
        you approve a screen, it gets a token, done. The REST API takes a key
        from the list below in an Authorization header.
      </p>

      <div className="mt-6">
        <GroupedList label="Connected apps">
          {(connections ?? []).map((row) => {
            const armed = armedKey === `connection:${row.id}`
            return (
              <ListRow
                key={row.id}
                title={armed ? "Tap again to disconnect" : row.name}
                detail={armed ? "It can ask you again later" : usedLabel(row)}
                onClick={() =>
                  arm(
                    `connection:${row.id}`,
                    () =>
                      void run(
                        () => revokeConnection({ id: row.id }),
                        `${row.name} disconnected`
                      )
                  )
                }
                className={armed ? "text-destructive" : undefined}
              />
            )
          })}
          {connections !== undefined && connections.length === 0 && (
            <ListRow
              title="Nothing connected"
              detail="Apps that ask for access appear here, with a way out"
              disabled
            />
          )}
        </GroupedList>
      </div>

      <div className="mt-6">
        <GroupedList label="Personal keys">
          {(keys ?? []).map((row) => {
            const armed = armedKey === `key:${row.id}`
            return (
              <ListRow
                key={row.id}
                title={
                  armed ? "Tap again to revoke" : `${row.name} · ${row.prefix}…`
                }
                detail={
                  armed
                    ? "Whatever holds it stops working immediately"
                    : usedLabel(row)
                }
                onClick={() =>
                  arm(
                    `key:${row.id}`,
                    () =>
                      void run(() => revokeKey({ id: row.id }), "Key revoked")
                  )
                }
                className={armed ? "text-destructive" : undefined}
              />
            )
          })}
          <ListRow
            title="New key"
            detail="Shown once, revocable forever"
            leading={<Plus size={18} className="text-muted-foreground" />}
            onClick={() => {
              hapticSelection()
              setSheet("key")
            }}
          />
        </GroupedList>
      </div>

      <div className="mt-6">
        <GroupedList label="OAuth clients">
          {(clients ?? []).map((row) => {
            const armed = armedKey === `client:${row.id}`
            return (
              <ListRow
                key={row.id}
                title={armed ? "Tap again to remove" : row.clientName}
                detail={
                  armed
                    ? "Every token it was issued dies with it"
                    : row.clientId
                }
                onClick={() =>
                  arm(
                    `client:${row.id}`,
                    () =>
                      void run(
                        () => revokeClient({ id: row.id }),
                        "Client removed"
                      )
                  )
                }
                className={armed ? "text-destructive" : undefined}
              />
            )
          })}
          <ListRow
            title="Register an OAuth client"
            detail="Only if a client asks you for an ID and secret"
            leading={<Plus size={18} className="text-muted-foreground" />}
            onClick={() => {
              hapticSelection()
              setSheet("client")
            }}
          />
        </GroupedList>
      </div>

      {sheet === "key" && <NewKeySheet onClose={() => setSheet(null)} />}
      {sheet === "client" && <NewClientSheet onClose={() => setSheet(null)} />}
    </>
  )
}
