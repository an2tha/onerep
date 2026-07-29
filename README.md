# OneRep

OneRep is a fitness app that keeps training, nutrition, recovery, and progress in one place. The main client runs as a responsive web app, installable PWA, and Capacitor app for iOS and Android. Convex handles the database, realtime sync, authentication, scheduled work, and server-side integrations.

The production app lives at [app.onerep.life](https://app.onerep.life). The marketing site is [onerep.life](https://onerep.life).

## What is implemented

- **Daily dashboard:** calorie and macro targets, meals, water, supplements, scheduled training, Coach goals, and configurable widgets.
- **Training:** exercise catalog, workout templates, weekly routines, two concurrent workout slots, rest timers, persisted active workouts, history, volume trends, and muscle-recovery estimates.
- **Nutrition:** FatSecret food search and nutrition details, barcode scanning, meal presets, recipes, quick repeat logging, custom macro targets, water, and supplement schedules.
- **Progress:** body measurements, body-fat and circumference check-ins, nutrition and training summaries, charts, and user-defined metrics.
- **Coach:** text, image, and voice input; personalized briefings; recipes and meal logging; workout and weekly-plan changes; goals, check-ins, memory, and reversible operations. Generated changes are reviewed before they are applied when confirmation is required.
- **Photo logging:** food detection with OpenAI, followed by a review step that matches detections to food records before logging them.
- **Cross-platform support:** PWA updates, an offline mutation queue for common logging actions, Capacitor camera/haptics/notifications, RevenueCat subscriptions, and iOS widgets and Live Activities.
- **Accounts and privacy:** Better Auth email/password accounts, email verification and password reset through Resend, analytics opt-in, data export, and account deletion.

AI, food lookup, email, analytics, and subscriptions depend on their corresponding environment variables. The rest of the app can be developed without every optional integration configured.

## Repository layout

```text
.
├── apps/
│   ├── mobile/       # Main React app, PWA, and Capacitor iOS/Android projects
│   ├── web/          # Bun + React marketing and legal site
│   └── datasource/   # Experimental Bun datasource scaffold; not used by the app
├── convex/           # Schema, auth, queries, mutations, actions, HTTP routes, and crons
├── packages/
│   ├── models/       # Shared TypeScript models and Coach operation contracts
│   └── ui/           # Shared presentation components and Tailwind styles
├── scripts/          # Prompt generation and exercise-catalog preparation
└── docs/             # Feature and UI implementation notes
```

The mobile app talks directly to Convex. FatSecret, OpenAI, Resend, and RevenueCat secrets stay in the Convex deployment and are never exposed as `VITE_*` variables.

`@repo/ui` is the presentation boundary: it owns primitives and reusable presenters, while `apps/mobile` owns routing, Convex calls, authentication, platform APIs, storage, and feature state. See [`packages/ui/README.md`](packages/ui/README.md) before adding shared UI.

## Stack

- Bun workspaces and Turborepo
- React 19, TypeScript, React Router 7, Vite 7
- Tailwind CSS 4, Radix/Base UI, shadcn-style components, Framer Motion
- Convex with Better Auth, Convex crons, and Convex RevenueCat components
- Capacitor 8 for iOS and Android
- Bun's server and bundler for the marketing site
- Bun Test, Vitest/convex-test, and Playwright

## Local development

### Prerequisites

- [Bun](https://bun.sh/) 1.3.4 or newer
- Node.js 18 or newer for the few Node-based scripts
- A [Convex](https://convex.dev/) account
- Xcode for iOS work or Android Studio for Android work

Docker is not required for the current app. Food search uses FatSecret through Convex; `apps/datasource` is only a scaffold at present.

### 1. Install dependencies

```bash
bun install
cp .env.example .env.local
```

The Vite app loads environment files from the repository root, not from `apps/mobile`.

### 2. Start Convex

```bash
bunx convex dev
```

On the first run, follow the Convex setup prompt. It creates or selects a development deployment, updates the generated client files, and writes the deployment URL to the local environment.

Keep this command running while working on backend code.

### 3. Configure authentication

At minimum, the client needs these values in the root `.env.local`:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
```

Better Auth runs inside Convex. Set its secret and the browser origin on the development deployment:

```bash
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
bunx convex env set SITE_URL http://localhost:5173
```

Email verification is required for new accounts, so sign-up and password-reset flows also need Resend:

```bash
bunx convex env set RESEND_API_KEY your-key
bunx convex env set AUTH_EMAIL_FROM "OneRep <you@your-domain.example>"
```

`AUTH_EMAIL_LOGO_URL` is optional. Convex provides its deployment HTTP URL as `CONVEX_SITE_URL`; the client-facing value must match it.

### 4. Run the app

Run every workspace development task:

```bash
bun run dev
```

This starts the app at `http://localhost:5173` and the marketing site at `http://localhost:3000`. For a quieter mobile-only session:

```bash
cd apps/mobile
bun run dev
```

Convex still runs in its own terminal.

## Integrations

Set backend secrets with `bunx convex env set NAME VALUE`. Do not put them behind a `VITE_` prefix.

### Food search and barcodes

```env
FATSECRET_CLIENT_ID=
FATSECRET_CLIENT_SECRET=
```

Food search, details, and barcode requests pass through `convex/food/fatSecret.ts`. Responses are cached server-side for less than 24 hours and expired cache entries are removed.

### AI Coach and photo logging

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
```

Prompts are source-controlled YAML files under `convex/ai/prompts/`. After editing one, regenerate the TypeScript bundle:

```bash
bun run prompts:generate
```

Builds, type checks, and tests fail if `convex/ai/prompts.generated.ts` is stale.

### PostHog

These are client-visible and belong in the root `.env.local`:

```env
VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=
VITE_PUBLIC_POSTHOG_HOST=
```

The app opts out by default and only captures events after the user enables analytics.

### RevenueCat

Subscriptions use RevenueCat's native SDK, web checkout, server API, and Convex webhook component. Configure the parts needed for the platform you are testing:

```env
REVENUECAT_SECRET_KEY=
REVENUECAT_API_V2_SECRET_KEY=
REVENUECAT_PROJECT_ID=
REVENUECAT_PUBLIC_SDK_KEY=
REVENUECAT_WEB_CHECKOUT_URL=
REVENUECAT_WEBHOOK_AUTH=
REVENUECAT_MONTHLY_PRICE_LABEL="$9.99/month"
```

All of these are Convex deployment variables.

## Native apps

The native projects are checked in under `apps/mobile/ios` and `apps/mobile/android`. Build the web assets before syncing Capacitor:

```bash
cd apps/mobile
bun run build
bunx cap sync
```

Then open the platform project:

```bash
bunx cap open ios
# or
bunx cap open android
```

A production mobile build requires real `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` values. The Vite config rejects placeholder URLs and rejects development Convex deployments in production mode.

## Exercise catalog

The global catalog comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db). Only compact exercise metadata is imported; images are not stored in Convex.

```bash
# Write .cache/exercises/free-exercise-db.compact.json
bun run exercises:prepare

# Replace the exercises table in the selected Convex deployment
bun run exercises:import
```

Check the selected `CONVEX_DEPLOYMENT` before running the import because it uses `--replace`.

## Commands

| Command                     | What it does                                                    |
| --------------------------- | --------------------------------------------------------------- |
| `bun run dev`               | Run all workspace development tasks                             |
| `bun run build`             | Check generated prompts, type-check, and build the workspaces   |
| `bun run typecheck`         | Check generated prompts and TypeScript                          |
| `bun run lint`              | Run workspace linters                                           |
| `bun run format`            | Format TypeScript, Markdown, JSON, and YAML                     |
| `bun run test`              | Run package tests and the focused Convex unit suite             |
| `bun run test:convex`       | Run the full Convex test suite with Vitest and `convex-test`    |
| `bun run test:watch`        | Run Bun tests in watch mode, excluding Convex integration tests |
| `bun run test:coverage`     | Run Bun tests with coverage                                     |
| `bun run prompts:generate`  | Regenerate `convex/ai/prompts.generated.ts`                     |
| `bun run prompts:check`     | Check that generated prompts are current                        |
| `bun run exercises:prepare` | Build the compact exercise import file                          |
| `bun run exercises:import`  | Replace the selected deployment's exercise catalog              |

Visual regression tests live in the mobile workspace:

```bash
cd apps/mobile
bun run test:visual
```

Authenticated screenshots require `E2E_STORAGE_STATE` to point to a signed-in Playwright storage-state file.

## Deployment

Pushes to `main` trigger the `Deploy Cloudflare Pages` job in [`.onedev-buildspec.yml`](.onedev-buildspec.yml). The job builds both static sites and deploys them to Cloudflare Pages. Add these secrets under the OneDev project's build settings before running it:

- `TURBO_TOKEN`
- `TURBO_TEAM`
- `DEV_CONVEX_DEPLOYMENT`
- `DEV_VITE_CONVEX_URL`
- `DEV_VITE_CONVEX_SITE_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The job uses a sequential deployment group so two production deployments cannot run at the same time. It can also be started manually from any commit in OneDev. Convex deployment is managed separately; this job does not push backend functions or environment variables.

Before opening a pull request, run:

```bash
bun run typecheck
bun run test
bun run test:convex
bun run build
```
