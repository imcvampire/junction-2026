import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from api.procurement.schemas import OrderView, QuoteOption

REFERENCES = Path(__file__).parents[3] / "skills/valio-aimo-purchasing/references"


def _load(name: str) -> Any:
    return json.loads((REFERENCES / name).read_text(encoding="utf-8"))


def _errors(schema: dict[str, Any], doc: dict[str, Any]) -> list[str]:
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    return [e.message for e in validator.iter_errors(doc)]  # pyright: ignore[reportUnknownMemberType]


@pytest.fixture(scope="module")
def schema() -> dict[str, Any]:
    return _load("journal.schema.json")


@pytest.fixture(scope="module")
def example() -> dict[str, Any]:
    return _load("journal-example.json")


def test_schema_is_valid_2020_12(schema: dict[str, Any]) -> None:
    Draft202012Validator.check_schema(schema)


def test_example_validates(schema: dict[str, Any], example: dict[str, Any]) -> None:
    assert _errors(schema, example) == []


def test_top_level_rejects_unknown_sections(schema: dict[str, Any], example: dict[str, Any]) -> None:
    assert _errors(schema, {**example, "file_path": "valio-aimo-journal/x.json"})
    assert _errors(schema, {**example, "schema": "something-else"})


def test_timeline_is_numbered_and_refs_resolve(example: dict[str, Any]) -> None:
    order_ids = {o["order_id"] for o in example["orders"]}
    quote_ids = {q["quote_id"] for q in example["quotes"]}
    timeline = example["timeline"]

    assert [t["seq"] for t in timeline] == list(range(1, len(timeline) + 1))
    for t in timeline:
        refs: dict[str, Any] = t.get("refs") or {}
        if refs.get("order_id"):
            assert refs["order_id"] in order_ids
        if refs.get("quote_id"):
            assert refs["quote_id"] in quote_ids


def test_example_covers_the_reference_request(example: dict[str, Any]) -> None:
    (quote,) = example["quotes"]
    (order,) = example["orders"]
    chosen = [o for o in quote["options"] if o["chosen"]]
    types = {t["type"] for t in example["timeline"]}

    assert len(quote["options"]) >= 2
    assert [o["product_id"] for o in chosen] == [c["product_id"] for c in example["decision"]["chosen"]]
    assert order["approval_reasons"]
    assert order["decision"]["decision"] == "approved"
    assert {"authority", "search", "quote", "order", "approval"} <= types


def test_schema_holds_no_file_fields(schema: dict[str, Any]) -> None:
    def property_names(node: Any) -> set[str]:
        if isinstance(node, list):
            return set[str]().union(*(property_names(v) for v in node))  # pyright: ignore[reportUnknownVariableType]
        if not isinstance(node, dict):
            return set()
        own = set[str](node.get("properties", {}))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
        return own.union(*(property_names(v) for v in node.values()))  # pyright: ignore[reportUnknownVariableType, reportUnknownMemberType]

    assert not {k for k in property_names(schema) if "file" in k or "path" in k}


def test_order_and_option_fields_use_server_names(schema: dict[str, Any]) -> None:
    defs = schema["$defs"]

    assert set(defs["order"]["properties"]) <= set(OrderView.model_fields)
    assert set(defs["option"]["properties"]) - {"chosen"} <= set(QuoteOption.model_fields)


RESEARCH_ENTRY: dict[str, Any] = {
    "research_id": "5b0e7f4c-3f8a-4d7e-9a51-2c1d6f0b9e21",
    "product_id": "464073",
    "candidate_ids": ["469363", "464768"],
    "purpose": "coffee",
    "outcome": "ok",
    "summary": "469363 foams most like the original.",
    "sources": [{"title": "arla.fi", "url": "https://www.arla.fi/"}],
    "queries": ["lactose free milk barista foam"],
    "cached": False,
    "searched_at": "2026-11-13T09:14:05Z",
    "used_for": "Ranked 469363 first for coffee.",
}


def test_journal_without_research_still_validates(schema: dict[str, Any], example: dict[str, Any]) -> None:
    assert "research" not in example
    assert _errors(schema, example) == []


def test_research_entries_validate(schema: dict[str, Any], example: dict[str, Any]) -> None:
    failed = {"research_id": None, "product_id": "464073", "candidate_ids": ["469363"], "purpose": "coffee"}
    doc = {**example, "research": [RESEARCH_ENTRY, {**failed, "outcome": "not_configured"}]}
    assert _errors(schema, doc) == []


@pytest.mark.parametrize(
    "entry",
    [
        {**RESEARCH_ENTRY, "outcome": "maybe"},
        {**RESEARCH_ENTRY, "price": 2.48},
        {k: v for k, v in RESEARCH_ENTRY.items() if k != "purpose"},
    ],
)
def test_bad_research_entries_fail(schema: dict[str, Any], example: dict[str, Any], entry: dict[str, Any]) -> None:
    assert _errors(schema, {**example, "research": [entry]})


def test_journal_doc_research_example_validates(schema: dict[str, Any], example: dict[str, Any]) -> None:
    doc = (REFERENCES / "journal.md").read_text(encoding="utf-8")
    snippet = doc.split("A research entry for the substitute choice", 1)[1].split("```json", 1)[1].split("```", 1)[0]
    assert _errors(schema, {**example, "research": [json.loads(snippet)]}) == []
