---
title: Journal viewer implemented in apps/web
date: 2026-11-14
summary: "Recreated apps/web (shadcn, TanStack Router) and shipped /journal-viewer; checks green, nested apps/web/.git still blocks committing."
---

# Journal viewer implemented in apps/web

## What happened

Executed plan `plans/261114-1101-journal-viewer-web` end to end. `apps/web` is a fresh shadcn Vite app
(Base UI, nova preset) with TanStack Router file-based routes, wired into `mise run install`, `dev`,
`check`, `fmt` and `build:web`. `/journal-viewer` opens one journal file, validates it in the browser
against the skill's `journal.schema.json` with Ajv 2020, and renders it as plain text.

`mise run check` is green: 29 web tests and 118 API tests. The browser smoke passed (report:
`plans/reports/smoke-261114-1120-journal-viewer.md`). It covered the redirect, the example, the
`/errors/0` defect, a non-journal file, 390 px width with no page scroll, and zero network requests
during loads. All three sandbox journals now fail on the `orders[].total` rename, as expected.

## Surprises

- `shadcn init --preset base-nova` is rejected. The working form is `--base base --preset nova`.
- The shadcn CLI runs `git init` inside `apps/web`. The root repo then sees `apps/web` as an
  embedded repository and cannot track its files. A hook blocks the agent from touching `.git`, so
  the user must delete `apps/web/.git` before the first commit.
- The template's `typecheck` script (`tsc --noEmit` on a `files: []` root) checked nothing. Switching
  to `tsc -b` surfaced an unused import in the generated `scroll-area.tsx`.
- Tests import Node APIs (the type generator), so they live in their own `tsconfig.test.json`. This
  keeps `node` types out of browser code.
- json-schema-to-typescript names the root type from `title`, then from `$id`. The generator strips
  both from its in-memory copy to get `ValioAimoJournal`. The shipped schema is unchanged.
- Ajv strict mode compiled the shipped schema without any relaxation.

## Review fixes

The code reviewer found no XSS path and no parser-order bug. Fixes applied:

- A new `unreadable` load error for files whose read fails.
- Index-based React keys, with `JournalView` keyed per load.
- Buyer answers that match no offered option are now shown.
- Missing values use visually hidden "unknown" text instead of `aria-label` on a span.
- `role="status"` announces a successful load.
- New tests cover the drop path and the stale-read race. The race test was mutation-checked: it
  fails when the guard is removed.

## Also

At the user's request, the app is renamed to "Valio", with a placeholder "V" favicon that is not the
official logo.

## Next steps

- The user deletes `apps/web/.git`, then commits.
- Decide whether the viewer should reject duplicate or gapped `timeline[].seq`. It currently renders
  them safely.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
