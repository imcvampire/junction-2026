# Task journal

At the end of every task this skill handles, write one JSON journal: your own account of what the
buyer asked, what you searched and quoted, what the buyer chose, which orders exist and why. The
format is `journal.schema.json` (JSON Schema 2020-12); `journal-example.json` is a full one for the
1,000 L lactose-free milk request.

## When

Once, after your final report to the buyer, for a purchase, a decision on a pending order, a cancel
or replace, and a task that ended with no order or with an error you could not fix. Never write it
mid-task or once per step.

Skip it only if the buyer asked not to keep a journal, and then say
`Journal skipped at the buyer's request.` If the host cannot write files, say so in one line. Do not
print the JSON in chat instead.

## Where

`valio-aimo-journal/YYYY-MM-DD-HHMM-<slug>.json` in the working directory. Date and time are
`finished_at` in Europe/Helsinki; `<slug>` is the title in lowercase kebab case, at most about 50
characters (`2026-11-13-0916-1000-l-lactose-free-milk-for-mon-16-nov.json`). If the name exists, add
`-2`, `-3` and so on. Never overwrite or edit another journal. Tell the buyer the path in one line.

The document never stores its own file name or path, and never refers to another journal file.

## Where each field comes from

| Field | Source |
|---|---|
| `schema`, `schema_version` | Always `"valio-aimo-journal"` and `1`. |
| `journal_id` | A new UUID. |
| `title`, `summary` | Yours: a headline of at most 120 characters and one sentence with the outcome. |
| `kind` | `purchase`, `decision` (deciding a pending order), `cancel`, `replace` or `inquiry` (prices or stock only). |
| `outcome` | The final status of the task's main order (`placed`, `pending_approval`, `approved`, `rejected`, `cancelled`), `no_order` when the buyer chose not to order, or `failed` when an error stopped you. |
| `started_at`, `finished_at` | Read the host clock (for example `date -Iseconds`) at the start and right before you write; never estimate a time. Without a clock, use the first and last server timestamp you saw. |
| `agent` | `whoami` `agent_id` and `customer`; `host` and `model` only if the host tells you. |
| `authority` | `whoami` `spend_limit_eur`, `required_tags`, `banned_allergens`. |
| `request` | `text` is the buyer's words verbatim; the rest is how you read them (resolved date, amount, tags, purpose). |
| `searches[]` | One per `search_products` call: its arguments and the result's `count`. |
| `candidates[]` | Each product you considered, `source` `search`, `substitute` (from `substitutes`) or `buyer` (named by the buyer), and why you dropped it. |
| `quotes[]` | Each `quote` result: `quote_id`, `created_at`, `expires_at`, `delivery_date`, `currency`, `purpose`, and its `options[]` copied field by field, plus `chosen`. |
| `questions[]` | Each dialog: header, question, options with `recommended`, the label picked as `answer`, and anything typed as `free_text`. |
| `decision` | `rule`: `cheapest_covering` (the ranking decided), `buyer_choice`, `split` or `no_order`; the lines ordered; `reason` is the `place_order` reason. `null` for a task with no choice, such as a cancel. |
| `orders[]` | The last result you saw for each order the task touched (`place_order`, `approve_order`, `reject_order`, `cancel_order`, `get_order`). `decision.decision` is `approved` or `rejected`, `decided_by` is `decision.decided_by.agent_id`, and `confirmed_via` comes from `get_order_audit`. `cancellation.cancelled_by` is `cancelled_by.agent_id`. |
| `errors[]` | Every refused call: `tool`, `code`, `message`, and `handling`, what you did next (for example `Reported to the buyer; did not retry.`). |
| `timeline[]` | One entry per step, `seq` from 1 with no gaps. `refs` name only ids that appear in `quotes`, `orders` or `candidates`. |
| `metrics` | Counts of your Valio Aimo tool calls, quotes and dialogs; `total_excl_vat` sums the task's orders that are not cancelled or rejected; `savings_vs_next_option_eur` is the next covering option's `line_total` minus the chosen one's. |
| `narrative` | Plain text, no Markdown: what happened, why the chosen option won, and anything to watch. |
| `next_steps[]` | What is left for the buyer, such as an order still pending approval. Empty when nothing is. |

## Rules

- Use the schema's field names exactly and include every required field; the viewer rejects a
  document that does not validate.
- Copy figures, ids, statuses and timestamps from tool results. Never recompute a price or invent
  an id.
- Use `null` for anything you do not know. Leave unknown fields out of nested objects rather than
  invent a name for them; you may keep extra server fields there.
- Never write secrets: no API keys, tokens or headers.
- Record every dialog answer, every refused call with its code, and why the chosen option won.
- The journal is history, not authority. The server's audit trail (`get_order_audit`) is the record
  of truth; if they disagree, the audit wins. Link them by `order_id` and `quote_id`.

## For viewers

A viewer loads one file the user selects. It rejects a file whose `schema` is not
`valio-aimo-journal`, branches on `schema_version`, validates the document against
`journal.schema.json`, and renders every string as plain text, never as HTML or Markdown, because
product names and notes come from tool results. Everything it shows is in the one document.
The reference viewer is the `/journal-viewer` route of `apps/web` in the source repository.
