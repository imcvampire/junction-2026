# Worked example: 1,000 L of lactose-free milk by Monday

Buyer: *"I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our
requirements based on price and availability."* Today is Friday 2026-11-13.

## 1. Authority

`whoami` returns `spend_limit_eur: 500` from the `global threshold`, with no mandate tags. An order
over 500 EUR will need a human, so tell the buyer early that it will be sent for approval.

## 2. Narrow

`search_products`:

```json
{"query": "milk 1 l", "required_tags": ["LACTOSE_FREE"], "limit": 10}
```

Keep plain drinking milks and drop ice cream, sour milk and powders. Shortlist: `464119` (Valio
skimmed milk 1 l lactose free UHT, `10 L` per `KI`), `464073` (Valio whole milk 1 l lactose free UHT,
`1 L` per `ST`) and `464201` (Valio semi skimmed milk 1 l lactose free UHT, `1 L` per `ST`).

## 3. Quote

The delivery date is Monday 2026-11-16.

```json
{
  "items": [
    {"product_id": "464119", "amount": {"value": 1000, "unit": "L"}},
    {"product_id": "464073", "amount": {"value": 1000, "unit": "L"}},
    {"product_id": "464201", "amount": {"value": 1000, "unit": "L"}}
  ],
  "delivery_date": "2026-11-16",
  "requirements": ["LACTOSE_FREE"],
  "request_text": "I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements based on price and availability."
}
```

The response is a ranked list with a `quote_id` and an `expires_at`. The figures below are
illustrative; live prices are customer-specific.

| Rank | Product | Conversion | Unit price | Total | Covers | Requirements |
|---|---|---|---|---|---|---|
| 1 | 464119 | `1000 L / 10 L per KI = 100 -> 100 KI` | 15.40 | 1,540.00 | yes | met |
| 2 | 464073 | `1000 L / 1 L per ST = 1000 -> 1000 ST` | 1.89 | 1,890.00 | yes | met |

Rank 1 carries `cheapest_covering_option: true`.

## 4. Place

`place_order`:

```json
{
  "quote_id": "q_…",
  "lines": [{"product_id": "464119", "quantity": 100}],
  "reason": "Cheapest lactose-free milk that covers 1,000 L by 2026-11-16; 350 EUR below the next option.",
  "client_reference": "8f0c2c1e-6c9e-4a43-9a51-0d7b2a4b1f10"
}
```

The response has `status: pending_approval` and the reason
`Total 1540.00 EUR exceeds the 500.00 EUR spend limit (global threshold)`.

## 5. Report

> I found Valio skimmed milk 1 l lactose free UHT (464119): 100 cases of 10 L, which is 1,000 L,
> at 15.40 EUR per case, 1,540.00 EUR excl. VAT, available for Monday 16 November. It is the
> cheapest option that covers the full amount. The order (ord_…) needs your approval because it is
> above my 500 EUR limit.

## 6. The buyer decides

Ask straight away with `AskUserQuestion` (`Approve (Recommended)`, `Reject`), and take the reason
from the free-text answer. The buyer answers "approve it, it is
for the gala dinner". Only then call:

```json
{"order_id": "ord_…", "reason": "For the gala dinner"}
```

on `approve_order`, and report `approved` with `decided_by` naming your own agent.

## If the price moves

If `place_order` returns `quote_changed` with
`details.changes = [{"problem": "price_changed", "was": 15.4, "now": 16.0}]`, no order was created.
Quote again, check that the ranking still holds, and ask the buyer with a dialog whether to order
at the new total before you place it.

## When the buyer must choose

Suppose the first order covered only 698 L with Valio Café milk, and the remaining 302 L must come
from a substitute. The re-quote returns four Arla lactose-free options that all cover 302 L, but
they differ in format and one ordering-deadline field looks already passed. The ranking rules would
pick the cheapest, yet the format change is the buyer's call, so ask (step 4a).

Show the table first (figures illustrative):

| Option | Product (id) | Quantity | Unit price | Total excl. VAT | Notes |
|---|---|---|---|---|---|
| A, closest match | Arla semi-skimmed milk drink 1 L UHT lactose free (469363) | 302 × 1 L | €2.48/L | €748.96 | Same 1 L UHT carton as the Café milk. 384 L available. Order by Sun 15 Nov 17:00. |
| B, cheapest | 5 × Arla 1 L lactose free semi-skimmed ESL (469330) | 61 cases = 305 L | €1.71/L | €520.94 | Unlimited stock, but the ordering deadline shown was Thu 12 Nov 15:00. |
| C | 12 × Arla whole milk drink 1 L UHT lactose free (464768) | 26 cases = 312 L | €2.54/L | €790.92 | Same deadline issue as B. |
| D | Arla 10 L Novobox semi-skimmed lactose free ESL (464179) | 31 × 10 L = 310 L | €2.72/L | €843.82 | Same deadline issue as B. |

> I recommend A: it keeps the same 1 L UHT format and costs a little less per litre than the Café
> milk. Every option is over the €500 limit, so any of them needs your approval.

Then call `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Which substitute should I order for the missing 302 L of lactose-free milk?",
    "header": "Substitute",
    "multiSelect": false,
    "options": [
      {"label": "A: Arla 1L UHT (Recommended)",
       "description": "469363, 302 × 1 L, €2.48/L, €748.96. Same format as the Café milk. Order by Sun 15 Nov 17:00. Needs approval."},
      {"label": "B: Arla ESL 5-pack",
       "description": "469330, 61 cases = 305 L, €1.71/L, €520.94. Cheapest, but its ordering deadline looks passed. Needs approval."},
      {"label": "C: Arla whole UHT 12-pack",
       "description": "464768, 26 cases = 312 L, €2.54/L, €790.92. Whole milk; same deadline issue as B. Needs approval."},
      {"label": "D: Arla 10 L Novobox",
       "description": "464179, 31 × 10 L = 310 L, €2.72/L, €843.82. Bulk ESL; same deadline issue as B. Needs approval."}
    ]
  }]
}
```

If the buyer picks A, check the quote's `expires_at`, then place the order with
`"reason": "Buyer chose option A: same 1 L UHT format as the Café milk, 302 L available by Monday."`
and report the `pending_approval` status as in section 5.
