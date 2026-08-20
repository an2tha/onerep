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
    Training, nutrition, recovery, and progress in one place, with an AI coach that does the bookkeeping.
    <br />
    <a href="https://docs.onerep.life"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://app.onerep.life">Use the app</a>
    &middot;
    <a href="https://github.com/an2tha/onerep/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/an2tha/onerep/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<div align="center">
  <img src="assets/onerep-tour.gif" alt="A walkthrough of OneRep: daily dashboard with calorie and macro rings, nutrition logging, training, progress charts, and the AI Coach" width="900">
</div>

## What it is

One React codebase shipping as a web app, a PWA, and Capacitor apps for iOS and
Android. Convex holds the database, the sync, the auth, the crons, and every
server-side integration; there is no API server in between. Self-hosting brings
up the whole thing with one script.

Daily dashboard, training, nutrition with self-hosted food search and barcodes,
progress tracking, photo food logging, a Coach whose every write carries an undo
payload, and a [REST API](https://docs.onerep.life/api/overview) plus an
[MCP endpoint](https://docs.onerep.life/api/mcp/overview) so your scripts read
the same log you do. The feature list, in the detail it deserves, is in the
[docs](https://docs.onerep.life/introduction).

AI, food lookup, email, and analytics each switch on with their own environment
variables and stay quiet without them. A deployment with no `OPENROUTER_API_KEY`
still runs Coach for anyone who pastes their own OpenRouter key into Settings,
on their credential, unmetered.

The production app is at [app.onerep.life](https://app.onerep.life). No
investors, no ads, funded entirely by [the paid tier](https://app.onerep.life).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

[![Bun][Bun-badge]][Bun-url]
[![React][React-badge]][React-url]
[![TypeScript][TS-badge]][TS-url]
[![Vite][Vite-badge]][Vite-url]
[![Tailwind CSS][Tailwind-badge]][Tailwind-url]
[![Convex][Convex-badge]][Convex-url]
[![Capacitor][Capacitor-badge]][Capacitor-url]
[![Turborepo][Turbo-badge]][Turbo-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Layout

```text
.
├── apps/
│   ├── mobile/       # React app, PWA, and the Capacitor iOS/Android projects
│   └── datasource/   # Food + exercise API: USDA, Open Food Facts, wger (Bun + SQLite)
├── convex/           # Schema, auth, functions, HTTP routes, crons
├── packages/
│   ├── models/       # Shared models and Coach operation contracts
│   └── ui/           # Presentation components and Tailwind styles
├── scripts/          # Prompt generation, exercise prep, mirror publishing
└── selfhost/         # install.sh + docker-compose.yml
```

Secrets stay in the Convex deployment and never appear as `VITE_*`. `@repo/ui`
renders props and raises callbacks; it does not know Convex exists.

This repository is a one-way mirror of an internal OneDev instance: real
history, minus the hosted deployment's private bits and the marketing site.
`scripts/publish-github.sh` says which paths and why.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Self-hosting

You need Docker with Compose v2, Bun 1.3.4+ on the host, and ~10 GB of disk for
the USDA food data (~25 GB with all of Open Food Facts).

```sh
git clone https://github.com/an2tha/onerep.git
cd onerep/selfhost
./install.sh
```

That's the install. It asks one question, writes `selfhost/.env` with generated
secrets, brings up the backend, deploys the functions, and starts the datasource
and the app at `http://127.0.0.1:8081` (dashboard on `:6791`). Re-running is
safe. Accounts on your install are unmetered.

The datasource starts empty, so food search finds nothing until you import
something. Everything past the first run — real domains and TLS, the three
catalog imports, native iOS and Android builds, the optional integrations —
is documented properly:

- [Self-hosting overview](https://docs.onerep.life/selfhost/overview) and [install](https://docs.onerep.life/selfhost/install)
- [Food databases](https://docs.onerep.life/selfhost/food-database): USDA, Open Food Facts, wger
- [Mobile apps](https://docs.onerep.life/selfhost/mobile-apps): PWA, Xcode, Android Studio
- [Integrations](https://docs.onerep.life/selfhost/integrations): OpenRouter, Resend, Google, OIDC, telemetry
- [`selfhost/docker-compose.yml`](selfhost/docker-compose.yml): every service, port, and volume

> One trap worth repeating here, because it bites everyone: the default backend
> URL is `http://127.0.0.1:3210`, which on a phone means *the phone*. Set
> `PUBLIC_HOST` before the first run, or the app installs, opens, and refuses to
> sign in.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

```sh
bun install
cp .env.example .env.local   # VITE_CONVEX_URL, VITE_CONVEX_SITE_URL, read from the repo root
bun run dev                  # http://localhost:5173
```

| Command                     | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `bun run build`             | Check prompts, type-check, build the workspaces          |
| `bun run typecheck`         | Prompts and TypeScript                                   |
| `bun run test`              | Package tests and the focused Convex suite               |
| `bun run test:convex`       | The full Convex integration suite, which knows the most  |
| `bun run prompts:generate`  | Regenerate `convex/ai/prompts.generated.ts`              |
| `bun run exercises:import`  | Replace a deployment's exercise catalog (check `CONVEX_DEPLOYMENT`) |

Native work lives in [`apps/mobile/README.md`](apps/mobile/README.md); search
ranking and de-duplication in [`apps/datasource/README.md`](apps/datasource/README.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Pull requests are welcome and are not merged here. They're reviewed here,
applied to the internal repository, and flow back out in the next sync with your
authorship preserved.

Fork, branch, and run `bun run typecheck && bun run test && bun run test:convex`
before you push. This codebase has source-contract tests that assert the actual
words on the screen, and they will find you.

By contributing you agree the work may be used under the project license and in
the official OneRep deployment, which is a commercial service. Your authorship
stays in the history either way.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License & Contact

[PolyForm Noncommercial 1.0.0](LICENSE.md) · [support@onerep.life](mailto:support@onerep.life)

Thanks to [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
[USDA FoodData Central](https://fdc.nal.usda.gov/),
[Open Food Facts](https://world.openfoodfacts.org/) ([ODbL](https://opendatacommons.org/licenses/odbl/), images CC-BY-SA),
[wger](https://wger.de/) (CC-BY-SA 4.0), and to
[Convex](https://convex.dev/), [Better Auth](https://better-auth.com/), and
[shadcn/ui](https://ui.shadcn.com/), the load-bearing walls.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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
