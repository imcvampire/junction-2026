# Live check: purchasing session journal

Date: 2026-11-14, Europe/Helsinki. Sandbox: `~/.cache/junction-2026/agent-sandbox` (via
`mise run skill:sandbox`). The API was already running on port 8000 and was reused.

## How it was run

Headless `claude -p` in the sandbox, with tools limited to the `valio-aimo` MCP server, `Write`,
`Read` and `Bash` for `mkdir`, `ls`, `date` and `uuidgen`. Headless mode cannot answer the server's
approval form, so every `approve_order` came back `decision_cancelled` and the orders stayed
`pending_approval`. The human-approved path (`approved`, `confirmed_via: mcp_elicitation`) is
covered only by `journal-example.json` and the repo test, not by a live run.

Each journal was validated with `Draft202012Validator` plus `FormatChecker` against
`skills/valio-aimo-purchasing/references/journal.schema.json`, then compared with
`GET /api/orders/{id}`.

## Runs

| # | Task | Journal | Schema | Matches server |
|---|---|---|---|---|
| 1 | Reference request | `2026-11-14-1058-1000-l-lactose-free-milk-for-mon-16-nov.json` | 1 error: `errors[0]` used `next` instead of `handling` | `ord_7d925fd040df`, `pending_approval`, 1300.00, quote `q_f711f34d351b4809`: yes |
| 2 | Cancel order 1 | `2026-11-14-1056-cancel-ord-7d925fd040df-milk-no-longer-needed.json` | valid | `cancelled`, reason, `cancelled_by: agt_mcp`, `confirmed_via: agent`: yes |
| 3 | Reference request, after the fixes; the agent asked the buyer to choose, answered `A. It's for drinking.` with `--continue` | `2026-11-14-1059-1000-l-lactose-free-milk-for-mon-16-nov.json` | valid | `ord_ec6c0204139f`, `pending_approval`, 1400.00, quote `q_552b475082aa4e2f`, purpose `drinking`: yes |

Run 2 wrote a second file and did not overwrite run 1. Run 3 recorded the buyer question, the
answer, `free_text`, `decision.rule: buyer_choice`, the `decision_cancelled` error with `handling`,
and `request.purpose: drinking`. Run 3 correctly wrote no journal at the first pause, only when the
task ended.

## Defects found and fixes

1. **Wrong field name in `errors[]`** (run 1). `journal.md` described the field as "what you
   changed next", and the agent named it `next`. Fixed in `journal.md`: the row now names
   `handling` with an example, and a rule says to use the schema's field names exactly and include
   every required field. The schema was not loosened.
2. **Estimated timestamp** (run 1). `finished_at` was `10:58:00` and the file name used `1058`, but
   the file was written at 10:56:00. The agent guessed the time instead of reading the clock. Fixed
   in `journal.md` (read the host clock, for example `date -Iseconds`, at the start and right before
   writing, and never estimate it) and in SKILL.md step 8 (the file name comes from `finished_at`,
   read from the host clock). Run 3 used real clock times (finished `10:59:06`, file written 10:59).

## Left behind

- `ord_ec6c0204139f` is still `pending_approval` in the local `app.sqlite3`. It is mock runtime
  state and can be approved, rejected or cancelled from the order console.
- Run 1's invalid journal is still in the sandbox, outside the repo, as evidence.
