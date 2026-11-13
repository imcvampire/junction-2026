import json
import sqlite3
from pathlib import Path

import pytest

from api.agents import cli
from api.agents.models import Mandate
from api.agents.registry import AgentRegistry, hash_key
from api.config import get_settings
from api.orders.store import Store


def test_key_is_returned_once_and_stored_only_as_hash(tmp_path: Path) -> None:
    db = tmp_path / "agents.sqlite3"
    store = Store(db)
    registry = AgentRegistry(store)

    principal, key = registry.create("hotel", "cust-1", Mandate(spend_limit_eur=250, banned_allergens=["am"]))
    store.close()

    assert key.startswith("vaa_") and len(key) > 40
    raw = b"".join(p.read_bytes() for p in tmp_path.iterdir())
    assert key.encode() not in raw
    resolved = AgentRegistry(Store(db)).resolve(key)
    assert resolved is not None and resolved == principal
    assert resolved.mandate.banned_allergens == ["AM"]
    assert resolved.mandate.requirement_tags() == ["no:AM"]


def test_unknown_malformed_and_disabled_keys_resolve_to_nothing(tmp_path: Path) -> None:
    registry = AgentRegistry(Store(tmp_path / "a.sqlite3"))
    principal, key = registry.create("hotel", "cust-1")

    assert registry.resolve("vaa_" + "x" * 43) is None
    assert registry.resolve("not-a-key") is None
    assert registry.resolve(key + "x" * 200) is None

    assert registry.set_disabled(principal.agent_id)
    assert registry.resolve(key) is None
    assert registry.list()[0].disabled
    assert registry.set_disabled(principal.agent_id, False)
    assert registry.resolve(key) is not None


def test_role_defaults_to_member_and_admin_persists(tmp_path: Path) -> None:
    registry = AgentRegistry(Store(tmp_path / "a.sqlite3"))
    member, member_key = registry.create("buyer", "cust-1")
    admin, admin_key = registry.create("ops", "cust-1", role="admin")

    assert member.role == "member" and not member.is_admin
    resolved = registry.resolve(admin_key)
    assert resolved is not None and resolved.role == "admin" and resolved.is_admin
    assert {r.agent_id: r.role for r in registry.list()} == {member.agent_id: "member", admin.agent_id: "admin"}
    with pytest.raises(ValueError):
        registry.create("x", "cust-1", role="owner")  # pyright: ignore[reportArgumentType]

    assert registry.set_role(member.agent_id, "admin")
    promoted = registry.resolve(member_key)
    assert promoted is not None and promoted.role == "admin"
    assert not registry.set_role("agt_nope", "admin")


def test_database_without_role_or_order_customer_columns_is_migrated(tmp_path: Path) -> None:
    db = tmp_path / "old.sqlite3"
    conn = sqlite3.connect(db)
    conn.executescript(
        """
        CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, customer TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE, mandate TEXT NOT NULL, created_at TEXT NOT NULL,
            disabled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE orders (id TEXT PRIMARY KEY, session_id TEXT, status TEXT NOT NULL, data TEXT NOT NULL,
            updated_at TEXT NOT NULL, agent_id TEXT);
        """
    )
    key = "vaa_" + "k" * 43
    conn.execute(
        "INSERT INTO agents VALUES ('agt_old', 'legacy', 'cust-1', ?, '{}', '2026-11-01T00:00:00+00:00', 0)",
        (hash_key(key),),
    )
    conn.execute(
        "INSERT INTO orders VALUES ('ord_old', NULL, 'placed', '{\"customer\": \"cust-1\"}', '2026-11-01', 'agt_old')"
    )
    conn.commit()
    conn.close()

    Store(db).close()
    with sqlite3.connect(db) as raw:  # a backfill interrupted before it ran is completed on the next open
        raw.execute("UPDATE orders SET customer = NULL")
    store = Store(db)
    resolved = AgentRegistry(store).resolve(key)
    assert resolved is not None and resolved.role == "member"
    with store.transaction() as c:
        assert c.execute("SELECT customer FROM orders WHERE id = 'ord_old'").fetchone() == ("cust-1",)
        with pytest.raises(sqlite3.IntegrityError):
            c.execute("UPDATE agents SET role = 'owner'")


def test_cli_creates_admin_key_and_sets_roles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("API_DB_PATH", str(tmp_path / "cli.sqlite3"))
    get_settings.cache_clear()
    try:
        assert cli.main(["create", "--name", "ops", "--customer", "cust-1", "--role", "admin"]) == 0
        created = json.loads(capsys.readouterr().out)
        assert created["role"] == "admin" and created["key"].startswith("vaa_")

        assert cli.main(["set-role", created["agent_id"], "member"]) == 0
        assert cli.main(["set-role", "agt_nope", "admin"]) == 1
        assert cli.main(["list"]) == 0
        listed = capsys.readouterr().out
        assert '"role": "member"' in listed and created["key"] not in listed
    finally:
        get_settings.cache_clear()
