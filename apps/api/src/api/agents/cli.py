"""Manage agent credentials: `python -m api.agents.cli create|list|disable|enable`.

Writes to the same SQLite database as the API (`API_DB_PATH`). The key is printed once on create.
"""

import argparse
import json
import sys

from api.agents.models import Mandate
from api.agents.registry import AgentRegistry
from api.config import get_settings
from api.orders.store import Store


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agent", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    create = sub.add_parser("create", help="Register an agent and print its key once")
    create.add_argument("--name", required=True)
    create.add_argument("--customer", help="Upstream customer id (default: API_VALIO_CUSTOMER)")
    create.add_argument("--spend-limit", type=float, help="Per-order EUR limit (default: global threshold)")
    create.add_argument("--require", action="append", default=[], metavar="TAG", help="e.g. LACTOSE_FREE, brand:Valio")
    create.add_argument("--ban", action="append", default=[], metavar="ALLERGEN", help="GS1 allergen code, e.g. AM")
    sub.add_parser("list", help="List agents (never shows keys)")
    for verb in ("disable", "enable"):
        sub.add_parser(verb).add_argument("agent_id")
    args = parser.parse_args(argv)

    cfg = get_settings()
    store = Store(cfg.db_path)
    registry = AgentRegistry(store)
    try:
        if args.cmd == "create":
            mandate = Mandate(spend_limit_eur=args.spend_limit, required_tags=args.require, banned_allergens=args.ban)
            principal, key = registry.create(args.name, args.customer or cfg.valio_customer, mandate)
            print(json.dumps({**principal.model_dump(mode="json"), "key": key}, indent=2))
            print("Store this key now; it cannot be shown again.", file=sys.stderr)
        elif args.cmd == "list":
            for r in registry.list():
                print(json.dumps(r.model_dump(mode="json")))
        elif not registry.set_disabled(args.agent_id, args.cmd == "disable"):
            print(f"unknown agent {args.agent_id}", file=sys.stderr)
            return 1
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
