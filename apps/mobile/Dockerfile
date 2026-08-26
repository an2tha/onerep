# syntax=docker/dockerfile:1

FROM oven/bun:1.3.4-alpine AS build
WORKDIR /repo

COPY . .
RUN test -f package.json && grep -q '"packageManager"' package.json || \
  (echo "Build context must be the repository root. In Dokploy set Docker Context Path to '.' and Dockerfile Path to 'apps/mobile/Dockerfile'." && exit 1)
RUN bun install --frozen-lockfile

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG CONVEX_DEPLOYMENT
ARG VITE_BUILD_MODE=production
ARG VITE_APP_URL
ARG VITE_SITE_URL
ARG VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG VITE_PUBLIC_POSTHOG_HOST
# Umami. Left empty unless the operator asked for it: with either one unset, the
# build injects no tracker into index.html. See selfhost/install.sh.
ARG VITE_UMAMI_SCRIPT_URL
ARG VITE_UMAMI_WEBSITE_ID

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL
ENV CONVEX_DEPLOYMENT=$CONVEX_DEPLOYMENT
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=$VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
ENV VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST
ENV VITE_UMAMI_SCRIPT_URL=$VITE_UMAMI_SCRIPT_URL
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID

RUN bun run turbo run build --filter=mobile -- --mode "$VITE_BUILD_MODE"

FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/apps/mobile/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx --yes serve@latest -s dist -l tcp://0.0.0.0:3000"]
