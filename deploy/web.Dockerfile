# syntax=docker/dockerfile:1.7
FROM node:26-slim AS build

RUN npm install -g pnpm@12.20.0
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

COPY skills/valio-aimo-purchasing/references /repo/skills/valio-aimo-purchasing/references
COPY apps/web ./
RUN pnpm build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
