import { useId, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import {
  DisclosureRow,
  GroupedList,
  ListRow,
  PrimaryButton,
  SettingsSectionLabel,
  toast,
} from "@repo/ui"
import { tr, translateError } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import { trackUmami } from "@/lib/analytics"

/** Personal keys follow the server policy, with removal for existing keys. */
export function AiKeySettings({ onOpenServer }: { onOpenServer?: () => void }) {
  const status = useQuery(api.ai.byok.getStatus, {})
  const saveKey = useAction(api.ai.byok.setKey)
  const removeKey = useMutation(api.ai.byok.removeKey)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const inputId = useId()

  if (status === undefined) {
    return onOpenServer ? (
      <SettingsSectionLabel
        title={tr("Your own AI key")}
        detail={tr("Loading…")}
      />
    ) : null
  }

  if (status.available === false && !status.configured) {
    return onOpenServer ? (
      <GroupedList label={tr("Your own AI key")} className="mt-4">
        <DisclosureRow
          title={tr("Your own AI key")}
          detail={tr(
            "Personal OpenRouter keys are available only on self-hosted servers."
          )}
          value={tr("Server")}
          onClick={onOpenServer}
        />
      </GroupedList>
    ) : null
  }

  return (
    <>
      <SettingsSectionLabel
        title={tr("Your own AI key")}
        detail={
          status.available === false
            ? tr(
                "Your key is still serving your AI requests. Remove it and the included allowance takes over."
              )
            : tr(
                "Add your OpenRouter API key and AI features run on it, with no monthly cap and no Pro required. You pay OpenRouter directly for what you use."
              )
        }
      />
      {status.configured ? (
        <GroupedList label={tr("Your OpenRouter key")}>
          <ListRow
            title={tr("Key ending in {{value0}}", { value0: status.last4 })}
            detail={tr(
              "AI requests use your key. Remove it to go back to the included allowance."
            )}
            value={busy ? tr("Removing…") : tr("Remove")}
            disabled={busy}
            busy={busy}
            onClick={async () => {
              if (busy) return
              setBusy(true)
              try {
                await removeKey({})
                toast.success(tr("Key removed"))
              } catch (error) {
                toast.error(
                  translateError(
                    error instanceof Error
                      ? error.message
                      : tr("Couldn't remove the key")
                  )
                )
              } finally {
                setBusy(false)
              }
            }}
          />
        </GroupedList>
      ) : (
        <form
          className="px-[var(--app-page-x)]"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy || !input.trim().startsWith("sk-or-")) return
            setBusy(true)
            try {
              await saveKey({ key: input.trim() })
              setInput("")
              toast.success(tr("Key saved. AI now runs on your key"))
              trackUmami("byok_key_saved")
            } catch (error) {
              toast.error(
                translateError(
                  error instanceof ConvexError
                    ? String(error.data)
                    : tr("This API key is invalid. Check it and try again.")
                )
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor={inputId} className="native-row-detail mb-2 block">
            {tr("OpenRouter API key")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={tr("sk-or-…")}
              value={input}
              disabled={busy}
              onChange={(event) => setInput(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <PrimaryButton
              type="submit"
              aria-label={tr("Save OpenRouter key")}
              aria-busy={busy}
              disabled={busy || !input.trim().startsWith("sk-or-")}
            >
              {busy ? tr("Verifying…") : tr("Save")}
            </PrimaryButton>
          </div>
        </form>
      )}
    </>
  )
}
