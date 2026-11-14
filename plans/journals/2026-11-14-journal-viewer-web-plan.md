---
title: Journal viewer web app plan
date: 2026-11-14
summary: "Planned a fresh apps/web (shadcn, Vite, TanStack Router) whose first feature, /journal-viewer, validates and renders one purchasing journal file."
---

# Journal viewer web app plan

## What happened
Planned `plans/261114-1101-journal-viewer-web/` in four phases: scaffold, the journal contract in the browser, the viewer page, and a browser smoke with docs. `apps/web` had existed (React 19, Vite 8, shadcn, pnpm) and was removed in `d87e79b`; it is reference only.

## Decision
The user chose a fresh `shadcn init`, TanStack Router with file-based routes, types generated from `journal.schema.json`, and Vitest plus one browser smoke. Ajv validates against the shipped schema imported in place, so the skill's schema stays the single source. `parseJournal` takes a string, so a later server-stored journal reuses it.

## Next steps
Implement with `/ak-cook plans/261114-1101-journal-viewer-web`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
