---
phase: 2
title: Orders, approval policy, audit trail
status: done
depends_on: [1]
---

# Phase 2 — Orders, approval policy, audit trail

## Requirements

- Order lifecycle: `draft → agreed → placed | pending_approval → approved | rejected`.
- Prices are fixed: draft stores the quoted unit price and quote timestamp; re-quote on placement and
  refuse if price or availability changed (agent must re-confirm with the buyer).
- Approval policy (config-driven, enforced server-side): autonomous if total ≤ spend threshold and
  no substitution outside stated preferences; else `pending_approval`.
- Audit entry per state change: request text, candidates considered, choice, reason, actor
  (agent / buyer / approver), timestamp. Human-readable rendering endpoint.
- Idempotency key on place/approve to survive retries from flaky mobile connections.

## Files

- Create: `apps/api/src/api/orders/{models,policy,service,store}.py`, `apps/api/src/api/routes/orders.py`
- Tests: `apps/api/tests/test_policy.py`, `apps/api/tests/test_orders.py`

## Endpoints

- `POST /api/orders` (draft), `POST /api/orders/{id}/agree`, `POST /api/orders/{id}/place`,
  `POST /api/orders/{id}/approve|reject`, `GET /api/orders/{id}`, `GET /api/orders/{id}/audit`

## Validation

- Policy table tests: under/over threshold, in/out of preference substitution, price drift on place.
- `mise run test:api`

## Risks / rollback

SQLite file location from settings; tests use a temp DB. Rollback = drop the file.
