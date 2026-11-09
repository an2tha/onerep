import { useEffect, useRef, useState, type FormEvent } from "react"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BracketsCurly,
  Check,
  Copy,
  Cube,
  MagnifyingGlass,
  Plus,
  TerminalWindow,
} from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { operations } from "../../../../packages/sdk/src/operations"
import { version } from "../../../../packages/sdk/package.json"
import { signOutApp } from "../lib/auth-client"
import sculpture from "../assets/developers/progress-world.webp"
import {
  referenceExamples,
  requestExample,
  type Operation,
} from "./developer-reference/requests"
import "./developer-console.css"

const archive = `/sdk/onerep-sdk-${version}.tgz`
const install = `npm install ${window.location.origin}${archive}`
const sections = [
  { id: "applications", title: "Applications", icon: Cube },
  { id: "sdk", title: "SDK quickstart", icon: TerminalWindow },
  { id: "reference", title: "API reference", icon: BracketsCurly },
] as const

function currentSection() {
  return (
    sections.find((item) => "#" + item.id === window.location.hash) ??
    sections[0]
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus("Copied")
    } catch {
      setStatus("Select the text to copy")
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(""), 2500)
  }
  return (
    <button
      type="button"
      className="dp-copy"
      onClick={copy}
      aria-label={`Copy ${label}`}
    >
      {status === "Copied" ? <Check /> : <Copy />}
      <span aria-live="polite">{status || "Copy"}</span>
    </button>
  )
}

function CodeBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="dp-code">
      <div className="dp-code-heading">
        <span>{title}</span>
        <CopyButton label={title} value={text} />
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

