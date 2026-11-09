import { useEffect, useState, type FormEvent } from "react"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { operations } from "../../../../packages/sdk/src/operations"
import { signOutApp } from "../lib/auth-client"
import "./developer-console.css"

const archive = "/sdk/onerep-sdk-0.1.1.tgz"
const install = `npm install ${window.location.origin}${archive}`

function Applications() {
  const clients = useQuery(api.mcp.oauth.listClients)
  const create = useAction(api.mcp.oauth.createClient)
  const revoke = useMutation(api.mcp.oauth.revokeClient)
  const [credentials, setCredentials] = useState<{
    clientId: string
    clientSecret: string
  } | null>(null)
  const [removing, setRemoving] = useState<Id<"mcpOauthClients"> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(true)
    setError("")
    try {
      setCredentials(
        await create({
          clientName: String(fields.get("name")).trim(),
          redirectUris: String(fields.get("callback")).split(/\r?\n/),
          publicClient: fields.get("type") === "public",
        }),
      )
      form.reset()
    } catch {
      setError(
        "Registration failed. Check the callback URLs and your connection. Each account can have ten applications.",
      )
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: Id<"mcpOauthClients">) {
    setBusy(true)
    setError("")
    try {
      await revoke({ id })
      setRemoving(null)
    } catch {
      setError("Could not remove the application. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {clients === undefined ? (
        <p role="status">Loading applications…</p>
      ) : clients.length === 0 ? (
        <p>You have no registered applications.</p>
      ) : (
        <ul className="dev-apps">
          {clients.map((client) => (
            <li key={client.id}>
              <strong>{client.clientName}</strong>
              <code>{client.clientId}</code>
              {client.redirectUris.map((uri) => (
                <small key={uri}>{uri}</small>
              ))}
              {removing === client.id ? (
                <div>
                  <p>Removing this app disconnects every user.</p>
                  <button
                    disabled={busy}
                    onClick={() => void remove(client.id)}
                  >
                    Remove application
                  </button>
                  <button disabled={busy} onClick={() => setRemoving(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setRemoving(client.id)}>
                  Remove {client.clientName}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {credentials ? (
        <div role="status" className="dev-credentials">
          <h3>Application registered</h3>
          <label>
            Client ID
            <input readOnly value={credentials.clientId} />
          </label>
          {credentials.clientSecret && (
            <label>
              Client secret
              <input readOnly value={credentials.clientSecret} />
              <small>
                Save this in your server’s secret store before closing.
              </small>
            </label>
          )}
          <button onClick={() => setCredentials(null)}>Done</button>
        </div>
      ) : (
        <form onSubmit={register}>
          <h3>Register an application</h3>
          <label>
            Application name
            <input name="name" maxLength={80} required pattern=".*\S.*" />
          </label>
          <label>
            Application type
            <select name="type">
              <option value="public">Browser or native app (PKCE)</option>
              <option value="server">
                Server app (PKCE and client secret)
              </option>
            </select>
          </label>
          <label>
            Callback URLs
            <textarea
              name="callback"
              required
              rows={2}
              placeholder="https://example.org/oauth/callback"
            />
            <small>
              One exact URL per line. Use HTTPS, loopback HTTP for local
              testing, or a reverse-domain scheme for a native app.
            </small>
          </label>
          <button className="dev-primary" disabled={busy}>
            {busy ? "Saving…" : "Register application"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

export default function DeveloperConsole() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [sessionError, setSessionError] = useState("")
  const [filter, setFilter] = useState("")
  const results = operations.filter((item) =>
    (item.operation + item.path + item.scope)
      .toLowerCase()
      .includes(filter.toLowerCase()),
  )
  useEffect(() => {
    const previous = document.title
    document.title = "Developer console | OneRep"
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <main className="dev-console">
      <header>
        <img src="/app-icon.svg" alt="" width="32" height="32" />
        <strong>OneRep</strong>
        <span>Developers</span>
        {isAuthenticated && <button className="dev-signout" onClick={async () => {
          try { await signOutApp(); window.location.assign("/developers") }
          catch { setSessionError("Sign out failed. Check your connection and try again.") }
        }}>Sign out</button>}
      </header>
      {sessionError && <p role="alert">{sessionError}</p>}
      <div className="dev-layout">
        <nav aria-label="Developer console">
          <a href="#applications">Applications</a>
          <a href="#sdk">SDK quickstart</a>
          <a href="#reference">API reference</a>
        </nav>
        <div className="dev-content">
          <section id="applications">
            <h1>Applications</h1>
            <p>
              Register the app name people will see when they connect their
              OneRep account.
            </p>
            {isLoading ? (
              <p role="status">Checking your session…</p>
            ) : isAuthenticated ? (
              <Applications />
            ) : (
              <a className="dev-primary" href="/login?next=%2Fdevelopers">
                Sign in to manage applications
              </a>
            )}
          </section>
          <section id="sdk">
            <h2>SDK quickstart</h2>
            <p>
              Install the JavaScript and TypeScript SDK. The package includes
              the integration guide.
            </p>
            <pre>{install}</pre>
            <a href={archive} download>
              Download SDK v0.1.1
            </a>
            <h3>Connect an account</h3>
            <pre>{`import { OneRep, OneRepOAuth } from "@onerep/sdk";

const oauth = new OneRepOAuth({ clientId, redirectUri });
const { url, transaction } = await oauth.authorize(["read"]);`}</pre>
            <p>
              Save the transaction in the initiating user’s session, then
              redirect them to <code>url</code>. At your callback, retrieve and
              remove that transaction. Server apps also pass their client secret
              to the constructor.
            </p>
            <pre>{`const tokens = await oauth.exchange(callbackUrl, transaction);
const api = new OneRep({ accessToken: tokens.access_token });
const { subject } = await api.call("get_access");
const workouts = await api.call("list_workouts", { limit: 5 });`}</pre>
            <p>
              The subject identifies this account within your application. Store
              tokens per user. Refresh with{" "}
              <code>oauth.refresh(refreshToken)</code> and save both replacement
              tokens. Disconnect with <code>oauth.revoke(refreshToken)</code>.
            </p>
          </section>
          <section id="reference">
            <h2>API reference</h2>
            <p>
              Request read access for health and training data. Add write access
              to update a user’s log. Delete operations require a personal
              delete key.
            </p>
            <label>
              Find an operation
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search by operation, route or permission"
              />
            </label>
            <ul className="dev-reference">
              {results.map((item) => (
                <li key={item.operation}>
                  <strong>{item.operation}</strong>
                  <small>{item.scope ?? "Any grant"}</small>
                  <code>
                    {item.method} {item.path}
                  </code>
                  <p>{item.summary}</p>
                  {item.input !== "Record<string, never>" && <details><summary>SDK input</summary><pre>{item.input.replaceAll("; ", ";\n  ")}</pre></details>}
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p role="status">No matching operations.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
