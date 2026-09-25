import { tr, translateError } from "@repo/ui/i18n"
import { useState, type FormEvent } from "react"
import { SettingsChoiceRow } from "@repo/ui/settings"
import {
  applyServerOverride,
  clearServerOverride,
  defaultServerHostname,
  normalizeServerInput,
  serverOverride,
} from "@/lib/server-config"

/**
 * Lets the app point at a different backend — the hosted service or a
 * self-hosted install reached by IP or hostname. Applying a change reloads
 * the app and ends the session on this device, since a login on one server
 * means nothing to another.
 */

export function currentServerLabel() {
  return serverOverride ? serverOverride.input : tr("OneRep Cloud")
}

export function ServerPicker({ disabled }: { disabled?: boolean }) {
  const overrideActive = Boolean(serverOverride)
  const [customSelected, setCustomSelected] = useState(overrideActive)
  const [input, setInput] = useState(serverOverride?.input ?? "")
  const [error, setError] = useState<string | undefined>()
  const [switching, setSwitching] = useState(false)

  const defaultHost = defaultServerHostname()
  const busy = disabled || switching

  function selectDefault() {
    setError(translateError(undefined))
    setCustomSelected(false)
    if (!overrideActive) return
    // Already on a custom server: going back to the default is itself a
    // switch, so it applies immediately.
    setSwitching(true)
    clearServerOverride()
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(translateError(undefined))
    const target = normalizeServerInput(input)
    if (!target) {
      setError(
        translateError(
          tr(
            "That does not look like a server address. Try an IP like 192.168.1.42, or a full URL."
          )
        )
      )
      return
    }
    if (overrideActive && target.convexUrl === serverOverride?.convexUrl) {
      setError(translateError(tr("You are already connected to that server.")))
      return
    }
    setSwitching(true)
    if (!applyServerOverride(input)) {
      setSwitching(false)
      setError(
        translateError(tr("Could not save the server address on this device."))
      )
    }
  }

  return (
    <div role="radiogroup" aria-label={tr("Server")} className="space-y-3">
      <SettingsChoiceRow
        selected={!customSelected}
        title={tr("OneRep Cloud")}
        badge="Default"
        detail={
          defaultHost
            ? tr("The hosted service this app ships with ({{value0}}).", {
                value0: defaultHost,
              })
            : tr("The hosted service this app ships with.")
        }
        disabled={busy}
        onSelect={selectDefault}
      />
      <SettingsChoiceRow
        selected={customSelected}
        title={tr("Self-hosted server")}
        detail={tr(
          "Your own OneRep install, reached by IP address or hostname."
        )}
        disabled={busy}
        onSelect={() => {
          setError(translateError(undefined))
          setCustomSelected(true)
        }}
      />

      {customSelected && (
        <form onSubmit={handleConnect} className="space-y-3 pt-1">
          <label className="native-field">
            <span className="native-field-label">{tr("Server address")}</span>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="192.168.1.42"
              disabled={busy}
              className="native-input disabled:opacity-60"
            />
            <span className="native-field-hint">
              {tr(
                "An IP or hostname is enough — ports 3210 and 3211 are assumed, the self-hosted defaults."
              )}
            </span>
          </label>

          {error && (
            <p role="alert" className="native-field-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            aria-busy={switching}
            className="native-primary-button min-h-12 w-full rounded-[0.8rem]"
          >
            {switching ? tr("Switching…") : tr("Connect to this server")}
          </button>
        </form>
      )}

      <p className="native-row-detail">
        {tr(
          "Switching servers reloads the app and signs you out on this device. Your data stays on whichever server holds your account."
        )}
      </p>
    </div>
  )
}
