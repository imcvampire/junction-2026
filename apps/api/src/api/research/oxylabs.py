"""Oxylabs Web API search: `POST /v1/search` with a Bearer key, answered synchronously.

Each result has `title`, `url` and `outline` (a list of snippet strings). Errors are `application/problem+json`
with the machine code in `title`; 429 is both the rate limit and an exhausted quota.
"""

import logging
from typing import Any, cast

import httpx

from api.research.models import ResearchBackendError, SearchHit

log = logging.getLogger(__name__)

_RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})


def _hit(raw: object) -> SearchHit | None:
    if not isinstance(raw, dict):
        return None
    r = cast(dict[str, Any], raw)
    url = r.get("url")
    if not isinstance(url, str) or not url:
        return None
    title = r.get("title")
    outline = r.get("outline")
    lines = [o for o in cast(list[Any], outline) if isinstance(o, str)] if isinstance(outline, list) else []
    return SearchHit(title=title if isinstance(title, str) else None, url=url, snippet=" ".join(lines) or None)


class OxylabsSearch:
    provider = "oxylabs"

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://webapi.oxylabs.io",
        location: str | None = None,
        max_results: int = 3,
        timeout_s: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._location = location
        self._max_results = max_results
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_s,
            transport=transport,
        )

    async def search(self, query: str) -> list[SearchHit]:
        body: dict[str, Any] = {"query": query, "max_results": self._max_results}
        if self._location:
            body["location"] = self._location
        try:
            response = await self._http.post("/v1/search", json=body)
        except httpx.TransportError as e:
            raise ResearchBackendError(type(e).__name__, retryable=True) from e
        status = response.status_code
        if status != 200:
            code = _problem_code(response)
            if status in (401, 403):
                log.error("oxylabs_rejected status=%s: check API_OXYLABS_API_KEY (a Web API key)", status)
            raise ResearchBackendError(
                f"oxylabs {status} {code}".strip(), retryable=status in _RETRYABLE_STATUS, upstream_status=status
            )
        try:
            data = response.json()
        except ValueError as e:
            raise ResearchBackendError("oxylabs invalid JSON", retryable=True, upstream_status=status) from e
        results = cast(dict[str, Any], data).get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            return []
        return [h for h in (_hit(r) for r in cast(list[Any], results)) if h is not None]

    async def aclose(self) -> None:
        await self._http.aclose()


def _problem_code(response: httpx.Response) -> str:
    """The problem+json `title` (e.g. TOO_MANY_REQUESTS); never `detail`, which can echo the request."""
    try:
        data = response.json()
    except ValueError:
        return ""
    title = cast(dict[str, Any], data).get("title") if isinstance(data, dict) else None
    return title if isinstance(title, str) and title.replace("_", "").isalnum() else ""
