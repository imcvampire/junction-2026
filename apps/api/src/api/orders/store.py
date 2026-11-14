"""SQLite persistence for quotes, orders, the audit trail and idempotency keys.

Single process, small rows: one connection guarded by a lock. Queries are short, so they run
inline on the event loop rather than in a thread pool. Schema changes are additive only.
"""

import json
import sqlite3
import threading
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from api.orders.models import AuditEntry, Order, OrderStatus

_SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_order ON audit(order_id, seq);
CREATE TABLE IF NOT EXISTS idempotency (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (scope, key)
);
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    data TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    order_id TEXT
);
"""


class QuoteAlreadyUsedError(Exception):
    def __init__(self, order_id: str | None) -> None:
        super().__init__(order_id)
        self.order_id = order_id


class ReferenceTakenError(Exception):
    """The agent's client_reference was stored by a concurrent placement."""


class Store:
    def __init__(self, path: Path | str) -> None:
        if isinstance(path, Path):
            path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(_SCHEMA)
        self._migrate()
        self._lock = threading.RLock()

    def _migrate(self) -> None:
        """Additive column migrations, serialised across processes by BEGIN IMMEDIATE."""
        c = self._conn
        c.execute("BEGIN IMMEDIATE")
        try:
            for table in ("orders", "audit"):
                if "agent_id" not in _columns(c, table):
                    c.execute(f"ALTER TABLE {table} ADD COLUMN agent_id TEXT")
            if "customer" not in _columns(c, "orders"):
                c.execute("ALTER TABLE orders ADD COLUMN customer TEXT")
            c.execute("UPDATE orders SET customer = json_extract(data, '$.customer') WHERE customer IS NULL")
            c.execute("CREATE INDEX IF NOT EXISTS orders_agent ON orders(agent_id, updated_at)")
            c.execute("CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer, status, updated_at)")
        except BaseException:
            c.execute("ROLLBACK")
            raise
        c.execute("COMMIT")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            self._conn.execute("COMMIT")

    def save_order(self, order: Order, audit: list[AuditEntry]) -> None:
        with self.transaction() as c:
            self._write_order(c, order, audit)

    def place_from_quote(self, order: Order, audit: list[AuditEntry], quote_id: str, client_reference: str) -> None:
        """Consume the quote, store the order and its idempotency key in one transaction."""
        with self.transaction() as c:
            consumed = c.execute(
                "UPDATE quotes SET order_id = ? WHERE id = ? AND order_id IS NULL", (order.id, quote_id)
            ).rowcount
            if consumed != 1:
                row = c.execute("SELECT order_id FROM quotes WHERE id = ?", (quote_id,)).fetchone()
                raise QuoteAlreadyUsedError(row[0] if row else None)
            self._write_order(c, order, audit)
            try:
                c.execute(
                    "INSERT INTO idempotency(scope, key, response) VALUES (?, ?, ?)",
                    (_reference_scope(order.agent_id or ""), client_reference, order.id),
                )
            except sqlite3.IntegrityError as e:
                raise ReferenceTakenError(client_reference) from e

    @staticmethod
    def _write_order(c: sqlite3.Connection, order: Order, audit: list[AuditEntry]) -> None:
        c.execute(
            "INSERT INTO orders(id, session_id, agent_id, customer, status, data, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data, "
            "updated_at=excluded.updated_at",
            (
                order.id,
                order.session_id,
                order.agent_id,
                order.customer,
                order.status.value,
                order.model_dump_json(),
                order.updated_at.isoformat(),
            ),
        )
        c.executemany(
            "INSERT INTO audit(order_id, at, actor, action, summary, details, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (a.order_id, a.at.isoformat(), a.actor, a.action, a.summary, json.dumps(a.details), a.agent_id)
                for a in audit
            ],
        )

    def get_order(self, order_id: str) -> Order | None:
        with self._lock:
            row = self._conn.execute("SELECT data FROM orders WHERE id = ?", (order_id,)).fetchone()
        return Order.model_validate_json(row[0]) if row else None

    def list_agent_orders(self, agent_id: str, status: OrderStatus | None = None, limit: int = 50) -> list[Order]:
        sql = "SELECT data FROM orders WHERE agent_id = ?"
        params: list[Any] = [agent_id]
        if status is not None:
            sql += " AND status = ?"
            params.append(status.value)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [Order.model_validate_json(r[0]) for r in rows]

    def list_customer_orders(
        self, customer: str, status: OrderStatus | None = None, limit: int = 50, *, oldest_first: bool = False
    ) -> list[Order]:
        sql = "SELECT data FROM orders WHERE customer = ?"
        params: list[Any] = [customer]
        if status is not None:
            sql += " AND status = ?"
            params.append(status.value)
        sql += f" ORDER BY updated_at {'ASC' if oldest_first else 'DESC'} LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [Order.model_validate_json(r[0]) for r in rows]

    def order_for_reference(self, agent_id: str, client_reference: str) -> str | None:
        return self.idempotent_response(_reference_scope(agent_id), client_reference)

    def audit(self, order_id: str) -> list[AuditEntry]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT order_id, at, actor, action, summary, details, agent_id FROM audit "
                "WHERE order_id = ? ORDER BY seq",
                (order_id,),
            ).fetchall()
        return [
            AuditEntry(
                order_id=r[0], at=r[1], actor=r[2], action=r[3], summary=r[4], details=json.loads(r[5]), agent_id=r[6]
            )
            for r in rows
        ]

    def idempotent_response(self, scope: str, key: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT response FROM idempotency WHERE scope = ? AND key = ?", (scope, key)
            ).fetchone()
        return row[0] if row else None

    def remember_response(self, scope: str, key: str, response: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO idempotency(scope, key, response) VALUES (?, ?, ?)", (scope, key, response)
            )

    def save_quote(self, quote_id: str, agent_id: str, data: str, expires_at: datetime) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO quotes(id, agent_id, data, expires_at) VALUES (?, ?, ?, ?)",
                (quote_id, agent_id, data, expires_at.isoformat()),
            )

    def get_quote(self, quote_id: str) -> tuple[str, str, str | None] | None:
        """(agent_id, data, order_id) or None."""
        with self._lock:
            row = self._conn.execute("SELECT agent_id, data, order_id FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        return (row[0], row[1], row[2]) if row else None


def _columns(c: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in c.execute(f"PRAGMA table_info({table})")}


def _reference_scope(agent_id: str) -> str:
    return f"agent-order:{agent_id}"
