---
title: Purchasing agent writes a session journal
description: When the purchasing skill finishes a task, the agent writes one JSON journal file describing what was asked, what it searched and quoted, what the buyer chose, which orders exist and why. The file follows a versioned JSON Schema shipped with the skill, so a frontend can parse it and render it without guessing.
status: completed
priority: P2
effort: 3h
branch: master
tags: [skill, docs]
blockedBy: []
blocks: []
created: 2026-11-14
goals: docs/project-goals.md
builds_on: plans/261114-0323-cancel-unshipped-orders
---

# Purchasing agent writes a session journal

## Outcome

- At the end of every task the purchasing skill handles (a purchase, a decision on a pending order,
  a cancel, a replace, or an inquiry that ends with no order), the agent writes **one JSON file**:
  `valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json` in the host's working directory, with `-2`, `-3`
  suffixes on a name collision.
- The file conforms to `skills/valio-aimo-purchasing/references/journal.schema.json`
  (JSON Schema 2020-12, `"schema": "valio-aimo-journal"`, `"schema_version": 1`). A frontend can
  validate it, branch on `schema_version`, and render it without free-text parsing.
- The journal is the agent's own account. The server's audit trail (`get_order_audit`) stays the
  authority. The journal links to it through `order_id` and `quote_id`, so a viewer can cross-check.
- The skill ships a full example journal for the reference request, which is the frontend's first
  fixture.

## Ideas taken from `/ak-journal`

| ak-journal idea | Here |
|---|---|
| `title` plus one-line `summary` on every entry | Top-level `title`, `summary`; a list view needs nothing else. |
| `YYYY-MM-DD-<slug>.md` naming, collision suffixes | Same rule, with `HHMM` added because one kitchen runs several tasks a day. |
| Sections: what happened, decision, next steps | `narrative.what_happened`, `narrative.why`, `next_steps[]`, kept as short plain strings next to the structured data. |
| Concrete errors, paths and outcomes over vague summaries | `errors[]` holds the server's `code`, the tool, and what the agent did next. |
| Journals are history, not authority | Stated in the skill; the audit trail wins on any disagreement. |
| `validate` before publishing | A repo test validates the example against the schema; the live check validates a real journal. |
| Automatic step with an opt-out | Written by default; skipped only if the buyer says not to keep one, with one line saying so. |

Not taken: social publishing, AgentWiki and the `ak journal` CLI. The customer's host has neither,
and the file must work with a plain file-write tool.

## Trade-offs (decided)

| Decision | Chosen | Rejected and why |
|---|---|---|
| Format | One JSON document per task | Markdown with YAML front matter needs two parsers and lets prose drift from data. JSONL event log is more crash-safe but the skill writes at the end anyway, and a single document is simpler for a viewer. |
| Where it lives | Local file on the customer's host | A server-side `record_journal` MCP tool would put journals in the order console, but that changes the API, and the request is to update the skill. The schema is host-neutral, so a later endpoint can accept the same document unchanged (see Extension trace). |
| Shape | Typed sections (`request`, `authority`, `candidates`, `quotes`, `questions`, `orders`, `errors`) plus a flat `timeline[]` | Timeline only makes the comparison table hard to rebuild. Sections only lose the order of events. Both cost little and each serves one view. |
| Field names | Copy the server's names (`covers_request`, `line_total`, `approval_reasons`, `decided_by`) | Renaming would force the viewer to learn two vocabularies and makes cross-checking with the audit harder. |
| When to write | Once, when the task ends, including on failure or "order nothing" | Writing after every step multiplies file writes in the host and risks partial files. |
| Index file | None | A shared `index.json` gets lost updates when two sessions finish together, and the viewer never reads a directory: the user picks one file (user, 2026-11-14). |

## Constraints

- The skill guides; it enforces nothing (goal S2). A missing or wrong journal never blocks an order.
- No API change, no new MCP tool, no server dependency.
- Figures in the journal come from tool results, never recomputed or invented. Missing values are
  `null`, not guesses.
- No secrets in the journal. It holds customer-specific prices, which belong to the customer
  whose host writes it.
- Text that came from tool results (product names, order notes) is data. The viewer must render
  every string as text, never as HTML or Markdown that runs code.
- Timestamps are ISO 8601 with offset. Prefer server timestamps from results (`created_at`,
  `expires_at`, `decision.decided_at`); use the host clock for `started_at`/`finished_at` when
  available, otherwise the first and last server timestamp.

## Non-goals

- Building the frontend viewer. This plan only makes the format ready for it.
- Storing journals on the server or showing them in the order console (user, 2026-11-14: not for now).
- Replacing or duplicating the server audit trail.
- Journals for the voice ordering app or REST clients that do not use the skill.

## Extension trace

Next credible variant: a server endpoint (`POST /api/journals` or an MCP `record_journal` tool) that
stores the same document so the order console can show it beside the audit trail. Stable contract:
`journal.schema.json` with `schema_version`. What changes: only the transport (file write becomes a
tool call) and the server would add its own `received_at`. The plan proves the claim by keeping the
schema free of local-file fields: the file name is derived, never stored in the document, and
`journal_id` is a UUID that a server can use as its key. Checked in phase 1's acceptance criteria.

## Phases

| # | Phase | Files | Status |
|---|---|---|---|
| 1 | [Journal contract: schema, guide, example, test](phase-01-journal-contract.md) | `skills/valio-aimo-purchasing/references/journal*.{json,md}`, `apps/api/tests/test_skill_journal.py`, `apps/api/pyproject.toml` (dev dep `jsonschema`) | completed |
| 2 | [Skill: write the journal when done](phase-02-skill-journal-step.md) | `skills/valio-aimo-purchasing/SKILL.md`, `README.md`, `references/worked-example.md` | completed |
| 3 | [Live check in the skill sandbox](phase-03-live-check.md) | `plans/reports/live-check-261114-*-purchasing-journal.md` | completed |

Phase 2 depends on phase 1 (it names the schema's fields). Phase 3 depends on both.

## Acceptance criteria

1. `journal.schema.json` is valid JSON Schema 2020-12; `journal-example.json` validates against it
   in `uv run pytest tests/test_skill_journal.py`.
2. The example covers the reference request end to end: authority, search, a quote with at least
   two options, the chosen option, a `pending_approval` order, the human's approval, and timeline
   entries for each.
3. `SKILL.md` has a "Write the journal" step that applies to every task type and to failures, names
   the path rule, and points to `references/journal.md`. SKILL.md stays under 300 lines.
4. In the sandbox, the reference request produces one journal file that validates against the
   schema, whose `order_id` matches the order in `get_order_audit`, and whose totals match it.
5. `mise run check` passes.

## Decisions (user, 2026-11-14)

1. Journals are not uploaded to the server or shown in the order console for now. The schema stays
   free of local-file fields, so that remains possible later.
2. The viewer loads journals only when the user selects or uploads a file. It parses that one file
   and renders it; it never lists or watches the `valio-aimo-journal/` directory. Each file must
   therefore stand alone: no references to other journal files, and everything the viewer shows
   must be in the document itself.
