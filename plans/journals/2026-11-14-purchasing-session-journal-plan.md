---
title: Purchasing session journal plan
date: 2026-11-14
summary: "Planned a JSON journal the purchasing skill writes after each task, with a versioned schema for a frontend viewer."
---

# Purchasing session journal plan

## What happened
Planned `plans/261114-1028-purchasing-session-journal/`: the purchasing skill gets a step 8 that writes one JSON file per task to `valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json` on the customer's host, conforming to a shipped `journal.schema.json` (schema_version 1).

## Decision
JSON document over Markdown+frontmatter or JSONL, so a viewer needs one parser. Local file over a server tool, because the request was a skill change; the schema has no file fields so a later server endpoint can accept it unchanged. Field names copy the server's `QuoteOption` and order fields.

## Next steps
Implement with `/ak-cook`; decide later whether journals go to the order console.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
