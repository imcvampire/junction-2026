# CLAUDE.md

## Project and problem

Junction 2026, Valio Aimo challenge. The full brief is in [`project.md`](project.md); read it before
any product or API design decision. Our own goals, non-goals and acceptance criteria are in
[`docs/project-goals.md`](docs/project-goals.md), and implementation plans are in `plans/`.

The challenge is to design how an external, autonomous purchasing agent can work with a food-service
wholesaler (Valio Aimo, 20,000+ professional kitchens) without exposing real systems or confidential
data. Use the reference request to test any design: *"I need 1,000 litres of lactose-free milk by
Monday. Find an option that meets our requirements based on price and availability."*

Core scope, which the solution must cover:

- Structured product, price and availability lookup.
- Moving from inquiry to a placed order at fixed prices, with no negotiated quotes.
- Permissions and human approval: what the agent decides alone and what needs sign-off, such as a
  spend threshold or a substitution outside stated preferences.

Optional directions are delivery reliability and sustainability comparison (carbon footprint is a
stretch goal), substitution and exception handling ("good-better-best" ranking within the
assortment), and a human-readable audit trail of what the agent did and why. The brief says this
is not a chatbot replacing the webshop. The point is to make the wholesaler safely and openly
readable by agents, built on open, verifiable standards.

## Dataset (`apps/api/data/`)

The data is mock data for Junction 2026 only. It is not accurate product information and must not
be used outside the event.

| File | Contents |
|------|----------|
| `valio_aimo_junction26_product_data.json` | Static catalog: a JSON array of about 17.5k products (83 MB). |
| `valio_aimo_junction26_product_data_schema.json` | JSON Schema for the catalog. Read this instead of loading the full JSON to learn field meanings. |
| `valio_aimo_junction26_delivery_reliability.csv` | `productId,deliveryReliability`, a ratio between 0 and 1. Covers about 4.4k products only. |
| `valio_aimo_junction26_carbon_footprint.csv` | `productId,AVG kg CO2-eq/kg`. Covers about 11k products. |
| `openapi.json` | Spec of the Valio Aimo mock API, used for live price and availability. |
| `Valio Aimo Junction 2026 Challenge.pdf` | The original challenge deck. |

Product fields: `id`, `salesUnit`/`baseUnit` (technical unit codes such as `RAS` and `KI`, with no
translations in the data), `units`, `allowedLotSize` (the order quantity must be a multiple of it),
`category`, `deleted`, `temperatureCondition`, `vendorName`, `countryOfOrigin`, `substitutions`,
`deposits`, and `synkkaData`. `synkkaData` holds the GTIN, multilingual `names` and `marketingTexts`
in fi, sv and en, origin, and media. The `id` field joins to `productId` in both CSVs and in the API.

Mock API (`openapi.json`), authenticated with the `X-API-Key` header:

- `POST /api/price` and `POST /api/availability` take a `ProductsRequest` (`customer`,
  `requestedDate`, `products`). Availability returns `scheduleLines` with `availableAmount` and
  `availableDate`. Price returns catalog, list and with-tax prices.
- `GET /api/*/download` returns download links for the three static files above.
- `GET /api/ping` is a health check.

Rules for using the data:

- Narrow candidates with the static catalog first, then call price and availability only for that
  short list. Prices and availability are customer-specific and change over time, and the API has
  undisclosed rate limits, so never query it for the whole catalog.
- Do not read or `cat` the 83 MB product JSON whole. Inspect it with a streaming or sliced script.
  Tests use the small copies in `apps/api/tests/fixtures/data/`.
- The backend loads the data from `api.config.Settings.data_dir`, which defaults to this directory.
- `app.sqlite3*` files in this directory are local runtime state, are gitignored, and are not part
  of the dataset.
- The API key lives in `.env`, which mise loads. Never commit it.

## Commands

Tasks are defined in `mise.toml`: `mise run install`, `mise run dev` (API on port 8000, web on
port 5173), `mise run check` (lint, typecheck and test), and `mise run fmt`. For focused API tests,
run `uv run pytest tests/test_<area>.py` inside `apps/api`.
