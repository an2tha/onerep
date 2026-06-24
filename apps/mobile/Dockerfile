# syntax=docker/dockerfile:1

FROM oven/bun:1.3.4-alpine AS build
WORKDIR /repo

COPY . .
RUN test -f package.json && grep -q '"packageManager"' package.json || \
  (echo "Build context must be the repository root. In Dokploy set Docker Context Path to '.' and Dockerfile Path to 'apps/mobile/Dockerfile'." && exit 1)
RUN bun install --frozen-lockfile

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_SITE_URL
ARG VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG VITE_PUBLIC_POSTHOG_HOST

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=$VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
ENV VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST

RUN bun run turbo run build --filter=mobile

FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/apps/mobile/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx --yes serve@latest -s dist -l tcp://0.0.0.0:3000"]
