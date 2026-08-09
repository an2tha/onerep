import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Copy, Trash } from "@phosphor-icons/react"
import { GroupedList, ListRow, SegmentedControl, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { hapticSelection, hapticMedium } from "@/lib/haptics"
import { logDevWarn } from "@/lib/utils"

type KeyRow = {
  id: Id<"mcpTokens">
  name: string
  prefix: string
  scopes: Array<"read" | "write">
  createdAt: number
  lastUsedAt: number | null
}

type Scope = "read" | "write"

function usedLabel(row: KeyRow) {
  const scope = row.scopes.includes("write") ? "read & write" : "read only"
  if (!row.lastUsedAt) return `${scope} · never used`
  const days = Math.floor((Date.now() - row.lastUsedAt) / 86_400_000)
  if (days === 0) return `${scope} · used today`
  if (days === 1) return `${scope} · used yesterday`
  return `${scope} · used ${days} days ago`
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success("Copied")
  } catch {
    toast.error("Couldn't copy. Select it by hand.")
  }
}

function CopyableUrl({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="native-row-detail">{label}</p>
      <button
        type="button"
        onClick={() => void copy(url)}
        className="mt-1 flex w-full items-center justify-between gap-3 rounded-[0.65rem] bg-muted/50 px-3 py-2.5 text-left"
      >
        <code className="min-w-0 truncate font-mono text-[12px]">{url}</code>
        <Copy size={14} className="shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}

/**
 * One key, two doors: the REST API and the MCP endpoint.
 *
 * The plaintext is shown once and never again, which is the only honest way
 * to store one — so the panel makes that obvious at the moment it matters
 * rather than in a help article nobody opens.
 */
export function ApiKeysSection({
  apiBaseUrl,
  mcpEndpoint,
}: {
  apiBaseUrl?: string
  mcpEndpoint?: string
}) {
  const keys = useQuery(api.mcp.tokens.list) as KeyRow[] | undefined
  const createKey = useAction(api.mcp.tokens.create)
  const revokeKey = useMutation(api.mcp.tokens.revoke)

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
        name: name.trim() || (scope === "write" ? "Read & write" : "Read only"),
        scopes: scope === "write" ? ["read", "write"] : ["read"],
      })
      hapticMedium()
      setIssued(token)
      setName("")
    } catch (error) {
      logDevWarn("Failed to create an API key", error)
      toast.error(
        error instanceof Error ? error.message : "Couldn't create that key"
      )
    } finally {
      setCreating(false)
    }
  }

  async function revoke(row: KeyRow) {
    hapticSelection()
    try {
      await revokeKey({ id: row.id })
      toast.success("Key revoked")
    } catch {
      toast.error("Couldn't revoke that key")
    }
  }

  return (
    <>
      <p className="native-row-detail px-[var(--app-page-x)] pb-3">
        A key reads your log over the REST API, or over MCP for Claude and
        anything else that speaks the protocol, and writes to it if you say so.
        It is shown once. Revoking one takes effect immediately, and nothing a
        key can do deletes anything.
      </p>

      {issued && (
        <section className="mx-[var(--app-page-x)] mb-3 rounded-[0.85rem] border border-border bg-card p-4">
          <h3 className="native-section-title">Copy this now</h3>
          <p className="native-row-detail mt-1">
            This is the only time it will be shown.
          </p>
          <code className="mt-3 block rounded-[0.6rem] bg-muted/60 px-3 py-2.5 font-mono text-[12px] break-all">
            {issued}
          </code>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void copy(issued)}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.65rem] bg-foreground px-3 text-[15px] font-semibold text-background"
            >
              <Copy size={15} weight="bold" />
              Copy key
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="min-h-11 rounded-[0.65rem] bg-muted/60 px-4 text-[15px] font-semibold"
            >
              Done
            </button>
          </div>
        </section>
      )}

      <GroupedList label="Your keys">
        {(keys ?? []).map((row) => (
          <ListRow
            key={row.id}
            title={`${row.name} · ${row.prefix}…`}
            detail={usedLabel(row)}
            onClick={() => void revoke(row)}
            trailing={<Trash size={16} className="text-destructive/70" />}
          />
        ))}
        {keys !== undefined && keys.length === 0 && (
          <ListRow
            title="No keys yet"
            detail="Nothing can reach your log from outside the app right now"
            disabled
          />
        )}
      </GroupedList>

      <section className="mx-[var(--app-page-x)] mt-3 rounded-[0.85rem] border border-border bg-card p-4">
        <h3 className="native-section-title">New key</h3>

        <label className="native-field mt-3">
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

        <div className="native-field mt-3">
          <span className="native-field-label">Access</span>
          <SegmentedControl<Scope>
            label="Access"
            value={scope}
            onChange={setScope}
            onInteract={hapticSelection}
            options={[
              { value: "read", label: "Read only" },
              { value: "write", label: "Read & write" },
            ]}
          />
        </div>

        <p className="native-row-detail mt-2">
          {scope === "write"
            ? "Can see your log and add food, water, weight and workouts to it."
            : "Can see your log and never change it. Start here."}
        </p>

        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          aria-busy={creating}
          className="mt-4 min-h-11 w-full rounded-[0.65rem] bg-foreground px-3 text-[15px] font-semibold text-background disabled:opacity-60"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </section>

      {(apiBaseUrl || mcpEndpoint) && (
        <div className="mx-[var(--app-page-x)] mt-3 flex flex-col gap-3">
          {apiBaseUrl && <CopyableUrl label="API base URL" url={apiBaseUrl} />}
          {mcpEndpoint && (
            <CopyableUrl label="MCP endpoint" url={mcpEndpoint} />
          )}
        </div>
      )}
    </>
  )
}
