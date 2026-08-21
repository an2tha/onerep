import { useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { useSearchParams } from "react-router"
import { api } from "../../../../convex/_generated/api"

/**
 * The consent screen — the one part of the OAuth dance a human is meant to
 * read.
 *
 * The authorization endpoint on the server has already checked that the app
 * exists and that the address it wants to be sent back to is one it registered;
 * by the time anything renders here, the only open question is whether this
 * person wants to say yes. Approving hands the answer to an action, which is
 * where the authorization code is made — the browser never gets to decide who
 * the grant belongs to.
 */

type Scope = "read" | "write"

const SCOPE_COPY: Record<Scope, { title: string; detail: string }> = {
  read: {
    title: "Read your log",
    detail:
      "Workouts, meals, weight, and everything else you have recorded here.",
  },
  write: {
    title: "Write to your log",
    detail:
      "Add and change entries on your behalf, including ones you did not ask for.",
  },
}

function isScope(value: string): value is Scope {
  return value === "read" || value === "write"
}

export default function OAuthConsent() {
  const [params] = useSearchParams()
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)
  const [error, setError] = useState<string>()

  const clientId = params.get("client_id") ?? ""
  const redirectUri = params.get("redirect_uri") ?? ""
  const codeChallenge = params.get("code_challenge") ?? ""
  const state = params.get("state")

  const scopes = useMemo(() => {
    const requested = (params.get("scope") ?? "read")
      .split(/\s+/)
      .filter(isScope)
    return requested.length > 0 ? requested : (["read"] as Scope[])
  }, [params])

  const approve = useAction(api.mcp.oauth.approve)
  const details = useQuery(
    api.mcp.oauth.consentDetails,
    clientId && redirectUri ? { clientId, redirectUri } : "skip"
  )

  const complete = !!clientId && !!redirectUri && !!codeChallenge

  async function decide(allow: boolean) {
    if (busy) return
    setBusy(allow ? "allow" : "deny")
    setError(undefined)
    try {
      const { redirectTo } = await approve({
        clientId,
        redirectUri,
        scopes,
        codeChallenge,
        state: state ?? undefined,
        allow,
      })
      // Replace, so the back button does not walk the user into a spent code.
      window.location.replace(redirectTo)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That did not go through."
      )
      setBusy(null)
    }
  }

  const problem = !complete
    ? "That link is missing pieces. Start the connection again from the app you were using."
    : details && !details.ok
      ? details.reason === "unknown_client"
        ? "That app is not registered with OneRep, or its registration was removed."
        : "That app asked to be sent somewhere it is not allowed to go. Nothing was approved."
      : null

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <img src="/app-icon.svg" alt="" className="size-8" />
          <span className="native-row-title font-semibold">OneRep</span>
        </header>

        {problem ? (
          <section
            aria-labelledby="consent-title"
            className="motion-content-in"
          >
            <h1 id="consent-title" className="native-large-title">
              Can't connect that
            </h1>
            <p className="native-body mt-3 text-muted-foreground">{problem}</p>
          </section>
        ) : details === undefined ? (
          <p className="native-body text-muted-foreground">Checking…</p>
        ) : (
          <section
            aria-labelledby="consent-title"
            className="motion-content-in"
          >
            <h1 id="consent-title" className="native-large-title">
              Connect {details.clientName}?
            </h1>
            <p className="native-body mt-3 text-muted-foreground">
              It is asking for access to your OneRep log. You can take this back
              at any time in Settings.
            </p>

            <ul className="mt-7 space-y-4">
              {scopes.map((scope) => (
                <li key={scope}>
                  <p className="native-row-title font-semibold">
                    {SCOPE_COPY[scope].title}
                  </p>
                  <p className="native-body text-muted-foreground">
                    {SCOPE_COPY[scope].detail}
                  </p>
                </li>
              ))}
            </ul>

            {details.registration === "dynamic" && (
              <p className="native-body mt-6 text-muted-foreground">
                This app registered itself, which anything is allowed to do. The
                name above is what it calls itself and nobody has checked it. If
                you did not just start this from {details.clientName}, say no.
              </p>
            )}

            {error && (
              <p role="alert" className="native-body mt-6 text-destructive">
                {error}
              </p>
            )}

            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={() => void decide(true)}
                disabled={busy !== null}
                aria-busy={busy === "allow"}
                className="native-primary-button min-h-12 w-full disabled:opacity-50"
              >
                {busy === "allow" ? "Connecting…" : "Allow access"}
              </button>
              <button
                type="button"
                onClick={() => void decide(false)}
                disabled={busy !== null}
                className="native-secondary-button min-h-12 w-full disabled:opacity-50"
              >
                {busy === "deny" ? "Cancelling…" : "No thanks"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
