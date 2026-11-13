"""Public static catalog search. No prices: those are customer-specific and need an agent key."""

from typing import Annotated

from fastapi import APIRouter, Query

from api.procurement.schemas import ProductView
from api.services import Deps

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
def search_products(
    svc: Deps,
    q: Annotated[str, Query(max_length=200)] = "",
    category: Annotated[str | None, Query(max_length=16)] = None,
    tag: Annotated[list[str] | None, Query(max_length=10)] = None,
    lang: Annotated[str, Query(pattern="^(en|fi|sv)$")] = "en",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[ProductView]:
    hits = svc.catalog.search(q, category=category, required_tags=tag or [], limit=limit)
    return [ProductView.of(p, lang) for p in hits]
