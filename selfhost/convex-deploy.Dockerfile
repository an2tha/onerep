# syntax=docker/dockerfile:1
#
# One-shot: deploys Convex functions and sets deployment env vars, then exits.
# Replaces steps 4-5 of install.sh so a self-hoster never needs bun or node on
# the host itself — everything the Convex CLI needs already lives in here.
#
# Runs against CONVEX_SELF_HOSTED_URL with CONVEX_SELF_HOSTED_ADMIN_KEY, both
# supplied at `docker run` time by install.sh once the backend is healthy and
# an admin key has been generated.

FROM oven/bun:1.3.4-alpine
WORKDIR /repo

COPY . .
RUN bun install --frozen-lockfile

COPY selfhost/convex-deploy.sh /convex-deploy.sh
RUN chmod +x /convex-deploy.sh

ENTRYPOINT ["/convex-deploy.sh"]
