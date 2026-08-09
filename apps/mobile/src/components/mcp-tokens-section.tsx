import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Copy, Plus, Trash } from "@phosphor-icons/react"
import { GroupedList, ListRow, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { hapticSelection, hapticMedium } from "@/lib/haptics"
import { logDevWarn } from "@/lib/utils"

type TokenRow = {
  id: Id<"mcpTokens">
  name: string
  prefix: string
  scopes: Array<"read" | "write">
  createdAt: number
  lastUsedAt: number | null
}

function usedLabel(row: TokenRow) {
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

/**
 * Personal access tokens for the MCP endpoint.
 *
 * The plaintext is shown once and never again, which is the only honest way
 * to store one — so the panel makes that obvious at the moment it matters
 * rather than in a help article nobody opens.
 */
export function McpTokensSection({ endpoint }: { endpoint?: string }) {
  const tokens = useQuery(api.mcp.tokens.list) as TokenRow[] | undefined
  const createToken = useAction(api.mcp.tokens.create)
  const revokeToken = useMutation(api.mcp.tokens.revoke)

  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)

  async function create(scopes: Array<"read" | "write">) {
    if (creating) return
    hapticSelection()
    setCreating(true)
    try {
      const { token } = await createToken({
        name: scopes.includes("write") ? "Read & write" : "Read only",
        scopes,
      })
      hapticMedium()
      setIssued(token)
    } catch (error) {
      logDevWarn("Failed to create an MCP token", error)
      toast.error(
        error instanceof Error ? error.message : "Couldn't create that token"
      )
    } finally {
      setCreating(false)
    }
  }

  async function revoke(row: TokenRow) {
    hapticSelection()
    try {
      await revokeToken({ id: row.id })
      toast.success("Token revoked")
    } catch {
      toast.error("Couldn't revoke that token")
    }
  }

  return (
    <>
      <p className="native-row-detail px-[var(--app-page-x)] pb-3">
        A token lets an MCP client — Claude, or anything else that speaks the
        protocol — read your log and, if you allow it, add to it. It is shown
        once. Revoking one takes effect immediately.
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
              Copy token
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

      <GroupedList label="Access tokens">
        {(tokens ?? []).map((row) => (
          <ListRow
            key={row.id}
            title={`${row.name} · ${row.prefix}…`}
            detail={usedLabel(row)}
            onClick={() => void revoke(row)}
            trailing={<Trash size={16} className="text-destructive/70" />}
          />
        ))}
        {tokens !== undefined && tokens.length === 0 && (
          <ListRow
            title="No tokens yet"
            detail="Nothing can reach your log over MCP right now"
            disabled
          />
        )}
        <ListRow
          title={creating ? "Creating…" : "New read-only token"}
          detail="Can see your log and never change it"
          disabled={creating}
          onClick={() => void create(["read"])}
          trailing={<Plus size={16} className="text-muted-foreground" />}
        />
        <ListRow
          title={creating ? "Creating…" : "New read & write token"}
          detail="Can also log food, water, weight and workouts"
          disabled={creating}
          onClick={() => void create(["read", "write"])}
          trailing={<Plus size={16} className="text-muted-foreground" />}
        />
      </GroupedList>

      {endpoint && (
        <div className="mx-[var(--app-page-x)] mt-3">
          <p className="native-row-detail">Endpoint</p>
          <button
            type="button"
            onClick={() => void copy(endpoint)}
            className="mt-1 flex w-full items-center justify-between gap-3 rounded-[0.65rem] bg-muted/50 px-3 py-2.5 text-left"
          >
            <code className="min-w-0 truncate font-mono text-[12px]">
              {endpoint}
            </code>
            <Copy size={14} className="shrink-0 text-muted-foreground" />
          </button>
        </div>
      )}
    </>
  )
}
