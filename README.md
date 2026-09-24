<div align="center">
  <a href="https://app.onerep.life"><img src="apps/mobile/public/app-icon.svg" alt="OneRep" width="80" height="80"></a>
  <h1>OneRep</h1>
  <p>Training, food, health, and your daily journal in one place.</p>
  <p>
    <a href="https://app.onerep.life">Open the app</a> ·
    <a href="https://docs.onerep.life">Read the docs</a> ·
    <a href="https://testflight.apple.com/join/edJwRJDP">Join the iOS beta</a> ·
    <a href="https://docs.onerep.life/selfhost/overview">Self-host OneRep</a>
  </p>
</div>

![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-blue)

OneRep is an open-source personal fitness app for the web, PWA, iOS, and Android. It combines daily logging with longer-term trends and an AI Coach. You can use the hosted app or run the stack on your own infrastructure.

## What you can do

- **Today:** See food, water, supplements, planned training, and Coach goals together. Quick actions let you log food, water, and other entries without leaving the dashboard.
- **Journal:** Record a daily mood and note. Add personal trackers from templates or create your own number, counter, and yes/no trackers. Review their history and jump to food, water, training, or supplements for a chosen day.
- **Nutrition:** Search USDA and Open Food Facts, scan barcodes, repeat familiar foods, or use Snap & Log to review food detected from a photo before saving it. Edit portions and entry times, build recipes and presets, and track water and supplements.
- **Training:** Switch between Strength and Endurance. Plan strength presets and a weekly routine, log sets and rest, or record walks, runs, rides, and hikes. Outdoor sessions can record GPS routes. Save and share hiking trails.
- **Progress and Health:** Follow body, nutrition, and training trends. On supported phones, choose which Apple Health or Health Connect metrics to sync. Correct readings when needed.
- **Recovery mode:** When you are unwell, explicitly start a resting plan that can defer training and quiet reminders. Check in, ease back when ready, and finish the plan yourself.
- **Coach:** Ask for briefings, meal and recipe help, or training changes. Review proposed writes before applying them. Bring your own OpenRouter key if you prefer to pay your AI provider directly.
- **Your data:** Export your account, use the REST API or MCP endpoint, and self-host the backend and food datasource.

See the [feature guides](https://docs.onerep.life/introduction) for the details and platform limits.

## Architecture

One React app ships as a website, installable PWA, and Capacitor app for iOS and Android. Convex provides the database, authentication, synchronization, server functions, REST API, and MCP endpoint. The datasource serves food and exercise catalogs.

```text
apps/mobile/       React app, PWA, and Capacitor projects
apps/datasource/   Food and exercise datasource, Bun and SQLite
convex/            Schema, auth, functions, HTTP routes, and crons
packages/models/   Shared models and Coach operation contracts
packages/ui/       Presentation components and styles
scripts/           Prompt generation, exercise preparation, publishing
selfhost/          Docker Compose stack and installer
```

Server secrets belong in the Convex deployment, never in `VITE_*` variables. Optional services, including AI, email, and analytics, require their own configuration. This public repository mirrors an internal development repository. See `scripts/publish-github.sh` for the published paths.

## Self-hosting

You need Docker with Compose v2 and Bun on the host. Plan for roughly 10 GB of disk space for USDA data, or about 25 GB if you import all of Open Food Facts.

```sh
git clone https://github.com/an2tha/onerep.git
cd onerep/selfhost
./install.sh
```

The installer creates `selfhost/.env`, starts the backend and datasource, and deploys the Convex functions. The datasource starts without food catalogs, so import a catalog before expecting food search results. If you will open the app from another device, configure a reachable `PUBLIC_HOST` before installing. `127.0.0.1` on a phone refers to the phone itself.

Continue with the [installation](https://docs.onerep.life/selfhost/install), [food database](https://docs.onerep.life/selfhost/food-database), [reverse proxy](https://docs.onerep.life/selfhost/reverse-proxy), [mobile apps](https://docs.onerep.life/selfhost/mobile-apps), and [integrations](https://docs.onerep.life/selfhost/integrations) guides.

## Development

```sh
bun install
cp .env.example .env.local
bun run dev
```

Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in the root `.env.local` for your development backend. The web app runs at `http://localhost:5173`.

| Command | Purpose |
| --- | --- |
| `bun run build` | Check generated prompts and build workspaces |
| `bun run typecheck` | Check generated prompts and TypeScript |
| `bun run test` | Run workspace tests and selected Convex unit tests |
| `bun run test:convex` | Run the Convex integration suite |
| `bun run prompts:generate` | Regenerate Coach prompt artifacts |
| `bun run exercises:import` | Replace the selected deployment's exercise catalog |

See [mobile development](apps/mobile/README.md) and [datasource development](apps/datasource/README.md) for their local workflows.

## Contributing

Pull requests are welcome. Changes are reviewed in this mirror, applied to the internal repository, and published back with authorship preserved. Before proposing a change, run `bun run typecheck`, `bun run test`, and `bun run test:convex`.

Contributions may be used under the [project license](LICENSE.md) in the official OneRep service. Your authorship remains in the history.

## License and contact

[PolyForm Noncommercial 1.0.0](LICENSE.md) · [support@onerep.life](mailto:support@onerep.life)

OneRep uses [USDA FoodData Central](https://fdc.nal.usda.gov/), [Open Food Facts](https://world.openfoodfacts.org/), [wger](https://wger.de/), [free-exercise-db](https://github.com/yuhonas/free-exercise-db), [Convex](https://convex.dev/), and [Better Auth](https://better-auth.com/). Check the source projects for their data and software licenses.
