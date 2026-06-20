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
│   ├── mobile/          # React mobile app (Ionic/Capacitor)
│   └── data-api/        # Local OpenFoodFacts data API
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
- Node.js 24+ for the local data API, or Docker
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

# Build the local OpenFoodFacts index, then start the data API
cd apps/data-api
bun run food:download
bun run food:index
bun run dev
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

Required for data API-backed food and exercise catalog search:

```env
DATA_API_URL=http://localhost:3001
VITE_DATA_API_URL=http://localhost:3001
DATA_API_KEY=
```

`DATA_API_URL` is for server/Convex fallbacks, while `VITE_DATA_API_URL` is what the mobile app uses directly in the browser/native WebView. The data API downloads `food.parquet` from OpenFoodFacts and builds `apps/data-api/data/food-index.sqlite`, a local SQLite FTS index used by `/api/v1/foods/search` and barcode lookups. `FOOD_INDEX_PATH` can point the API at a custom index location.

Optional integrations are listed in `.env.example`.

## Available Scripts

| Command                   | Description                       |
| ------------------------- | --------------------------------- |
| `bun run dev`             | Run all apps in dev mode          |
| `cd apps/data-api && bun run food:download` | Download OpenFoodFacts parquet |
| `cd apps/data-api && bun run food:index` | Build local food search index |
| `bun run docker:dev`      | Start local data API container       |
| `bun run docker:dev:down` | Stop Open Fitness API containers  |
| `bun run build`           | Build all apps                    |
| `bun run lint`            | Lint all packages                 |
| `bun run typecheck`       | Type-check all packages           |
| `bun run format`          | Format code with Prettier         |

## License

MIT
