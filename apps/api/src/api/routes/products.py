import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from api.catalog.index import ALLERGEN_NAMES, Product
from api.services import Deps
from api.valio.client import ProductQuote

router = APIRouter(prefix="/products", tags=["products"])


class PackOut(BaseModel):
    width_mm: float
    length_mm: float
    height_mm: float
    gross_kg: float | None
    sales_units_per_pack: float
    estimated: bool


class ProductOut(BaseModel):
    id: str
    name: str
    brand: str | None
    category: str
    sales_unit: str
    allowed_lot_size: float
    content_per_sales_unit: str | None
    pack: PackOut | None
    allergens: list[str]
    tags: list[str]
    delivery_reliability: float | None
    co2_kg_per_sales_unit: float | None
    substitutes: list[str]

    @classmethod
    def of(cls, p: Product, language: str = "en") -> "ProductOut":
        c = p.content_per_sales_unit
        pack = p.pack
        return cls(
            id=p.id,
            name=p.name_in(language),
            brand=p.brand,
            category=p.category,
            sales_unit=p.sales_unit,
            allowed_lot_size=p.allowed_lot_size,
            content_per_sales_unit=f"{c.amount:g} {c.unit}" if c else None,
            pack=PackOut(
                width_mm=pack.width_mm,
                length_mm=pack.length_mm,
                height_mm=pack.height_mm,
                gross_kg=pack.gross_kg,
                sales_units_per_pack=pack.sales_units_per_pack,
                estimated=pack.estimated,
            )
            if pack
            else None,
            allergens=sorted(ALLERGEN_NAMES.get(a, a) for a in p.allergens),
            tags=sorted(p.tags),
            delivery_reliability=p.delivery_reliability,
            co2_kg_per_sales_unit=p.co2_kg_per_sales_unit,
            substitutes=list(p.substitutes),
        )


@router.get("")
def search_products(
    svc: Deps,
    q: Annotated[str, Query(max_length=200)] = "",
    category: Annotated[str | None, Query(max_length=16)] = None,
    tag: Annotated[list[str] | None, Query(max_length=10)] = None,
    lang: Annotated[str, Query(pattern="^(en|fi|sv)$")] = "en",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[ProductOut]:
    hits = svc.catalog.search(q, category=category, required_tags=tag or [], limit=limit)
    return [ProductOut.of(p, lang) for p in hits]


class QuoteRequest(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=100)
    date: dt.date


@router.post("/quote")
async def quote(svc: Deps, body: QuoteRequest) -> list[ProductQuote]:
    known = [c for c in body.codes if svc.catalog.get(c)]
    quotes = await svc.valio.quote(known, body.date)
    return [quotes[c] for c in known if c in quotes]