function Applications({ active }: { active: boolean }) {
  const clients = useQuery(api.mcp.oauth.listClients, active ? {} : "skip")
  const create = useAction(api.mcp.oauth.createClient)
  const revoke = useMutation(api.mcp.oauth.revokeClient)
  const [registering, setRegistering] = useState(false)
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
    const fields = new FormData(event.currentTarget)
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
      setRegistering(false)
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
  // Keep one-time credentials in memory until Done, even if the user reads
  // the SDK guide during registration. Only render them in Applications.
  if (!active && credentials) return null
  return (
    <div hidden={!active}>
      {credentials ? (
        <section className="dp-panel">
          <h2>Application registered</h2>
          <CodeBlock title="Client ID" text={credentials.clientId} />
          {credentials.clientSecret && (
            <>
              <p>
                Save the client secret in your server’s secret store. It is
                shown only once.
              </p>
              <CodeBlock
                title="Client secret"
                text={credentials.clientSecret}
              />
            </>
          )}
          <button className="dp-button" onClick={() => setCredentials(null)}>
            Done <Check />
          </button>
        </section>
      ) : registering ? (
        <form className="dp-panel dp-form" onSubmit={register}>
          <h2>Register an application</h2>
          <label>
            Application name
            <input
              autoFocus
              name="name"
              maxLength={80}
              required
              pattern=".*\S.*"
            />
            <small>Shown to athletes when they connect.</small>
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
              rows={3}
              placeholder="https://example.org/oauth/callback"
            />
            <small>
              One exact URL per line. Use HTTPS, loopback HTTP for local
              testing, or a reverse-domain scheme for a native app.
            </small>
          </label>
          <div className="dp-actions">
            <button className="dp-button" disabled={busy}>
              {busy ? "Registering…" : "Register application"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="dp-secondary"
              onClick={() => {
                setRegistering(false)
                setError("")
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : clients?.length === 0 ? (
        <section className="dp-welcome">
          <div>
            <h2>
              Register your
              <br />
              first application.
            </h2>
            <p>
              Choose the name athletes will see and where OneRep should return
              them after consent.
            </p>
            <button
              className="dp-button"
              onClick={() => {
                setRegistering(true)
                setError("")
              }}
            >
              <Plus /> Register app
            </button>
          </div>
          <img src={sculpture} alt="" />
        </section>
      ) : (
        <section className="dp-panel">
          <div className="dp-panel-title">
            <h2>
              Registered applications{" "}
              {clients && <small>({clients.length})</small>}
            </h2>
            <button
              className="dp-button"
              onClick={() => {
                setRegistering(true)
                setError("")
                setRemoving(null)
              }}
            >
              <Plus /> Register app
            </button>
          </div>
          {clients === undefined ? (
            <p role="status">Loading applications…</p>
          ) : (
            <ul className="dp-apps">
              {clients.map((client) => (
                <li key={client.id}>
                  <div className="dp-app-name">
                    <span aria-hidden="true">
                      {Array.from(String(client.clientName))[0]?.toUpperCase()}
                    </span>
                    <h3>{client.clientName}</h3>
                  </div>
                  <div className="dp-client-id">
                    <code>{client.clientId}</code>
                    <CopyButton value={client.clientId} label="client ID" />
                  </div>
                  <details>
                    <summary>Callback URLs and settings</summary>
                    {client.redirectUris.map((uri, i) => (
                      <code className="dp-uri" key={i}>
                        {uri}
                      </code>
                    ))}
                    {removing === client.id ? (
                      <div>
                        <p>Removing this application disconnects every user.</p>
                        <div className="dp-actions">
                          <button
                            disabled={busy}
                            className="dp-danger"
                            onClick={() => void remove(client.id)}
                          >
                            Remove application
                          </button>
                          <button
                            disabled={busy}
                            className="dp-secondary"
                            onClick={() => setRemoving(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="dp-danger"
                        onClick={() => setRemoving(client.id)}
                      >
                        Remove application
                      </button>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

const start = `import { OneRep, OneRepOAuth } from "@onerep/sdk";

const oauth = new OneRepOAuth({ clientId, redirectUri });
const { url, transaction } = await oauth.authorize(["read"]);`
const callback = `const tokens = await oauth.exchange(callbackUrl, transaction);
const api = new OneRep({ accessToken: tokens.access_token });

const { subject } = await api.call("get_access");
const workouts = await api.call("list_workouts", { limit: 5 });`

function Quickstart() {
  return (
    <div className="dp-guide">
      <section>
        <h2>Install the SDK</h2>
        <p>
          The package includes JavaScript, TypeScript declarations, and the
          integration guide.
        </p>
        <CodeBlock title="Terminal" text={install} />
        <a className="dp-textlink dp-archive-link" download href={archive}>
          <ArrowDown />
          Download SDK v{version}
        </a>
      </section>
      <section>
        <h2>Request access</h2>
        <p>
          Register an application under <a href="#applications">Applications</a>
          . Save the transaction in the initiating user’s session, then redirect
          their browser to <code>url</code>. Confidential server apps also pass
          their client secret to the constructor.
        </p>
        <CodeBlock title="connect.ts" text={start} />
      </section>
      <section>
        <h2>Read the training log</h2>
        <p>
          At your callback, take the saved transaction from the session. The
          subject identifies this account within your application.
        </p>
        <CodeBlock title="callback.ts" text={callback} />
      </section>
      <section>
        <h2>Manage the connection</h2>
        <p>
          Store tokens per user. Refresh with{" "}
          <code>oauth.refresh(refreshToken)</code> and save both replacement
          tokens. Disconnect with <code>oauth.revoke(refreshToken)</code>.
        </p>
      </section>
    </div>
  )
}

const idSources: Partial<
  Record<Operation["operation"], Operation["operation"]>
> = {
  delete_recipe: "list_recipes",
  update_recipe: "list_recipes",
  update_custom_metric: "list_custom_metrics",
  set_custom_metric_value: "list_custom_metrics",
  delete_custom_metric: "list_custom_metrics",
  delete_body_measurement: "list_body_measurements",
  delete_health_workout: "list_health_workouts",
  delete_food_entry: "get_day",
  delete_water_entry: "get_day",
  delete_workout: "list_workouts",
}

function Endpoint({ item }: { item: Operation }) {
  const [open, setOpen] = useState(
    () => new URLSearchParams(location.search).get("q") === item.operation,
  )
  const idSource = idSources[item.operation]
  const [language, setLanguage] = useState<"curl" | "sdk">("curl")
  const [showType, setShowType] = useState(false)
  const example = referenceExamples[item.operation]
  const input = Object.keys(example.input).length > 0
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className={`dp-method m-${item.method.toLowerCase()}`}>
          {item.method}
        </span>
        <span>
          <strong>{item.operation}</strong>
          <code>{item.path}</code>
        </span>
        <Plus className="dp-expand" />
      </summary>
      {open && (
        <div className="dp-endpoint-body">
          <p>{item.summary}</p>
          <p className="dp-permission">
            Permission ·{" "}
            {item.scope === "delete"
              ? "Personal key with delete access"
              : (item.scope ?? "Any grant")}
          </p>

          <section className="dp-example-section" aria-label="Operation inputs">
            <div className="dp-example-heading">
              <h3>Input</h3>
              {input && (
                <button
                  className="dp-example-switch"
                  aria-pressed={showType}
                  onClick={() => setShowType(!showType)}
                >
                  {showType ? "Show example" : "Show type"}
                </button>
              )}
            </div>
            {input ? (
              <CodeBlock
                title={showType ? "SDK input type" : "SDK input"}
                text={
                  showType
                    ? item.input.replaceAll("; ", ";\n  ")
                    : JSON.stringify(example.input, null, 2)
                }
              />
            ) : (
              <p>This operation takes no parameters.</p>
            )}
            {idSource && (
              <p>
                Replace the sample ID with one returned by{" "}
                <a
                  href={`?q=${idSource}#reference`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${idSource} (opens in a new tab)`}
                >
                  <code>{idSource}</code> <span aria-hidden="true">↗</span>
                </a>
                .
              </p>
            )}
          </section>

          <section className="dp-example-section" aria-label="Request example">
            <div className="dp-example-heading">
              <h3>Request</h3>
              <div
                className="dp-example-options"
                role="group"
                aria-label="Request format"
              >
                <button
                  aria-pressed={language === "curl"}
                  onClick={() => setLanguage("curl")}
                >
                  cURL
                </button>
                <button
                  aria-pressed={language === "sdk"}
                  onClick={() => setLanguage("sdk")}
                >
                  JavaScript SDK
                </button>
              </div>
            </div>
            <CodeBlock
              title={language === "curl" ? "Terminal" : "example.mjs"}
              text={requestExample(item, language)}
            />
          </section>

          <section
            className="dp-example-section dp-example-response"
            aria-label="Response example"
          >
            <h3>Example response</h3>
            <CodeBlock
              title="200 OK · application/json"
              text={JSON.stringify(example.response, null, 2)}
            />
            {example.response &&
              typeof example.response === "object" &&
              "nextCursor" in example.response && (
                <p>
                  Pass a non-null <code>nextCursor</code> as the next request’s{" "}
                  <code>cursor</code>. A null cursor marks the last page.
                </p>
              )}
          </section>
        </div>
      )}
    </details>
  )
}

function Reference() {
  const [query, setQuery] = useState(
    () => new URLSearchParams(location.search).get("q") ?? "",
  )
  const [scope, setScope] = useState("all")
  const results = operations.filter(
    (item) =>
      (scope === "all" || item.scope === scope) &&
      [item.operation, item.method, item.path, item.summary, item.scope]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  return (
    <>
      <details className="dp-reference-help">
        <summary>Using the examples</summary>
        <p>
          Set <code>ONEREP_ACCESS_TOKEN</code> to the athlete’s OAuth access
          token in your shell. Delete examples use{" "}
          <code>ONEREP_DELETE_KEY</code>, a personal key with delete access. Run
          SDK examples in Node.js after <a href="#sdk">installing the SDK</a>.
        </p>
        <p>
          The requests and responses use a sample account. Dates use YYYY-MM-DD.
          Requests that write or delete data act on the account associated with
          your token.
        </p>
        <h3>Handling errors</h3>
        <p>
          REST errors include <code>error.code</code> and{" "}
          <code>error.message</code>. The SDK throws <code>OneRepError</code>{" "}
          with <code>status</code> and <code>code</code>. A 401 means the token
          is missing, expired, or revoked. A 403 means the grant lacks
          permission. For 429, wait the number of seconds in{" "}
          <code>Retry-After</code>.
        </p>
        <CodeBlock
          title="403 Forbidden · application/json"
          text={JSON.stringify(
            {
              error: {
                code: "insufficient_scope",
                message:
                  "This key has read access, and POST /v1/water needs write.",
              },
            },
            null,
            2,
          )}
        />
      </details>
      <div className="dp-filters">
        <label className="dp-search">
          <MagnifyingGlass />
          <input
            type="search"
            aria-label="Search operations"
            placeholder="Search operations or routes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by permission"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All permissions</option>
          <option value="read">Read</option>
          <option value="write">Write</option>
          <option value="delete">Delete</option>
        </select>
      </div>
      <p className="dp-count" role="status">
        {results.length} of {operations.length} operations
      </p>
      <div className="dp-endpoints">
        {results.map((item) => (
          <Endpoint key={item.operation} item={item} />
        ))}
      </div>
      {!results.length && (
        <div className="dp-panel">
          <h2>No matching operations</h2>
          <button
            className="dp-secondary"
            onClick={() => {
              setQuery("")
              setScope("all")
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  )
}

export default function DeveloperConsole() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [section, setSection] = useState(currentSection)
  const [error, setError] = useState("")
  useEffect(() => {
    function navigate() {
      setSection(currentSection())
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", navigate)
    return () => window.removeEventListener("hashchange", navigate)
  }, [])
  useEffect(() => {
    document.title = `${section.title} | OneRep Developers`
  }, [section])
  return (
    <div className="dp-workspace">
      <header className="dp-bar">
        <div className="dp-topline">
          <a className="dp-brand" href="/">
            <img src="/app-icon.svg" alt="" />
            OneRep <span>Developers</span>
          </a>
          <nav aria-label="Account">
            <a href="https://onerep.life/">
              OneRep home <ArrowUpRight />
            </a>
            {isAuthenticated ? (
              <button
                className="dp-secondary"
                onClick={async () => {
                  try {
                    await signOutApp()
                    location.assign("/")
                  } catch {
                    setError("Sign out failed. Try again.")
                  }
                }}
              >
                Sign out
              </button>
            ) : (
              <a className="dp-secondary" href="/login?next=%2Fdevelopers">
                Sign in <ArrowRight />
              </a>
            )}
          </nav>
        </div>
      </header>
      <div className="dp-shell">
        <aside className="dp-sidebar">
          <nav aria-label="Console sections">
            {sections.map(({ id, title, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={section.id === id ? "page" : undefined}
              >
                <Icon />
                {title}
              </a>
            ))}
          </nav>
          <a className="dp-download" href={archive} download>
            <span>
              <strong>OneRep SDK</strong>
              <small>v{version} · .tgz</small>
            </span>
            <ArrowDown />
          </a>
        </aside>
        <main className="dp-main">
          {error && <p role="alert">{error}</p>}
          <div className="dp-heading">
            <h1>{section.title}</h1>
            <p>
              {section.id === "applications"
                ? "Manage the apps that connect to OneRep accounts."
                : section.id === "sdk"
                  ? "Connect your first account with JavaScript or TypeScript."
                  : "Explore the REST routes and their SDK operations. OAuth grants support read and write. Deletes require a personal delete key."}
            </p>
          </div>
          {isAuthenticated && (
            <Applications active={section.id === "applications"} />
          )}
          {section.id === "applications" ? (
            <>
              {isLoading ? (
                <p role="status">Checking your session…</p>
              ) : !isAuthenticated ? (
                <section className="dp-welcome">
                  <div>
                    <h2>
                      Connect your
                      <br />
                      first application.
                    </h2>
                    <p>
                      Sign in to register an OAuth client and configure its
                      callbacks.
                    </p>
                    <a className="dp-button" href="/login?next=%2Fdevelopers">
                      Sign in to OneRep <ArrowRight />
                    </a>
                  </div>
                  <img src={sculpture} alt="" />
                </section>
              ) : null}
              <div className="dp-resource-links">
                <a href="#sdk">
                  <TerminalWindow />
                  <strong>SDK quickstart</strong>
                  <span>From install to first request.</span>
                  <ArrowUpRight />
                </a>
                <a href="#reference">
                  <BookOpen />
                  <strong>API reference</strong>
                  <span>Browse {operations.length} operations.</span>
                  <ArrowUpRight />
                </a>
              </div>
            </>
          ) : section.id === "sdk" ? (
            <Quickstart />
          ) : (
            <Reference />
          )}
        </main>
      </div>
    </div>
  )
}
