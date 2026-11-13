"""SQLite persistence for orders, audit trail, idempotency keys and conversation sessions.

Single process, small rows: one connection guarded by a lock. Queries are short, so they run
inline on the event loop rather than in a thread pool.
"""

import json
import sqlite3
import threading
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from api.orders.models import AuditEntry, Order

_SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_session ON orders(session_id);
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
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: Path | str) -> None:
        if isinstance(path, Path):
            path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(_SCHEMA)
        self._lock = threading.RLock()

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
            c.execute(
                "INSERT INTO orders(id, session_id, status, data, updated_at) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data, "
                "updated_at=excluded.updated_at",
                (order.id, order.session_id, order.status.value, order.model_dump_json(), order.updated_at.isoformat()),
            )
            c.executemany(
                "INSERT INTO audit(order_id, at, actor, action, summary, details) VALUES (?, ?, ?, ?, ?, ?)",
                [(a.order_id, a.at.isoformat(), a.actor, a.action, a.summary, json.dumps(a.details)) for a in audit],
            )

    def get_order(self, order_id: str) -> Order | None:
        with self._lock:
            row = self._conn.execute("SELECT data FROM orders WHERE id = ?", (order_id,)).fetchone()
        return Order.model_validate_json(row[0]) if row else None

    def list_orders(self, session_id: str, limit: int = 50) -> list[Order]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT data FROM orders WHERE session_id = ? ORDER BY updated_at DESC LIMIT ?", (session_id, limit)
            ).fetchall()
        return [Order.model_validate_json(r[0]) for r in rows]

    def audit(self, order_id: str) -> list[AuditEntry]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT order_id, at, actor, action, summary, details FROM audit WHERE order_id = ? ORDER BY seq",
                (order_id,),
            ).fetchall()
        return [
            AuditEntry(order_id=r[0], at=r[1], actor=r[2], action=r[3], summary=r[4], details=json.loads(r[5]))
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

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT data FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def put_session(self, session_id: str, data: dict[str, Any], updated_at: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO sessions(id, data, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (session_id, json.dumps(data), updated_at),
            )
