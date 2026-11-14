---
title: Journal viewer in a new apps/web
description: Recreate apps/web as a fresh shadcn + Vite + TanStack Router app that will host the order console's features, and ship its first feature at /journal-viewer, where a person opens one purchasing journal file and reads it, validated against the shipped journal schema.
status: completed
priority: P2
effort: 6h
branch: master
tags: [web, frontend, skill]
blockedBy: []
blocks: []
created: 2026-11-14
goals: docs/project-goals.md
builds_on: plans/261114-1028-purchasing-session-journal
---

# Journal viewer in a new apps/web

## Outcome

- `apps/web` exists again as a fresh shadcn app (Vite, React, Tailwind, TanStack Router with
  file-based routes, pnpm), wired into `mise run install`, `dev`, `check` and `fmt` like `apps/api`.
  It is the home for later order console features (F1 to F4), each under its own route.
- `/journal-viewer` lets a person pick or drop one `valio-aimo-journal` JSON file. The page checks
  it against `skills/valio-aimo-purchasing/references/journal.schema.json` and either renders it or
  says exactly why it cannot: not JSON, not a journal, an unsupported `schema_version`, or a list
  of schema errors with their paths.
- A rendered journal reads top-down for a person: title, summary, outcome, metrics, narrative,
  next steps; then the timeline, the request and authority, the quote comparison with the chosen
  option marked, the buyer's questions and answers, the orders with their approval or
  cancellation, and the refused calls.
- The file never leaves the browser. The viewer makes no network request for it.

## Decisions (user, 2026-11-14)

| Decision | Chosen | Note |
|---|---|---|
| Scaffold | Fresh `shadcn init --template vite` | The old `7e2faf5` scaffold is reference only (proxy, ports, mise tasks). |
| Router | TanStack Router, file-based (`@tanstack/router-plugin`) | Routes live in `src/routes/`; the plugin generates `routeTree.gen.ts`. |
| Journal types | Generated from the schema with `json-schema-to-typescript`, checked in | A Vitest test fails when the generated file is stale. |
| Tests | Vitest (unit + component) and one scripted browser smoke | No checked-in E2E suite. |

## Trade-offs (planner defaults)

| Decision | Chosen | Rejected and why |
|---|---|---|
| Runtime validation | Ajv 2020 (`ajv/dist/2020`) + `ajv-formats`, compiled from the shipped schema | Zod would be a second copy of the contract. |
| Schema source | Import the JSON straight from `skills/…/references/` (Vite `server.fs.allow` for dev) | Copying it into `apps/web` invites drift; the skill's schema stays the single source. |
| Loading | `File` → text → `parseJournal(text)`, with a 5 MB cap | `parseJournal` takes a string, so a later server fetch reuses it unchanged. |
| Rendering | Plain React text nodes only; `react/no-danger` lint rule on | The strings come from tool results (product names, notes); never HTML or Markdown. |
| Package manager and lint | pnpm, oxlint, the shadcn CLI's defaults for the rest | Matches the earlier scaffold and the installed toolchain (pnpm 12, Node 26). |
| Dev ports | Web 5173 (`strictPort`), `/api` proxied to `API_PORT` | Deterministic ports; the proxy is unused by the viewer but needed by the next feature. |

## Constraints

- No API change. The viewer reads only the user's selected file (plan 261114-1028 decision 2).
- `journal.schema.json` is the contract. The viewer branches on `schema_version`, supports `1`, and
  rejects anything else with a clear message instead of guessing.
- Every string renders as text. No `dangerouslySetInnerHTML`, no Markdown renderer, no links built
  from journal strings.
- Usable at phone width (no horizontal page scroll; wide tables scroll inside their own container)
  and in light and dark themes.
- `mise run check` covers the web app (lint, typecheck, test) and stays green.

## Non-goals

- The order console's other features (order list, approvals, chat, AR). Only the shell they will
  share.
- Listing or watching the `valio-aimo-journal/` directory, or storing journals anywhere.
- Cross-checking a journal against the live server's audit trail.
- Editing journals, or exporting them to other formats.
- Production hosting or deployment of `apps/web`.

## Extension trace

Next credible variant: the order console's order list at `/orders` (goal F1), reading
`GET /api/orders` through the same proxy. Stable contract: one route file per feature in
`src/routes/`, feature code in `src/features/<feature>/`, and the shared `AppShell` with a plain
nav list. What changes: a new route file, its feature folder and one nav entry; no registry or
config layer. Phase 1 proves it: its acceptance check adds `/journal-viewer` exactly that way and
confirms nothing else in the shell had to change.

Second variant: journals stored on the server later. `parseJournal(text)` and the renderer take a
string and a typed object, never a `File`, so a fetch-based loader reuses both. Phase 2 tests
`parseJournal` without any `File`.

## Phases

| # | Phase | Files | Status |
|---|---|---|---|
| 1 | [Scaffold apps/web with shadcn and TanStack Router](phase-01-scaffold-web.md) | `apps/web/**` (new), `mise.toml`, `.gitignore`, `README.md`, `CLAUDE.md` | completed |
| 2 | [Journal contract in the browser](phase-02-journal-contract.md) | `apps/web/src/features/journal-viewer/{journal.types.ts,parse-journal.ts,*.test.ts}`, `apps/web/scripts/gen-journal-types.ts` | completed |
| 3 | [Journal viewer page](phase-03-viewer-page.md) | `apps/web/src/routes/journal-viewer.tsx`, `apps/web/src/features/journal-viewer/components/**` | completed |
| 4 | [Browser smoke and docs](phase-04-smoke-and-docs.md) | `plans/reports/smoke-261114-*-journal-viewer.md`, `skills/valio-aimo-purchasing/references/journal.md`, `README.md` | completed |

Phases run in order: 2 needs the app from 1, 3 needs the parser from 2, 4 needs the page.

## Acceptance criteria

1. `mise run install` and `mise run check` pass with the web tasks included (`lint:web`,
   `typecheck:web`, `test:web`), alongside the existing API tasks.
2. `mise run dev` serves the web app on port 5173; `/` redirects to `/journal-viewer`.
3. `parseJournal` accepts `journal-example.json` and returns a distinct, typed error for each of:
   not JSON, `schema` not `valio-aimo-journal`, `schema_version` not 1, schema violations (with
   instance paths), and input over 5 MB.
4. The generated `journal.types.ts` matches a fresh generation from the schema (a Vitest test).
5. Loading `journal-example.json` renders every section listed in Outcome, with option `464119`
   marked chosen and order `ord_example` shown as `approved` with reason `For the gala dinner`.
6. A journal string containing `<img src=x onerror=alert(1)>` renders as literal text (component
   test), and the lint config forbids `dangerouslySetInnerHTML`.
7. The browser smoke loads the example and a broken file (`errors[0].next` instead of `handling`,
   the defect from the 261114 live check) and shows the error with path `/errors/0`; at 390 px
   width the page has no horizontal scroll.

## Risks

| Risk | Mitigation |
|---|---|
| Very new toolchain (Vite 8, TypeScript 7, Node 26) breaks the TanStack Router plugin or `json-schema-to-typescript`. | Phase 1 builds and runs the router before any feature work; pin exact versions that build, and record them. |
| Ajv strict mode rejects the schema's union types. | Compile with `allowUnionTypes: true`; a test compiles the real schema. |
| Importing the schema from outside `apps/web` fails in dev or build. | `server.fs.allow` for the skill folder; phase 2 checks both `vite build` and the dev server. |
| A user drops a huge or hostile file. | 5 MB cap before parsing, text-only rendering, no network calls. |
