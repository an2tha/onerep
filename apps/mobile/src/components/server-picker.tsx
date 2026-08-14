import { useState, type FormEvent } from "react"
import { CheckCircle, Circle } from "@phosphor-icons/react"
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
  return serverOverride ? serverOverride.input : "OneRep Cloud"
}

function OptionRow({
  selected,
  title,
  detail,
  badge,
  disabled,
  onSelect,
}: {
  selected: boolean
  title: string
  detail: string
  badge?: string
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-[0.8rem] border p-4 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-foreground bg-[var(--surface-raised)]"
          : "border-border hover:border-foreground/40"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-foreground">
        {selected ? (
          <CheckCircle size={20} weight="fill" />
        ) : (
          <Circle size={20} weight="regular" className="text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] leading-5 font-semibold text-foreground">
            {title}
          </span>
          {badge && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[13px] leading-5 break-all text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  )
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
    setError(undefined)
    setCustomSelected(false)
    if (!overrideActive) return
    // Already on a custom server: going back to the default is itself a
    // switch, so it applies immediately.
    setSwitching(true)
    clearServerOverride()
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    const target = normalizeServerInput(input)
    if (!target) {
      setError(
        "That does not look like a server address. Try an IP like 192.168.1.42, or a full URL."
      )
      return
    }
    if (overrideActive && target.convexUrl === serverOverride?.convexUrl) {
      setError("You are already connected to that server.")
      return
    }
    setSwitching(true)
    if (!applyServerOverride(input)) {
      setSwitching(false)
      setError("Could not save the server address on this device.")
    }
  }

  return (
    <div role="radiogroup" aria-label="Server" className="space-y-3">
      <OptionRow
        selected={!customSelected}
        title="OneRep Cloud"
        badge="Default"
        detail={
          defaultHost
            ? `The hosted service this app ships with (${defaultHost}).`
            : "The hosted service this app ships with."
        }
        disabled={busy}
        onSelect={selectDefault}
      />
      <OptionRow
        selected={customSelected}
        title="Self-hosted server"
        detail="Your own OneRep install, reached by IP address or hostname."
        disabled={busy}
        onSelect={() => {
          setError(undefined)
          setCustomSelected(true)
        }}
      />

      {customSelected && (
        <form onSubmit={handleConnect} className="space-y-3 pt-1">
          <label className="native-field">
            <span className="native-field-label">Server address</span>
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
              An IP or hostname is enough — ports 3210 and 3211 are assumed,
              the self-hosted defaults.
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="border-l-2 border-destructive py-1.5 pl-3 text-[14px] leading-5 font-medium text-destructive"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            aria-busy={switching}
            className="native-primary-button min-h-12 w-full rounded-[0.8rem] transition-[opacity,transform] active:scale-[0.99]"
          >
            {switching ? "Switching…" : "Connect to this server"}
          </button>
        </form>
      )}

      <p className="text-[13px] leading-5 text-muted-foreground">
        Switching servers reloads the app and signs you out on this device.
        Your data stays on whichever server holds your account.
      </p>
    </div>
  )
}
