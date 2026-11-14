---
phase: 3
title: "Live check in the skill sandbox"
status: in-progress
effort: 1h
depends_on: [1, 2]
---

# Phase 3: Live check in the skill sandbox

## Context

- `mise run dev` serves the API and MCP on port 8000; `mise run skill:sandbox` prepares a directory
  outside the repo where plain `claude` sees only the MCP server and the skill.
- `API_OXYLABS_API_KEY` must be set in `.env` (the user's key, never echoed).

## Steps

1. Reuse a running dev server on port 8000 if it belongs to this repo; otherwise start
   `mise run dev` in the background and record its PID. Stop it at the end if this phase started it.
2. `mise run skill:sandbox`, then run the reference request in the sandbox with a shortfall
   (for example 1,000 L by a date where the primary product covers only part, or
   `API_REQUIRED_TAGS` set so the first choice needs a substitute).
3. Check, from the MCP transcript and server logs:
   - `research_substitutes` is called once, before the substitute table and dialog.
   - The outbound queries (DEBUG log, local only) hold catalog names and purpose, no price or
     customer id.
   - The dialog descriptions cite fit points and a source site.
   - The order, price and stock match `quote`, not the web text.
4. Repeat with `API_OXYLABS_API_KEY` unset: the agent reports web context unavailable in one line,
   still offers catalog substitutes, and the journal records `outcome: not_configured`.
5. Validate both journals against the schema and open them in the web viewer.
6. Write `plans/reports/live-check-261114-<HHMM>-substitute-research.md`: what ran, pass/fail per
   check, latency and source count of the research call, any deviation. No key, no full prompt.

## Validation

All checks in step 3-5 pass; `mise run check` passes; `git status` shows no `.env` change staged.
