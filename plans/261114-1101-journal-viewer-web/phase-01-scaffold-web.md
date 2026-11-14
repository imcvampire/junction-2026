---
phase: 1
title: "Scaffold apps/web with shadcn and TanStack Router"
status: completed
effort: 1.5h
---

# Phase 1: Scaffold apps/web

## Context

- `apps/web` does not exist; it was removed in `d87e79b`. Its first version (`git show 7e2faf5`)
  is reference only, for the Vite `/api` proxy, the 5173 port and the mise tasks.
- `mise.toml` runs tasks by wildcard (`install:*`, `dev:*`, `lint:*`, `typecheck:*`, `test:*`), so
  new `*:web` tasks join `mise run check` and `mise run dev` automatically.
- shadcn guidance: `.claude/skills/shadcn/SKILL.md` (CLI, presets, templates). Read it before `init`.
- Toolchain on this machine: Node 26, pnpm 12.

## Files

Create: `apps/web/**` (CLI output plus the files below).
Modify: `mise.toml`, `.gitignore` (if the CLI's ignores are not enough: `node_modules`, `dist`,
`.vite`, `.tanstack`), `README.md`, `CLAUDE.md` (Commands section).

## Steps

1. In `apps/`, run `pnpm dlx shadcn@latest init --name web --template vite --no-monorepo` with the
   default base preset (record the exact command and preset in the phase report). Keep the CLI's
   `components.json`, `@/` alias, Tailwind setup and theme tokens.
2. Add TanStack Router with file-based routing: `@tanstack/react-router`, and
   `@tanstack/router-plugin` as a dev dependency, registered in `vite.config.ts` before the React
   plugin. Routes live in `src/routes/`; the generated `src/routeTree.gen.ts` is checked in and
   excluded from lint and format.
3. Routes:
   - `src/routes/__root.tsx`: renders `AppShell` (header with the app name, a nav list of
     features, a theme toggle, and `<Outlet />`), plus a not-found component.
   - `src/routes/index.tsx`: redirects to `/journal-viewer`.
   - `src/routes/journal-viewer.tsx`: placeholder page with a heading, filled in phase 3.
   - `src/components/layout/app-shell.tsx`: the nav is a plain array of `{ to, label }`, one entry
     for now.
4. `vite.config.ts`: port from `WEB_PORT` (default 5173) with `strictPort: true`; proxy `/api` to
   `http://127.0.0.1:${API_PORT}`. Add Vitest config (`environment: jsdom`, setup file with
   `@testing-library/jest-dom`).
5. `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint` (oxlint),
   `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `fmt`. Use oxlint with the React plugin
   and turn on `react/no-danger` as an error.
6. Dev dependencies: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
   `@testing-library/user-event`, `oxlint`.
7. shadcn components for the later phases: `pnpm dlx shadcn@latest add card badge table tabs alert
   button separator tooltip scroll-area collapsible skeleton`. Add others only when phase 3 needs them.
8. `mise.toml`: add `install:web` (`pnpm install --frozen-lockfile`), `dev:web` (`pnpm dev`),
   `lint:web`, `typecheck:web`, `test:web`, `build:web`, and include the web formatter in `fmt`.
   Add `node` and `pnpm` to `[tools]` at the installed major versions. Add `WEB_PORT = "5173"` to `[env]`.
9. One smoke test, `src/routes/-app.test.tsx` (the `-` prefix keeps it out of the route tree): render
   the router at `/` with a memory history and assert it lands on the journal viewer heading.
10. Docs: README and CLAUDE.md "Commands" mention that `mise run dev` now also serves the web app
    on 5173 and that `apps/web` tests run with `pnpm test` inside `apps/web`.

## Validation

- `mise run install`, then `mise run check`: all API and web tasks pass.
- `mise run build:web` builds `dist/` without warnings about unresolved imports.
- `mise run dev`: `curl -s localhost:5173/` serves the app; opening `/` in a browser lands on
  `/journal-viewer`. Stop the dev server afterwards if this phase started it (check `lsof -i :5173`
  first and reuse a running one).
- Extension check: adding the journal viewer route touched only `src/routes/journal-viewer.tsx`
  and one nav entry.

## Risks

- The shadcn template may already include a router or a different lint setup. Keep its choices
  where they do not conflict with the decisions in `plan.md`; replace only the router and the linter.
- The router plugin may not support Vite 8 or TypeScript 7 yet. If it fails, pin the newest
  versions that build, and record them. Do not switch to code-based routing without asking.

## Rollback

Delete `apps/web` and revert `mise.toml`, `.gitignore`, `README.md`, `CLAUDE.md`.
