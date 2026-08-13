<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![License: PolyForm Noncommercial][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://app.onerep.life">
    <img src="apps/mobile/public/app-icon.svg" alt="OneRep" width="80" height="80">
  </a>

<h3 align="center">OneRep</h3>

  <p align="center">
    Training, nutrition, recovery, and progress in one place — with an AI coach that does the bookkeeping.
    <br />
    <a href="docs/architecture.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://app.onerep.life">Use the app</a>
    &middot;
    <a href="https://github.com/an2tha/onerep/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/an2tha/onerep/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

> **Support the project:** OneRep has no investors, no ads, and no plan to acquire either. Development is funded by one thing — [the paid tier on the production app](https://app.onerep.life). If this code is useful to you, a subscription helps more than any number of stars. Stars are also nice.

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#repository-layout">Repository Layout</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#optional-integrations">Optional Integrations</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#documentation">Documentation</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

OneRep is a fitness app that keeps training, nutrition, recovery, and progress in one place. One React codebase ships as a responsive web app, an installable PWA, and Capacitor apps for iOS and Android. Convex handles the database, realtime sync, authentication, scheduled work, and every server-side integration.

The production app lives at [app.onerep.life](https://app.onerep.life).

What's implemented, in the order you'd hit it:

- **Daily dashboard** — calorie and macro targets, meals, water, supplements, scheduled training, Coach goals, configurable widgets.
- **Training** — exercise catalog, workout templates, weekly routines, two concurrent workout slots, rest timers, persisted active workouts, history, volume trends, muscle-recovery estimates.
- **Nutrition** — self-hosted USDA food search, barcode scanning, meal presets, recipes, quick repeat logging, custom macro targets, water and supplement schedules.
- **Progress** — body measurements, body-fat and circumference check-ins, nutrition and training summaries, charts, user-defined metrics.
- **Coach** — text, image, and voice input; personalized briefings; recipes and meal logging; workout and weekly-plan changes; goals, check-ins, memory, and reversible operations — every AI write carries an undo payload.
- **Photo logging** — food detection with a review step that matches detections to food records before anything is logged.
- **Bring your own key** — paste your own OpenRouter key in Settings and Coach runs on your credential instead of the deployment's: validated against OpenRouter before it saves, stored server-side only, shown as its last four characters, and exempt from the monthly allowance — you're paying for the inference, so nobody meters it.
- **Your data, over the wire** — a [REST API](docs/api.md) and an [MCP endpoint](docs/mcp.md) on keys you mint in the app, so your scripts and your assistant read the same log you do.
- **Accounts and privacy** — email/password accounts with verification, analytics opt-in (off by default), full data export, account deletion.

AI, food lookup, email, and analytics each switch on with their own environment variables; the rest of the app develops fine without any of them. A deployment without an `OPENROUTER_API_KEY` isn't even AI-less — any user can supply their own key in Settings and Coach works for them alone. Payments are behind a seam and stubbed in this repository — see [`docs/billing.md`](docs/billing.md) for why that's a feature.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [![Bun][Bun-badge]][Bun-url]
- [![React][React-badge]][React-url]
- [![TypeScript][TS-badge]][TS-url]
- [![Vite][Vite-badge]][Vite-url]
- [![Tailwind CSS][Tailwind-badge]][Tailwind-url]
- [![Convex][Convex-badge]][Convex-url]
- [![Capacitor][Capacitor-badge]][Capacitor-url]
- [![Turborepo][Turbo-badge]][Turbo-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Repository Layout

```text
.
├── apps/
│   ├── mobile/       # Main React app, PWA, and Capacitor iOS/Android projects
│   └── datasource/   # Self-hosted USDA food + wger exercise API (Bun + SQLite)
├── convex/           # Schema, auth, queries, mutations, actions, HTTP routes, and crons
├── packages/
│   ├── models/       # Shared TypeScript models and Coach operation contracts
│   └── ui/           # Shared presentation components and Tailwind styles
├── scripts/          # Prompt generation, exercise-catalog prep, mirror publishing
├── selfhost/         # One-command Docker self-hosting: install.sh + docker-compose.yml
└── docs/             # Architecture, billing, testing, API, and feature docs
```

The mobile app talks directly to Convex; there is no API server in the middle. Secrets stay in the Convex deployment and are never exposed as `VITE_*` variables. `@repo/ui` is the presentation boundary — it renders props and raises callbacks, and does not know Convex exists.

This repository is a one-way mirror of an internal OneDev instance: real commit history, minus the private payment implementations and the marketing site (`scripts/publish-github.sh` documents exactly which paths and why).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.3.4 or newer
- Node.js 18 or newer, for the few Node-based scripts
- A free [Convex](https://convex.dev/) account
- Xcode or Android Studio, only if you're doing native work

### Installation

1. Clone and install:

   ```sh
   git clone https://github.com/an2tha/onerep.git
   cd onerep
   bun install
   cp .env.example .env.local
   ```

2. Start Convex (keep it running while developing backend code):

   ```sh
   bunx convex dev
   ```

   The first run walks you through creating a development deployment and writes its URL into the local environment. The Vite app loads env files from the repository root, not from `apps/mobile`.

3. Configure authentication. The client needs these in the root `.env.local`:

   ```env
   VITE_CONVEX_URL=https://your-deployment.convex.cloud
   VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
   ```

   Better Auth runs inside Convex; give it a secret and the browser origin:

   ```sh
   bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   bunx convex env set SITE_URL http://localhost:5173
   ```

   Email verification is off by default, so accounts work without an email provider. To require it (recommended once real users show up), add a [Resend](https://resend.com/) key and turn the gate on:

   ```sh
   bunx convex env set RESEND_API_KEY your-key
   bunx convex env set AUTH_EMAIL_FROM "OneRep <you@your-domain.example>"
   bunx convex env set EMAIL_VERIFICATION_REQUIRED true
   ```

   Password reset also depends on Resend, so accounts on a mail-less deployment should not forget their passwords.

4. Run it:

   ```sh
   bun run dev
   ```

   The app is at `http://localhost:5173`. For a quieter session, `cd apps/mobile && bun run dev`.

5. That's it. Every account on your deployment has Pro by default — the paywall only exists when a deployment explicitly sets `BILLING_COMP_ALL_USERS=false` and wires up a real payment provider ([`docs/billing.md`](docs/billing.md)).

### Self-Hosting

The steps above use a Convex cloud deployment. If you'd rather own the whole
stack — backend, dashboard, food datasource, and the app — there is one script
for that:

```sh
cd selfhost && ./install.sh
```

It writes a `.env` with generated secrets, brings up a self-hosted Convex
backend in Docker, deploys the functions, and starts everything else. The app
lands on `http://127.0.0.1:8081`, the dashboard on `:6791`, and the script
prints the admin key and the food-database import commands when it's done.
Details and knobs live in [`selfhost/docker-compose.yml`](selfhost/docker-compose.yml).

### Optional Integrations

Each of these switches on a feature and stays off without ceremony. Set backend secrets with `bunx convex env set NAME VALUE` — never behind a `VITE_` prefix.

| Feature                  | Variables                                                       | Notes                                                                                                                           |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Food search & barcodes   | `DATASOURCE_URL`, `DATASOURCE_API_TOKEN`                        | Proxied through Convex to [`apps/datasource`](apps/datasource/README.md), with a server-side cache.                             |
| AI Coach & photo logging | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`                        | AI fails closed without the key. Prompts are YAML under `convex/ai/prompts/`; run `bun run prompts:generate` after editing one. Users can also bring their own OpenRouter key in Settings — their requests then run on their credential with no monthly cap. |
| Google sign-in           | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                      | Redirect URI: `https://your-deployment.convex.site/api/auth/callback/google`. The button only renders once both are set.        |
| Analytics                | `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`, `VITE_PUBLIC_POSTHOG_HOST` | Client-visible, root `.env.local`. Opt-out by default; captures nothing until the user enables it.                              |
| Payments                 | see [`docs/billing.md`](docs/billing.md)                        | Stubbed in this repository. `BILLING_COMP_ALL_USERS=true` is the self-hosting answer.                                           |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE -->

## Usage

The commands you'll actually run:

| Command                     | What it does                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `bun run dev`               | Run all workspace development tasks                                                                |
| `bun run build`             | Check generated prompts, type-check, and build the workspaces                                      |
| `bun run typecheck`         | Check generated prompts and TypeScript                                                             |
| `bun run lint`              | Run workspace linters                                                                              |
| `bun run test`              | Run package tests and the focused Convex unit suite                                                |
| `bun run test:convex`       | Run the full Convex integration suite (the one that knows the most)                                |
| `bun run prompts:generate`  | Regenerate `convex/ai/prompts.generated.ts`                                                        |
| `bun run exercises:prepare` | Build the compact exercise import file                                                             |
| `bun run exercises:import`  | Replace the selected deployment's exercise catalog (`--replace` — check `CONVEX_DEPLOYMENT` first) |

The exercise catalog comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db); only compact metadata is imported.

For native builds, build the web assets before syncing Capacitor:

```sh
cd apps/mobile
bun run build
bunx cap sync
bunx cap open ios   # or android
```

Production mobile builds refuse placeholder or development Convex URLs by design.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DOCUMENTATION -->

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit together, and where the seams are
- [`docs/billing.md`](docs/billing.md) — the billing seam: what's stubbed here and how to live with or replace it
- [`docs/testing.md`](docs/testing.md) — which test commands exist, what each one actually runs
- [`docs/api.md`](docs/api.md) — the HTTP API for your own scripts and devices
- [`docs/mcp.md`](docs/mcp.md) — the same data over Model Context Protocol
- [`docs/coach-features.md`](docs/coach-features.md) / [`docs/ai-upgrade.md`](docs/ai-upgrade.md) — what the Coach does and what it still owes us
- [`docs/backlog.md`](docs/backlog.md) — known debts, kept short on purpose

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->

## Roadmap

- [ ] A Coach with initiative — briefings and check-ins that arrive without being summoned
- [ ] A real progression engine: deloads, periodization, adaptation from logged results
- [ ] Turning on the ~130 Convex test blocks that currently assert nothing (see the backlog; it's a story)
- [ ] Android parity for the iOS widgets and Live Activities

The longer, more honest versions live in [`docs/ai-upgrade.md`](docs/ai-upgrade.md) and [`docs/backlog.md`](docs/backlog.md). See the [open issues](https://github.com/an2tha/onerep/issues) for everything else.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->

## Contributing

Contributions are welcome, with one logistical honesty: this repository is a mirror, so pull requests aren't merged here — they're reviewed here, applied to the internal repository, and flow back out in the next sync with your authorship preserved in the replayed commit.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Run the honest minimum before pushing: `bun run typecheck && bun run test && bun run test:convex`
4. Push and open a pull request

Read [`docs/testing.md`](docs/testing.md) first — this codebase has source-contract tests that assert the actual words on the screen, and they will find you.

By submitting a contribution you agree it may be used in the Software under the project license and in the official OneRep deployment, which is a commercial service. Your authorship stays in the history either way.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Licensed under the [PolyForm Noncomercial License 1.0.0](LICENSE.md)
<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->

## Contact

OneRep — [support@onerep.life](mailto:support@onerep.life)

Project link: [https://github.com/an2tha/onerep](https://github.com/an2tha/onerep)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) — the exercise catalog
- [USDA FoodData Central](https://fdc.nal.usda.gov/) — the food data
- [wger](https://wger.de/) — exercise data served by the datasource
- [Convex](https://convex.dev/), [Better Auth](https://better-auth.com/), and [shadcn/ui](https://ui.shadcn.com/) — the load-bearing walls
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — this README's skeleton

<!-- MARKDOWN LINKS & IMAGES -->

[contributors-shield]: https://img.shields.io/github/contributors/an2tha/onerep.svg?style=for-the-badge
[contributors-url]: https://github.com/an2tha/onerep/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/an2tha/onerep.svg?style=for-the-badge
[forks-url]: https://github.com/an2tha/onerep/network/members
[stars-shield]: https://img.shields.io/github/stars/an2tha/onerep.svg?style=for-the-badge
[stars-url]: https://github.com/an2tha/onerep/stargazers
[issues-shield]: https://img.shields.io/github/issues/an2tha/onerep.svg?style=for-the-badge
[issues-url]: https://github.com/an2tha/onerep/issues
[license-shield]: https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-blue?style=for-the-badge
[license-url]: LICENSE.md
[Bun-badge]: https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white
[Bun-url]: https://bun.sh/
[React-badge]: https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TS-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TS-url]: https://www.typescriptlang.org/
[Vite-badge]: https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Convex-badge]: https://img.shields.io/badge/Convex-EE342F?style=for-the-badge
[Convex-url]: https://convex.dev/
[Capacitor-badge]: https://img.shields.io/badge/Capacitor_8-119EFF?style=for-the-badge&logo=capacitor&logoColor=white
[Capacitor-url]: https://capacitorjs.com/
[Turbo-badge]: https://img.shields.io/badge/Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white
[Turbo-url]: https://turbo.build/
