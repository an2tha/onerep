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
- **Authentication**: Clerk with Convex auth
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
VITE_CLERK_PUBLISHABLE_KEY=
```

Required for Clerk auth in Convex env:

```env
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.dev
```

`CLERK_JWT_ISSUER_DOMAIN` must match the Clerk JWT issuer URL used by the mobile app's Clerk project, with no trailing slash. Convex `auth.config.ts` uses this as the provider domain and expects Clerk JWTs with audience/application ID `convex`. Set it with `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>`.

Required for mobile food search in Convex env:

```env
BETTER_AUTH_SECRET=
FATSECRET_CLIENT_ID=
FATSECRET_CLIENT_SECRET=
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Set each value with `bunx convex env set <name> <value>`. The mobile app talks only to Convex; FatSecret credentials must never be exposed as Vite variables.

Food search, nutrition details, and barcode lookups use FatSecret through an authenticated Convex action. API responses are cached server-side for less than 24 hours, and expired entries are removed in accordance with FatSecret's storable-data policy.

Required for AI features in Convex env:

```env
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=openai/gpt-5.4-mini
```

Create the key in Vercel AI Gateway, then set it with `bunx convex env set AI_GATEWAY_API_KEY <key>`. AI prompts live in `convex/ai/prompts/*.yaml`; run `bun run prompts:generate` after editing them. Typecheck, build, and tests verify that the generated Convex prompt bundle is current.

### Importing the exercise catalog

The exercise catalog uses [free-exercise-db](https://github.com/yuhonas/free-exercise-db). The import stores compact metadata only: no image paths or image binaries, keeping Convex storage small.

```bash
# Build .cache/exercises/free-exercise-db.compact.json
bun run exercises:prepare

# Replace the Convex exercises table in the current deployment
bun run exercises:import
```

Optional integrations are listed in `.env.example`.

## Available Scripts

| Command                        | Description                           |
| ------------------------------ | ------------------------------------- |
| `bun run dev`                  | Run all apps in dev mode              |
| `bun run exercises:prepare`    | Build compact free-exercise-db import |
| `bun run exercises:import`     | Import exercise catalog into Convex   |
| `bun run build`                | Build all apps                        |
| `bun run lint`                 | Lint all packages                     |
| `bun run typecheck`            | Type-check all packages               |
| `bun run format`               | Format code with Prettier             |

## License

MIT
