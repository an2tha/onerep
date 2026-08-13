# Architecture

How OneRep fits together, written down so nobody has to reconstruct it from
imports at midnight. The short version: one React app, one Convex backend, one
food-data sidecar, and two shared packages that keep the first two honest.

## The shape of the thing

```text
apps/mobile ──── Convex client ────▶ convex/          (queries, mutations, actions)
     │                                  │
     │  HTTP (v1 API, MCP, webhooks)    ├──▶ apps/datasource   (USDA food + exercises)
     └──────────────────────────────▶   ├──▶ OpenRouter        (Coach, photo logging)
                                        ├──▶ Resend            (auth email)
                                        └──▶ payment provider  (behind a seam; see below)
```

`apps/mobile` is the entire client: responsive web app, installable PWA, and
the Capacitor iOS/Android shells around the same bundle. It talks to Convex
directly over the Convex client — there is no bespoke API server in the middle,
and there never needs to be. Everything with a secret in it runs inside the
Convex deployment.

## convex/ — the backend

Convex owns the schema, auth, realtime sync, scheduled work, and every
server-side integration. The layout is by domain, not by verb:

| Module                        | What it owns                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`            | Every table. Start here when a name means nothing to you.                                                        |
| `convex/users/`               | Accounts, onboarding, goals, preferences.                                                                        |
| `convex/logs/`                | Food, water, supplements, and the other daily writes.                                                            |
| `convex/ai/`                  | The Coach: prompts (source-controlled YAML under `ai/prompts/`), operations, workspace assembly, usage metering. |
| `convex/food/`                | Food search and barcode lookups, proxied to the datasource with a server-side cache.                             |
| `convex/billing/`             | Entitlement, subscription state, and the provider seam. Detailed in [`billing.md`](./billing.md).                |
| `convex/api/` + `convex/mcp/` | The public HTTP API and MCP endpoint. Documented in [`api.md`](./api.md) and [`mcp.md`](./mcp.md).               |
| `convex/http.ts`              | Route table for everything above plus webhooks.                                                                  |
| `convex/crons.ts`             | Scheduled reconciliation and upkeep.                                                                             |
| `convex/lib/`                 | Domain logic pure enough to unit test without a database.                                                        |

Two conventions worth knowing before you write Convex code here:

- Read `convex/_generated/ai/guidelines.md` first; it corrects several things
  you probably believe about Convex.
- Modules marked `"use node"` can only host actions. Every database write from
  those goes through an internal mutation in a sibling module — `billing/` is
  the worked example.

## apps/datasource — the food sidecar

A self-hosted Bun + SQLite service serving USDA FoodData Central and the
exercise catalog. It exists because third-party food APIs are rate-limited,
priced, or both, and food search is the hottest path in the app. Convex is its
only client; the mobile app never talks to it directly. It has its own
[README](../apps/datasource/README.md).

## packages/ — the shared boundary

- **`packages/ui`** is the presentation boundary: primitives, presenters, and
  the Tailwind theme. It renders props and raises callbacks. It does not know
  Convex exists, and pull requests that teach it otherwise get declined.
  `apps/mobile` owns routing, data fetching, auth, platform APIs, and state.
  The longer contract is in [`packages/ui/README.md`](../packages/ui/README.md).
- **`packages/models`** holds the TypeScript models shared between client and
  backend, including the Coach operation contracts — the one vocabulary both
  sides must agree on.

## The seams

Two pieces of the system are deliberately replaceable, and both use the same
mechanism: a gitignored module, generated from a checked-in stub when absent.

| Seam             | Generated file                                 | Stub                              | Contract                          |
| ---------------- | ---------------------------------------------- | --------------------------------- | --------------------------------- |
| Payment provider | `convex/billing/provider.ts`                   | `convex/billing/provider.stub.ts` | `convex/billing/providerTypes.ts` |
| Payment UI       | `apps/mobile/src/components/billing/index.tsx` | `.../index.stub.tsx`              | `.../types.ts`                    |

`scripts/ensure-billing-provider.mjs` installs the stubs on first build, so a
fresh clone compiles without ceremony. The full story is in
[`billing.md`](./billing.md).

## Source of truth and the mirror

Development happens on an internal OneDev instance. The public GitHub
repository is generated from it by `scripts/publish-github.sh`: real history,
rewritten to exclude the private billing implementations and the marketing
site. If a path is listed in `scripts/public-exclude.txt`, it has never
existed in any published commit — that file is the security boundary, and the
reason changes to it deserve more attention than the diff size suggests.
