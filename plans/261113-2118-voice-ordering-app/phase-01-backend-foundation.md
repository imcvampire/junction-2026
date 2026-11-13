---
phase: 1
title: Backend foundation — upstream client and catalog
status: done
depends_on: []
---

# Phase 1 — Backend foundation

## Context

`apps/api` is a bare FastAPI app (`create_app`, `Settings` with `API_` prefix, health route).
Challenge data sits in `apps/api/data/`. The upstream API key is currently committed in
`apps/api/data/api-key-note.txt`.

## Requirements

- Upstream key read from env (`API_VALIO_API_KEY`), base URL from `API_VALIO_BASE_URL`.
- Typed async client for `POST /api/price`, `POST /api/availability` (≤1,000 codes per call),
  `GET /api/ping`. Shared `httpx.AsyncClient` via lifespan; timeouts; map 422/429/5xx to typed errors.
- Catalog loaded once at startup from `valio_aimo_junction26_product_data.json`, joined with
  delivery-reliability and carbon-footprint CSVs. In-memory search by name (en/fi/sv), category,
  allergen/label, excluding `deleted`.
- Expose case dimensions (mm) and gross weight per sales unit from `synkkaData.unitConversions[]`.
- Short TTL cache for price/availability keyed by (customer, sorted codes, date).

## Files

- Modify: `apps/api/src/api/config.py`, `apps/api/src/api/main.py`, `.env.example`
- Create: `apps/api/src/api/valio/client.py`, `apps/api/src/api/catalog/index.py`,
  `apps/api/src/api/routes/products.py`
- Tests: `apps/api/tests/test_catalog.py`, `apps/api/tests/test_valio_client.py` (respx/httpx mock transport)

## Endpoints

- `GET /api/products?q=&category=&limit=` — static catalog search
- `POST /api/products/quote` — `{codes, date}` → merged price + availability

## Steps

1. Move the API key out of git: add `API_VALIO_API_KEY` to `.env`, delete the note file, rotate the key with organizers if the repo is or will be public.
2. Settings + lifespan-managed client.
3. Catalog loader and search; unit tests on a small fixture slice.
4. Quote endpoint with cache; test batching and error mapping.

## Validation

- `mise run lint:api typecheck:api test:api`
- Manual: `GET /api/products?q=lactose-free milk` returns candidates with dimensions.

## Risks / rollback

Catalog JSON is large; load time and memory measured at startup. Rollback = revert module; no data migration.
