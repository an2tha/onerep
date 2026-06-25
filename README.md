# OneRep

A personal fitness and nutrition tracking mobile application built with React, Convex, and Capacitor.

## Features

- **Food Tracking** - Log meals, search foods via OpenFoodFacts, create recipes and presets
- **Workout Logging** - Track exercises, active workouts with sets/reps/weight
- **Body Progress** - Track weight, measurements, and progress photos
- **Cross-platform** - iOS and Android via Capacitor

## Tech Stack

- **Mobile App**: React 19, Ionic, React Router v7, Tailwind CSS v4
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Better Auth via Convex
- **UI Components**: Radix UI primitives, shadcn/ui
- **Build Tool**: Vite, Bun
- **Platform**: Capacitor (iOS/Android)

## Project Structure

```
onerep/
├── apps/
│   └── mobile/          # React mobile app (Ionic/Capacitor)
├── packages/
│   ├── models/          # TypeScript type definitions
│   └── ui/              # Shared UI components
├── convex/              # Convex backend (schema, functions)
└── package.json         # Turborepo root
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager)
- Node.js 18+
- Docker Desktop (for the local Open Food Facts mirror)
- Xcode (for iOS)
- Android Studio (for Android)

### Installation

```bash
# Install dependencies
bun install
```

### Development

```bash
# Run all apps in development mode
bun run dev

# Run mobile app only
cd apps/mobile && bun run dev

# Run Convex backend
npx convex dev

# Start local dev requirements: Open Food Facts mirror
bun run docker:dev:reqs

# Seed the local Open Food Facts mirror once with bundled sample products
bun run docker:dev:reqs:seed
```

### Building

```bash
# Build all apps
bun run build

# Build mobile app
cd apps/mobile && bun run build
```

### Mobile Build

```bash
# iOS
cd apps/mobile && bun run dev:ios

# Android
cd apps/mobile && npx cap run android
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure the values needed for the apps you run. Do not commit real secrets.

Required for the mobile app:

```env
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
```

Required for mobile food search in Convex env:

```env
BETTER_AUTH_SECRET=
OPENFOODFACTS_URL=https://world.openfoodfacts.org
OPENFOODFACTS_AUTH_TOKEN=
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Set these with `bunx convex env set BETTER_AUTH_SECRET <secret>`, `bunx convex env set OPENFOODFACTS_URL <url>`, and, for the auth-protected mirror, `bunx convex env set OPENFOODFACTS_AUTH_TOKEN <token>`. The mobile app talks only to Convex.

Food search and barcode lookups use Open Food Facts Product Opener-compatible endpoints (`/cgi/search.pl` and `/api/v2/product/:code.json`) through a Convex proxy. `docker-compose.dev-requirements.yml` starts a local Product Opener mirror from published GHCR images, no Open Food Facts repo clone required. The upstream Product Opener images are currently amd64-only, so the compose file defaults `OFF_PLATFORM=linux/amd64` for Apple Silicon Docker emulation; first startup can take a minute while Apache warms up. `bun run docker:dev:reqs:seed` imports a small sample set only, so arbitrary public barcodes may return 404 until you import fuller OFF data.

### Importing the exercise catalog

The exercise catalog uses [free-exercise-db](https://github.com/yuhonas/free-exercise-db). The import stores compact metadata only: no image paths or image binaries, keeping Convex storage small.

```bash
# Build .cache/exercises/free-exercise-db.compact.json
bun run exercises:prepare

# Replace the Convex exercises table in the current deployment
bun run exercises:import
```

### Importing the full Open Food Facts data

Use the official Product Opener MongoDB dump. It is the native Product Opener format and populates the local MongoDB service used by the mirror. Expect a large download and a much larger Docker MongoDB volume after restore.

```bash
# Start the local mirror first
bun run docker:dev:reqs

# Download the nightly OFF MongoDB dump
mkdir -p .cache/off
curl -L --continue-at - --fail --retry 5 \
  -o .cache/off/openfoodfacts-mongodbdump.gz \
  https://static.openfoodfacts.org/data/openfoodfacts-mongodbdump.gz

# Restore it into the compose MongoDB service
docker compose -f docker-compose.dev-requirements.yml exec -T mongodb \
  mongorestore \
  --gzip \
  --archive=/dev/stdin \
  --nsInclude='off.products' \
  --drop \
  < .cache/off/openfoodfacts-mongodbdump.gz

# Rebuild Product Opener indexes
docker compose -f docker-compose.dev-requirements.yml exec backend \
  perl /opt/product-opener/scripts/create_mongodb_indexes.pl

# Optional: refresh Product Opener's Postgres cache; this can take a while
docker compose -f docker-compose.dev-requirements.yml exec backend \
  perl /opt/product-opener/scripts/refresh_postgres.pl

# Restart after import
docker compose -f docker-compose.dev-requirements.yml restart backend frontend
```

Optional integrations are listed in `.env.example`.

## Available Scripts

| Command                        | Description                           |
| ------------------------------ | ------------------------------------- |
| `bun run dev`                  | Run all apps in dev mode              |
| `bun run docker:dev:reqs`      | Start local OFF mirror                |
| `bun run docker:dev:reqs:seed` | Seed local OFF mirror sample products |
| `bun run docker:dev:reqs:logs` | Tail dev requirement service logs     |
| `bun run docker:dev:reqs:down` | Stop dev requirement services         |
| `bun run exercises:prepare`    | Build compact free-exercise-db import |
| `bun run exercises:import`     | Import exercise catalog into Convex   |
| `bun run build`                | Build all apps                        |
| `bun run lint`                 | Lint all packages                     |
| `bun run typecheck`            | Type-check all packages               |
| `bun run format`               | Format code with Prettier             |

## License

MIT
