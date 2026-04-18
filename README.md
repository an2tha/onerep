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
│   └── data-api/        # Express API (legacy MongoDB)
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

Copy `.env.example` to `.env.local` and configure:

```env
CONVEX_DEPLOY_URL=your-convex-deployment-url
CONVEX_DEPLOY_KEY=your-deploy-key
```

## Available Scripts

| Command             | Description               |
| ------------------- | ------------------------- |
| `bun run dev`       | Run all apps in dev mode  |
| `bun run build`     | Build all apps            |
| `bun run lint`      | Lint all packages         |
| `bun run typecheck` | Type-check all packages   |
| `bun run format`    | Format code with Prettier |

## License

MIT
