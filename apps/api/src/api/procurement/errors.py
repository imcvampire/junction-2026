"""One error contract for both transports: HTTP status plus `{code, message, details}`."""

import logging
from typing import Any

from pydantic import ValidationError

from api.orders.service import OrderError
from api.valio.client import (
    ValioAuthError,
    ValioError,
    ValioNotConfiguredError,
    ValioRateLimitedError,
    ValioValidationError,
)

log = logging.getLogger(__name__)


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "message": message, "details": details or {}}


def describe_valio_error(e: ValioError) -> tuple[int, dict[str, Any]]:
    if isinstance(e, ValioNotConfiguredError):
        return 503, error_body("upstream_not_configured", "Price and availability service is not configured")
    if isinstance(e, ValioRateLimitedError):
        return 429, error_body("upstream_rate_limited", "Price and availability service is busy; retry shortly")
    if isinstance(e, ValioValidationError):
        return 422, error_body("upstream_rejected", str(e))
    if isinstance(e, ValioAuthError):
        log.error("valio_auth_failed: check API_VALIO_API_KEY")
        return 502, error_body("upstream_error", "Price and availability service rejected the server's credentials")
    code = "upstream_unavailable" if e.retryable else "upstream_error"
    return 502, error_body(code, "Price and availability service failed; retry shortly" if e.retryable else str(e))


def describe_error(e: Exception) -> tuple[int, dict[str, Any]] | None:
    """Status and body for an expected error, or None for a bug."""
    if isinstance(e, OrderError):
        return e.status, e.body()
    if isinstance(e, ValioError):
        return describe_valio_error(e)
    if isinstance(e, ValidationError):
        errors = [
            {"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]}
            for err in e.errors(include_url=False, include_input=False)
        ]
        return 422, error_body("invalid_arguments", "Arguments failed validation", {"errors": errors})
    return None
