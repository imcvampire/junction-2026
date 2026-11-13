import asyncio
from collections.abc import Callable

import httpx
import pytest

from api.valio.client import (
    ValioAuthError,
    ValioClient,
    ValioError,
    ValioNotConfiguredError,
    ValioRateLimitedError,
    ValioUnavailableError,
    ValioValidationError,
)
from tests.conftest import DELIVERY, FakeValio


def _client(handler: Callable[[httpx.Request], httpx.Response], key: str | None = "test-key") -> ValioClient:
    http = httpx.AsyncClient(base_url="http://valio.test", transport=httpx.MockTransport(handler))
    return ValioClient(http, api_key=key, customer="c1", cache_ttl_s=300)


def test_quote_merges_price_and_availability(fake_valio: FakeValio) -> None:
    fake_valio.stock["462775"] = 51
    fake_valio.terminal.add("462921")
    quotes = asyncio.run(_client(fake_valio.handler).quote(["462775", "462921", "999"], DELIVERY))

    milk = quotes["462775"]
    assert (milk.unit_price, milk.available_amount, milk.unlimited_stock) == (2.57, 51, False)
    assert milk.covers(51, DELIVERY) and not milk.covers(52, DELIVERY)
    assert quotes["462921"].unlimited_stock and quotes["462921"].covers(10_000, DELIVERY)
    assert not quotes["999"].orderable


def test_quote_is_one_batched_call_per_api_and_cached(fake_valio: FakeValio) -> None:
    client = _client(fake_valio.handler)

    async def run() -> None:
        await client.quote(["462921", "462775"], DELIVERY)
        await client.quote(["462775"], DELIVERY)

    asyncio.run(run())
    assert sorted(path for path, _ in fake_valio.calls) == ["/api/availability", "/api/price"]
    assert all(codes == ["462775", "462921"] for _, codes in fake_valio.calls)


def test_invalidate_forces_requote(fake_valio: FakeValio) -> None:
    client = _client(fake_valio.handler)

    async def run() -> None:
        await client.quote(["462775"], DELIVERY)
        client.invalidate(["462775"], DELIVERY)
        await client.quote(["462775"], DELIVERY)

    asyncio.run(run())
    assert len(fake_valio.calls) == 4


def test_rejects_more_than_upstream_batch_limit(fake_valio: FakeValio) -> None:
    with pytest.raises(ValioValidationError):
        asyncio.run(_client(fake_valio.handler).quote([str(i) for i in range(1001)], DELIVERY))


@pytest.mark.parametrize(
    ("status", "error"),
    [
        (401, ValioAuthError),
        (422, ValioValidationError),
        (429, ValioRateLimitedError),
        (503, ValioUnavailableError),
        (418, ValioError),
    ],
)
def test_maps_http_errors(fake_valio: FakeValio, status: int, error: type[ValioError]) -> None:
    fake_valio.status = status
    with pytest.raises(error):
        asyncio.run(_client(fake_valio.handler).quote(["462775"], DELIVERY))


def test_maps_timeouts_to_retryable_unavailable() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ValioUnavailableError) as exc:
        asyncio.run(_client(boom).quote(["462775"], DELIVERY))
    assert exc.value.retryable


def test_unconfigured_client_fails_fast() -> None:
    client = ValioClient(None, api_key=None, customer="c", cache_ttl_s=1)
    assert not client.configured
    with pytest.raises(ValioNotConfiguredError):
        asyncio.run(client.quote(["462775"], DELIVERY))
