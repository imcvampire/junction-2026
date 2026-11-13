---
phase: 1
title: Role on agent keys, migration and CLI
status: completed
depends_on: []
---

# Phase 1: Role on agent keys, migration and CLI

## Context

Keys are rows in `agents` (`apps/api/src/api/orders/store.py:42`), minted by `AgentRegistry.create`
(`agents/registry.py`) and resolved to `AgentPrincipal` (`agents/models.py`) on every request. This
phase adds a role to that identity without changing how any existing key behaves.

## Requirements

- `Role = Literal["member", "admin"]` in `agents/models.py`. Add `role: Role = "member"` to
  `AgentPrincipal`, and through it to `AgentRecord`. Add an `is_admin` property.
- Schema: add `role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin'))` to the
  `CREATE TABLE agents` statement. For existing databases, add the column in `Store.__init__` with
  the same `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` pattern already used for `agent_id`
  (`store.py:81`). SQLite allows a `CHECK` in `ADD COLUMN` when a constant default is given.
- `insert_agent(..., role)`. `agent_by_key_hash` and `list_agents` select `role`, and `_record`
  maps it.
- `AgentRegistry.create(name, customer, mandate=None, role="member")`. Log `agent_created ... role=%s`.
- `AgentRegistry.set_role(agent_id, role) -> bool` for promoting or demoting a key without
  reissuing it.
- CLI (`agents/cli.py`): `create --role {member,admin}` (default `member`), and a `set-role
  <agent_id> {member,admin}` subcommand. `list` already dumps the record, so the role shows up there.
- `mise.toml`: update the `agent:create` description to mention `[--role admin]`, and add
  `agent:set-role`.

## Files

Modify: `apps/api/src/api/agents/models.py`, `agents/registry.py`, `agents/cli.py`,
`orders/store.py`, `mise.toml`. Tests: `apps/api/tests/test_agent_registry.py`.

## Steps

1. Back up the local runtime DB before the first run: `cp apps/api/data/app.sqlite3
   apps/api/data/app.sqlite3.bak-$(date +%s)` if it exists. The backup is gitignored, like the DB.
2. Model, then store, then registry, then CLI, then mise.
3. Tests (in `test_agent_registry.py`):
   - Default role is `member`, `--role admin` persists, and `resolve` returns the role.
   - Migration: build an `agents` table with the old DDL (no `role`) and insert a row. Opening
     `Store` on it should resolve the row as `member`.
   - `set_role` returns False for an unknown id, and the new role is effective on the next `resolve`.
   - CLI `create --role admin` output has `"role": "admin"` and includes the key once.

## Validation

```bash
cd apps/api && uv run pytest tests/test_agent_registry.py && uv run ruff check src tests && uv run pyright
```

## Risk and rollback

The column is additive with a default, and old code ignores it. To roll back, revert the commit and
restore the DB backup if needed.
