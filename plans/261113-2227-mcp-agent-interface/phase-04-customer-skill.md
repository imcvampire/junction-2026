# Phase 4: Customer skill

Goals: S1, S2. A skill the customer installs in their own agent. It guides the procedure; the
server enforces every rule that matters.

## Requirements

- Agent Skills format (`SKILL.md` with `name` and `description` frontmatter) so it installs in
  Claude Code, the Claude apps and other skill-aware hosts.
- It teaches this procedure:
  1. Resolve the date ("by Monday" → ISO date in Europe/Helsinki) and the buyer's requirements as
     catalog tags (`LACTOSE_FREE`, `brand:Valio`, `no:AM`, …). Call `whoami` to learn the mandate.
  2. Narrow with `search_products` (filters first, ≤ 20 hits). Never quote the whole catalog.
  3. `quote` at most 12 shortlisted products, passing the buyer's amount (for example 1000 L) and
     the requirements, so the server does the unit conversion.
  4. Rank by covers-date-and-quantity, then total price, then delivery reliability. Mention CO₂ when
     options are close. Use good-better-best over substitutes when nothing covers the request.
  5. `place_order` from the quote with a `reason` and a fresh `client_reference`. Never invent prices.
  6. On `pending_approval`, tell the human why (approval reasons) and poll with `get_order`.
     On `quote_changed` or `quote_expired`, re-quote and re-decide; do not retry blindly.
  7. Report back with product, quantity in sales units and the buyer's unit, unit price, total,
     delivery date, status and the audit link.
- An error-code table (`quote_changed`, `quote_expired`, `not_deliverable`, `invalid_quantity`,
  `rate_limited`, …) mapped to the action to take.
- The skill must not restate server limits as numbers that can drift (for example the spend limit).
  It points to `whoami`.

## Files

| Action | Path |
|---|---|
| create | `skills/valio-aimo-purchasing/SKILL.md` |
| create | `skills/valio-aimo-purchasing/references/tags-and-units.md`: common tags, allergen codes, sales-unit codes (`RAS`, `KI`, …) as observed in the catalog |
| create | `skills/valio-aimo-purchasing/references/worked-example.md`: the 1,000 L lactose-free milk request end to end |
| create | `skills/valio-aimo-purchasing/README.md`: install steps (copy to `.claude/skills/`, `claude mcp add --transport http valio-aimo <url>/mcp --header "Authorization: Bearer $KEY"`) |

`skills/` holds a product deliverable rather than docs, so it sits at the repo root next to `apps/`.

## Steps

1. Pull the real tag vocabulary and unit codes from the catalog with a streaming script (do not
   load the 83 MB JSON whole), then record them in `tags-and-units.md`.
2. Write `SKILL.md` under ~150 lines; details go in the references.
3. Dry-run the worked example against phase 3 with the fakes, and make sure tool names and fields
   match `tools/list` exactly.

## Validation

- Tool and field names in the skill match `tools/list` output (a scripted check in
  `tests/test_mcp.py` that greps the skill for tool names is enough).
- Phase 5 live demo uses this skill unmodified.
