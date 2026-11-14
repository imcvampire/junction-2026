import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, cast
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from api.catalog.index import Catalog, load_catalog
from api.config import Settings
from api.main import create_app
from api.services import Services

FIXTURE_DATA = Path(__file__).parent / "fixtures" / "data"
DELIVERY = datetime.now(ZoneInfo("Europe/Helsinki")).date() + timedelta(days=3)


@dataclass
class FakeValio:
    """Stand-in for the Valio Aimo price/availability API, driven by mutable tables."""

    prices: dict[str, float] = field(
        default_factory=lambda: {"462775": 2.57, "462921": 10.97, "464119": 15.4, "464073": 1.89, "460025": 3.2}
    )
    stock: dict[str, float] = field(default_factory=dict[str, float])
    terminal: set[str] = field(default_factory=set[str])
    status: int = 200
    calls: list[tuple[str, list[str]]] = field(default_factory=list[tuple[str, list[str]]])

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": "nope"})
        if request.headers.get("X-API-Key") != "test-key":
            return httpx.Response(401, json={"detail": "bad key"})
        body = json.loads(request.content)
        codes: list[str] = body["products"]
        self.calls.append((request.url.path, codes))
        if request.url.path == "/api/price":
            return httpx.Response(200, json=self._price(codes))
        if request.url.path == "/api/availability":
            return httpx.Response(200, json=self._availability(codes, body["requestedDate"]))
        return httpx.Response(404)

    def _price(self, codes: list[str]) -> dict[str, Any]:
        products: list[dict[str, Any]] = []
        for c in codes:
            p = self.prices.get(c)
            money = (
                {"value": p, "valueWithTax": round(p * 1.135, 2), "validFrom": "x", "validTo": "y", "currency": "EUR"}
                if p is not None
                else None
            )
            products.append(
                {
                    "productId": c,
                    "quantity": 1.0,
                    "catalogPrice": money,
                    "comparisonPrice": money,
                    "comparisonUnit": "L",
                    "netPriceFound": False,
                    "error": p is None,
                }
            )
        return {"customerId": "x", "currency": "EUR", "pricingDate": "2026-11-16", "products": products}

    def _availability(self, codes: list[str], requested: str) -> dict[str, Any]:
        products: list[dict[str, Any]] = []
        for c in codes:
            amount = 999999.0 if c in self.terminal else self.stock.get(c, 5000.0)
            lines = (
                [{"salesBlock": False, "availableAmount": amount, "availableDate": requested, "salesUnit": "ST"}]
                if c in self.prices
                else []
            )
            products.append({"productId": c, "salesBlock": False, "closingTime": None, "scheduleLines": lines})
        return {"timeNow": "now", "requestedDate": requested, "products": products}


@pytest.fixture(scope="session")
def catalog() -> Catalog:
    return load_catalog(FIXTURE_DATA)


@pytest.fixture
def fake_valio() -> FakeValio:
    return FakeValio()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=FIXTURE_DATA,
        db_path=tmp_path / "test.sqlite3",
        valio_base_url="http://valio.test",
        valio_api_key=SecretStr("test-key"),
        approval_spend_threshold_eur=500.0,
        quote_cache_ttl_s=300.0,
        mcp_allowed_hosts=["testserver", "127.0.0.1:*"],
    )


@pytest.fixture
def client(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> Iterator[TestClient]:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    with TestClient(app) as c:
        yield c


def services_of(client: TestClient) -> Services:
    return cast(Services, cast(FastAPI, client.app).state.services)
