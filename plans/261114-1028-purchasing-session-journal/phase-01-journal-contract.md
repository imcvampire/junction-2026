---
phase: 1
title: "Journal contract: schema, guide, example, test"
status: completed
effort: 1.5h
---

# Phase 1: Journal contract

## Context

- `skills/valio-aimo-purchasing/SKILL.md` (procedure, error codes, field names).
- `apps/api/src/api/procurement/schemas.py`: `QuoteView`, `QuoteOption`, `AuditView`; reuse their
  field names.
- `apps/api/src/api/orders/models.py`: `AuditEntry`, `Decision`, `CancelRequest`, order statuses.
- `skills/valio-aimo-purchasing/references/worked-example.md`: source for the example journal.

## Files

Create:

- `skills/valio-aimo-purchasing/references/journal.schema.json`
- `skills/valio-aimo-purchasing/references/journal.md`
- `skills/valio-aimo-purchasing/references/journal-example.json`
- `apps/api/tests/test_skill_journal.py`

Modify: `apps/api/pyproject.toml`, `apps/api/uv.lock` (dev dependency `jsonschema`).

## Document shape (schema_version 1)

Top level, all required unless marked optional:

| Field | Type | Notes |
|---|---|---|
| `schema` | const `"valio-aimo-journal"` | Lets a viewer reject unrelated JSON. |
| `schema_version` | const `1` | Viewer branches on it. Additive fields keep 1; renames or removals bump it. |
| `journal_id` | UUID string | Key for a future server store. |
| `title` | string, max 120 | List view headline, e.g. `1,000 L lactose-free milk for Mon 16 Nov`. |
| `summary` | string, max 300 | One sentence with the outcome. |
| `kind` | enum `purchase`, `decision`, `cancel`, `replace`, `inquiry` | What the task was. |
| `outcome` | enum `placed`, `pending_approval`, `approved`, `rejected`, `cancelled`, `no_order`, `failed` | Final state the task left behind; matches order statuses where they overlap. |
| `started_at`, `finished_at` | date-time | See timestamp rule in plan.md. |
| `agent` | `{agent_id, customer, host?, model?}` | From `whoami`; host and model when the host exposes them. |
| `authority` | `{spend_limit_eur, required_tags[], banned_allergens[]}` | From `whoami`. |
| `request` | `{text, delivery_date?, amount?: {value, unit}, quantity?, requirements[], purpose?}` | The buyer's words verbatim plus how the agent read them. |
| `searches[]` | `{query, required_tags[], exclude_allergens[], result_count}` | One per `search_products` call. |
| `candidates[]` | `{product_id, name, source: search\|substitute\|buyer, kept, drop_reason?}` | Why each hit was kept or dropped before quoting. |
| `quotes[]` | `{quote_id, created_at, expires_at, delivery_date, currency, purpose?, options[]}` | `options[]` copies `QuoteOption` fields: `rank, product_id, name, brand, sales_unit, content_per_sales_unit, requested, quantity, conversion, unit_price, line_total, covers_request, meets_requirements, missing_requirements, breaks_mandate, delivery_reliability, co2_kg_total, cheapest_covering_option`, plus `chosen: bool`. Nullable where the server's are. |
| `questions[]` | `{header, question, options[]: {label, description, recommended}, answer, free_text?}` | Each dialog shown to the buyer and the answer. |
| `decision` | `{rule, chosen[]: {product_id, quantity, substitute_for?}, reason}` or `null` | `rule` enum: `cheapest_covering`, `buyer_choice`, `split`, `no_order`. `reason` is the `place_order` reason. |
| `orders[]` | `{order_id, client_reference?, quote_id?, status, total, currency, delivery_date, approval_reasons[], decision?: {decision, reason, decided_by, confirmed_via}, cancellation?: {reason, cancelled_by, confirmed_via, replaced_by?}}` | Final known state of every order this task touched. |
| `errors[]` | `{at, tool, code, message, handling}` | Every refused call and what the agent changed. |
| `timeline[]` | `{seq, at?, type, title, tool?, refs?: {quote_id?, order_id?, product_ids?[]}}` | `type` enum: `authority`, `search`, `quote`, `question`, `answer`, `order`, `approval`, `cancel`, `error`, `report`. `seq` starts at 1 and increases by 1. |
| `metrics` | `{tool_calls, quotes, buyer_questions, total_excl_vat?, co2_kg_total?, savings_vs_next_option_eur?}` | Pre-computed only from figures already in the document, for the viewer's header. |
| `narrative` | `{what_happened, why, watch_out?}` | Short plain text, no Markdown. |
| `next_steps[]` | string | For example `Approve ord_… in the order console`. |

Schema rules: `additionalProperties: false` at the top level only, so the agent cannot invent
top-level sections, but nested objects may carry extra server fields. Strings that hold ids get
`minLength: 1`. Money is `number`, never a formatted string.

## Steps

1. Write `journal.schema.json` from the table, with `$id`, `title`, `description` on every
   property (the viewer can show them as tooltips), and `$defs` for `option`, `order`, `timeline_entry`.
2. Write `journal-example.json` for the worked example: whoami 500 EUR, search `milk 1 l` with
   `LACTOSE_FREE`, three candidates, quote with 464119 and 464073, 464119 chosen by
   `cheapest_covering`, order `pending_approval` then `approved` with the buyer's reason
   `For the gala dinner`, `confirmed_via: mcp_elicitation`. Ids are obviously fake (`q_example`,
   `ord_example`).
3. Write `journal.md` (under 120 lines): when to write, the path rule, where each field comes from
   (which tool result), the null rule, the opt-out line, the "history, not authority" rule, and a
   short "for viewers" note: the user selects one file, the viewer validates it against the schema,
   rejects files whose `schema` is not `valio-aimo-journal`, branches on `schema_version`, and
   renders every string as text. The document is self-contained; it never refers to another file.
4. Write `test_skill_journal.py`: load the schema, check it with
   `Draft202012Validator.check_schema`, validate the example, and assert that every `timeline[].refs`
   `order_id`/`quote_id` appears in `orders[]`/`quotes[]` and `seq` is 1..n. Locate files relative
   to the repo root (`Path(__file__).parents[3] / "skills/..."`).
5. `jsonschema` is in `uv.lock` only as a transitive dependency (checked 2026-11-14). Add it to the
   dev group with `uv add --dev jsonschema` in `apps/api` instead of relying on it, and modify
   `apps/api/pyproject.toml` and `uv.lock` accordingly.

## Validation

- `cd apps/api && uv run pytest tests/test_skill_journal.py`
- `mise run check`
- Extension check: the schema has no field holding a file path or file name.

## Risks

- Drift between server field names and the schema as the API evolves. Mitigation: the names are
  copied from `schemas.py`; the test fails only on the example, so phase 2 tells the agent to copy
  values from results and leave unknown ones out of nested objects rather than invent names.
- Too strict a schema makes real journals fail validation over trivial gaps. Mitigation: nullable
  optional values and permissive nested objects.

## Rollback

Delete the four new files. Nothing else depends on them until phase 2.
