---
title: Purchasing session journal implemented
date: 2026-11-14
summary: "The purchasing skill now writes a schema-validated JSON journal per task; live runs found two wording gaps, both fixed in the guide, not the schema."
---

# Purchasing session journal implemented

## What happened
Shipped `references/journal.schema.json` (2020-12, `schema_version` 1), `journal.md`, `journal-example.json`, SKILL.md step 8, and `tests/test_skill_journal.py` with `jsonschema` as a dev dependency. Three headless sandbox runs produced journals that matched the server's orders. The first had two defects: `errors[].next` in place of `handling`, and a guessed `finished_at` two minutes in the future.

## Decision
Fixed both by making `journal.md` explicit (exact field names, read the host clock and never estimate it) rather than relaxing `required` or the timestamp rule. The rerun validated cleanly.

## Next steps
The human-approved path is covered only by the example; an interactive sandbox run would confirm `confirmed_via: mcp_elicitation` end to end.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
