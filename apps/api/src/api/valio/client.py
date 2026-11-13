"""Typed async client for the Valio Aimo challenge price/availability APIs."""

import asyncio
import logging
import time
from datetime import date
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

log = logging.getLogger(__name__)

MAX_CODES_PER_CALL = 1000


class ValioError(Exception):
    """Base error for upstream failures; `retryable` hints whether a later retry can succeed."""

    retryable = False


class ValioNotConfiguredError(ValioError):
    pass


class ValioAuthError(ValioError):
    pass


class ValioValidationError(ValioError):
    pass


class ValioRateLimitedError(ValioError):
    retryable = True


class ValioUnavailableError(ValioError):
    retryable = True


class _Upstream(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class Money(_Upstream):
    value: float
    value_with_tax: float | None = Field(default=None, alias="valueWithTax")
    currency: str | None = None


class ProductPrice(_Upstream):
    product_id: str = Field(alias="productId")
    catalog_price: Money | None = Field(default=None, alias="catalogPrice")
    comparison_price: Money | None = Field(default=None, alias="comparisonPrice")
    comparison_unit: str | None = Field(default=None, alias="comparisonUnit")
    list_price: Money | None = Field(default=None, alias="listPrice")
    error: bool = False


class PriceResponse(_Upstream):
    currency: str
    products: list[ProductPrice]


class ScheduleLine(_Upstream):
    sales_block: bool = Field(alias="salesBlock")
    available_amount: float = Field(alias="availableAmount")
    available_date: date | None = Field(default=None, alias="availableDate")
    sales_unit: str = Field(alias="salesUnit")


class ProductAvailability(_Upstream):
    product_id: str = Field(alias="productId")
    closing_time: str | None = Field(default=None, alias="closingTime")
    sales_block: bool = Field(alias="salesBlock")
    logistic_model: str | None = Field(default=None, alias="logisticModel")
    schedule_lines: list[ScheduleLine] = Field(alias="scheduleLines")


class AvailabilityResponse(_Upstream):
    products: list[ProductAvailability]


class ProductQuote(BaseModel):
    """Price and availability for one product on one requested delivery date."""

    product_id: str
    requested_date: date
    currency: str = "EUR"
    unit_price: float | None
    unit_price_with_tax: float | None
    comparison_price: float | None
    comparison_unit: str | None
    sales_unit: str | None
    available_amount: float | None
    available_date: date | None
    unlimited_stock: bool
    sales_block: bool
    closing_time: str | None
    orderable: bool

    def covers(self, quantity: float, by: date) -> bool:
        if not self.orderable or self.available_date is None or self.available_date > by:
            return False
        return self.unlimited_stock or (self.available_amount or 0) >= quantity


_TERMINAL_UNLIMITED = 999999.0


def merge_quote(
    product_id: str,
    requested: date,
    currency: str,
    price: ProductPrice | None,
    avail: ProductAvailability | None,
) -> ProductQuote:
    line = avail.schedule_lines[0] if avail and avail.schedule_lines else None
    unit_price = None if price is None or price.error or price.catalog_price is None else price.catalog_price.value
    sales_block = bool(avail and avail.sales_block) or bool(line and line.sales_block)
    return ProductQuote(
        product_id=product_id,
        requested_date=requested,
        currency=currency,
        unit_price=unit_price,
        unit_price_with_tax=price.catalog_price.value_with_tax if price and price.catalog_price else None,
        comparison_price=price.comparison_price.value if price and price.comparison_price else None,
        comparison_unit=price.comparison_unit if price else None,
        sales_unit=line.sales_unit if line else None,
        available_amount=line.available_amount if line else None,
        available_date=line.available_date if line else None,
        unlimited_stock=bool(line and line.available_amount >= _TERMINAL_UNLIMITED),
        sales_block=sales_block,
        closing_time=avail.closing_time if avail else None,
        orderable=unit_price is not None and line is not None and line.available_amount > 0 and not sales_block,
    )


class ValioClient:
    def __init__(
        self,
        http: httpx.AsyncClient | None,
        *,
        api_key: str | None,
        cache_ttl_s: float,
    ) -> None:
        self._http = http
        self._api_key = api_key
        self._ttl = cache_ttl_s
        self._cache: dict[tuple[str, str, date], tuple[float, ProductQuote]] = {}
        self._lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return self._http is not None and bool(self._api_key)

    async def ping(self) -> bool:
        await self._request("GET", "/api/ping")
        return True

    async def quote(self, codes: list[str], requested: date, *, customer: str) -> dict[str, ProductQuote]:
        """Price + availability for `codes`, served from a short TTL cache where possible.

        Prices and availability are customer-specific, so the cache is keyed per (customer, product, date).
        """
        unique = sorted(set(codes))
        if not unique:
            return {}
        if len(unique) > MAX_CODES_PER_CALL:
            raise ValioValidationError(f"at most {MAX_CODES_PER_CALL} products per quote")

        now = time.monotonic()
        result: dict[str, ProductQuote] = {}
        async with self._lock:
            for code in unique:
                hit = self._cache.get((customer, code, requested))
                if hit and now - hit[0] < self._ttl:
                    result[code] = hit[1]
        missing = [c for c in unique if c not in result]
        if not missing:
            return result

        body = {"customer": customer, "requestedDate": requested.isoformat(), "products": missing}
        price_raw, avail_raw = await asyncio.gather(
            self._request("POST", "/api/price", json=body),
            self._request("POST", "/api/availability", json=body),
        )
        try:
            prices = PriceResponse.model_validate(price_raw)
            avails = AvailabilityResponse.model_validate(avail_raw)
        except ValidationError as e:
            log.error("valio_unexpected_response error=%s", e)
            raise ValioUnavailableError("unexpected upstream response") from e
        price_by_id = {p.product_id: p for p in prices.products}
        avail_by_id = {a.product_id: a for a in avails.products}

        fetched_at = time.monotonic()
        async with self._lock:
            for code in missing:
                q = merge_quote(code, requested, prices.currency, price_by_id.get(code), avail_by_id.get(code))
                self._cache[(customer, code, requested)] = (fetched_at, q)
                result[code] = q
        log.info("valio_quote", extra={"requested": len(unique), "fetched": len(missing)})
        return result

    def invalidate(self, codes: list[str], requested: date, *, customer: str) -> None:
        for code in codes:
            self._cache.pop((customer, code, requested), None)

    async def _request(self, method: str, path: str, json: dict[str, Any] | None = None) -> Any:
        if self._http is None or not self._api_key:
            raise ValioNotConfiguredError("Valio API base URL or key not configured")
        started = time.monotonic()
        try:
            res = await self._http.request(method, path, json=json, headers={"X-API-Key": self._api_key})
        except httpx.TimeoutException as e:
            raise ValioUnavailableError(f"upstream timeout on {path}") from e
        except httpx.TransportError as e:
            raise ValioUnavailableError(f"upstream transport error on {path}: {e}") from e
        elapsed_ms = round((time.monotonic() - started) * 1000)
        log.info("valio_call %s %s -> %s in %sms", method, path, res.status_code, elapsed_ms)

        if res.status_code in (401, 403):
            raise ValioAuthError(f"upstream rejected credentials ({res.status_code})")
        if res.status_code >= 400:
            log.warning("valio_error_body status=%s body=%s", res.status_code, res.text[:300])
        if res.status_code == 422:
            raise ValioValidationError("upstream rejected the request")
        if res.status_code == 429:
            raise ValioRateLimitedError("upstream rate limit")
        if res.status_code >= 500:
            raise ValioUnavailableError(f"upstream {res.status_code}")
        if res.status_code >= 400:
            raise ValioError(f"upstream {res.status_code}")
        try:
            return res.json()
        except ValueError as e:
            raise ValioUnavailableError(f"non-JSON upstream response on {path}") from e
