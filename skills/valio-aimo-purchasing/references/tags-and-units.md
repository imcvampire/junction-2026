# Reading tags, allergens and units

How to read the fields that `search_products`, `get_product` and `quote` return, and how to write
requirements the server can check.

## Requirement tags

A product's `tags` list is the vocabulary. Use the same strings in `search_products.required_tags`
and `quote.requirements`. Matching is exact and case-insensitive. Three forms exist:

| Form | Example | Meaning |
|---|---|---|
| Catalog tag | `LACTOSE_FREE`, `VEGAN`, `FREE_FROM_GLUTEN`, `EU_ORGANIC_FARMING` | The tag appears in the product's `tags` |
| `FREE_FROM:<code>` | `FREE_FROM:AM` | The producer declared the product free from that allergen |
| `brand:<Brand>` | `brand:Valio` | The product's `brand` equals this |
| `no:<code>` | `no:AM` | The allergen code is not in the product's `allergens` |

`no:AM` only means milk is not listed, so a product with no allergen data passes. `FREE_FROM:AM` is a
positive declaration. Prefer `FREE_FROM:` when an allergy is at stake.

If you are unsure a tag exists, look at the `tags` of a product you know fits. The quote returns tags
the server cannot check in `ignored_requirements`. Those are not enforced, so fix them or tell the
buyer.

Tags ending in `TEMPERATURE` (`COOLTEMPERATURE`, `FREEZETEMPERATURE`, `WARMTEMPERATURE`) describe
storage, not dietary properties.

## Allergens

`allergens` maps GS1 codes to names, for example `{"AM": "milk"}`. Use the code in
`exclude_allergens`, `no:<code>` and `FREE_FROM:<code>`. Common codes: `AM` milk, `AW` gluten
cereals, `UW` wheat, `AE` eggs, `AY` soy, `AF` fish, `AN` tree nuts, `AP` peanuts, `AS` sesame,
`AU` sulphites, `BC` celery, `BM` mustard, `AC` crustaceans, `UM` molluscs, `NL` lupin. A code with
no known name is shown as the code itself.

## Sales units and quantities

- `sales_unit` is a technical code such as `KI`, `ST`, `KG` or `PAK`, with no translation in the
  data. Do not guess what it holds from the code.
- `content_per_sales_unit` says what one sales unit holds, for example `10 L` or `0.4 kg`. Use it to
  explain quantities to the buyer. When it is `null`, the content is unknown and you must quote in
  sales units.
- `unit_price` is per sales unit and `line_total` is for the whole quantity; both exclude VAT.
  `unit_price_with_tax` includes VAT.
- `allowed_lot_size` is the step order quantities must be a multiple of. Cases and pieces are also
  ordered in whole units. The quote's `quantity` is always a valid order quantity; if you gave an
  invalid one, `conversion` says how it was rounded up.

When you pass an `amount` to `quote` (units `L`, `dl`, `cl`, `ml`, `kg`, `g`), each option returns:

- `requested`: what you asked for, for example `1000 L`;
- `quantity`: the sales-unit quantity to order;
- `conversion`: the working, for example `1000 L / 10 L per KI = 100 -> 100 KI`, with a note when
  the server rounded up to a whole unit or to the lot size;
- `conversion_error`: set instead when the amount cannot be converted, for example litres asked for a
  product measured in kilograms. That option has no `quantity` or `line_total`.

## Availability

- `earliest_available_date`: the first date the product can be delivered.
- `available_amount`: stock in sales units, or `null` with `unlimited_stock: true` when supply is
  not limited.
- `covers_request`: the full `quantity` is available by the delivery date. It is `null` when you
  gave no quantity or amount.
- `orderable`: false when there is no price, no stock or a sales block.
- `order_cutoff`: the supplier's order closing time, when given.

## Other option fields

- `meets_requirements` and `missing_requirements`: the result of checking the quote's frozen
  requirements against this product.
- `delivery_reliability`: historical on-time ratio from 0 to 1, or `null` when unknown.
- `co2_kg_per_sales_unit` and `co2_kg_total`: estimated footprint, or `null` when unknown.
- `rank` and `cheapest_covering_option`: the server's ranking, as described in step 4 of `SKILL.md`.
