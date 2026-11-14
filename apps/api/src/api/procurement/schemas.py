"""Request and response models shared by the REST and MCP transports, so both describe one contract."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, BeforeValidator, Field, model_validator

from api.catalog.index import ALLERGEN_NAMES, Product
from api.orders.models import AuditEntry, Cancellation, Order, OrderDecision, OrderLine, OrderStatus

MAX_QUOTE_ITEMS = 1000
MAX_SEARCH_RESULTS = 20
MAX_LINE_QUANTITY = 100_000

Language = Literal["en", "fi", "sv"]
ProductId = Annotated[str, Field(min_length=1, max_length=32)]
RequirementTag = Annotated[str, Field(min_length=1, max_length=64)]


def _normalise_unit(v: object) -> object:
    if isinstance(v, str):
        u = v.strip()
        lowered = u.lower()
        if lowered in ("l", "litre", "litres", "liter", "liters"):
            return "L"
        return lowered
    return v


BuyerUnit = Annotated[Literal["L", "dl", "cl", "ml", "kg", "g"], BeforeValidator(_normalise_unit)]


def _blank_to_none(v: object) -> object:
    if isinstance(v, str):
        return v.strip() or None
    return v


Purpose = Annotated[
    Annotated[str, Field(max_length=200)] | None,
    BeforeValidator(_blank_to_none),
    Field(description="What the buyer will use the product for, e.g. 'coffee', 'baking'; guides substitute choice"),
]


OrderScope = Literal["mine", "company"]


class Principal(BaseModel):
    agent_id: str
    name: str
    customer: str
    spend_limit_eur: float = Field(description="An order above this total (excl. VAT) needs human approval")
    required_tags: list[str] = Field(description="Every order line must meet these, or placement is refused")
    banned_allergens: list[str] = Field(description="GS1 allergen codes no line may contain; placement is refused")
    quote_ttl_s: float
    max_products_per_quote: int = MAX_QUOTE_ITEMS


class SearchRequest(BaseModel):
    query: str = Field(default="", max_length=200, description="Words in en/fi/sv, e.g. 'milk 1 l'")
    required_tags: list[RequirementTag] = Field(
        default_factory=list[str],
        max_length=10,
        description="Every hit must have these: catalog tags (LACTOSE_FREE, FREE_FROM_GLUTEN, VEGAN), "
        "brand:<Brand>, or no:<allergen code>",
    )
    exclude_allergens: list[str] = Field(
        default_factory=list[str], max_length=10, description="GS1 allergen codes, e.g. AM (milk), AW (gluten)"
    )
    category: str | None = Field(default=None, max_length=16)
    language: Language = "en"
    limit: int = Field(default=10, ge=1, le=MAX_SEARCH_RESULTS)


class PackView(BaseModel):
    width_mm: float
    length_mm: float
    height_mm: float
    gross_kg: float | None
    sales_units_per_pack: float
    estimated: bool


class ProductView(BaseModel):
    id: str
    name: str
    brand: str | None
    vendor: str | None
    category: str
    sales_unit: str = Field(description="Unit prices and quantities are expressed in (technical code, e.g. ST, KI)")
    allowed_lot_size: float = Field(description="Order quantities must be a multiple of this")
    content_per_sales_unit: str | None = Field(description="What one sales unit holds, e.g. '10 L'")
    pack: PackView | None
    allergens: dict[str, str] = Field(description="GS1 allergen code -> name")
    tags: list[str]
    country_of_origin: str | None
    delivery_reliability: float | None = Field(description="Historical on-time ratio 0-1, if known")
    co2_kg_per_sales_unit: float | None
    substitutes: list[str]

    @classmethod
    def of(cls, p: Product, language: str = "en") -> Self:
        c = p.content_per_sales_unit
        pack = p.pack
        return cls(
            id=p.id,
            name=p.name_in(language),
            brand=p.brand,
            vendor=p.vendor,
            category=p.category,
            sales_unit=p.sales_unit,
            allowed_lot_size=p.allowed_lot_size,
            content_per_sales_unit=f"{c.amount:g} {c.unit}" if c else None,
            pack=PackView(
                width_mm=pack.width_mm,
                length_mm=pack.length_mm,
                height_mm=pack.height_mm,
                gross_kg=pack.gross_kg,
                sales_units_per_pack=pack.sales_units_per_pack,
                estimated=pack.estimated,
            )
            if pack
            else None,
            allergens={a: ALLERGEN_NAMES.get(a, a) for a in sorted(p.allergens)},
            tags=sorted(p.tags),
            country_of_origin=p.country_of_origin,
            delivery_reliability=p.delivery_reliability,
            co2_kg_per_sales_unit=p.co2_kg_per_sales_unit,
            substitutes=list(p.substitutes),
        )


class SearchResult(BaseModel):
    products: list[ProductView]
    count: int


class Amount(BaseModel):
    value: float = Field(gt=0, le=1_000_000)
    unit: BuyerUnit


class QuoteItem(BaseModel):
    product_id: ProductId
    quantity: float | None = Field(default=None, gt=0, le=MAX_LINE_QUANTITY, description="Quantity in sales units")
    amount: Amount | None = Field(
        default=None, description="Buyer's amount (e.g. 1000 L); the server converts it into sales units"
    )

    @model_validator(mode="after")
    def _one_measure(self) -> Self:
        if self.quantity is not None and self.amount is not None:
            raise ValueError("give either quantity or amount, not both")
        return self


class QuoteRequest(BaseModel):
    items: list[QuoteItem] = Field(min_length=1, max_length=MAX_QUOTE_ITEMS)
    delivery_date: date
    requirements: list[RequirementTag] = Field(
        default_factory=list[str],
        max_length=20,
        description="Buyer's requirements as tags (LACTOSE_FREE, brand:Valio, no:AM); frozen on the quote",
    )
    request_text: str = Field(default="", max_length=2000, description="The buyer's request, for the audit trail")
    purpose: Purpose = None


class QuoteOption(BaseModel):
    rank: int
    product_id: str
    name: str
    brand: str | None
    sales_unit: str
    content_per_sales_unit: str | None
    allowed_lot_size: float
    requested: str | None = Field(description="What was asked for, e.g. '1000 L' or '12 KI'")
    quantity: float | None = Field(description="Quantity in sales units to order")
    conversion: str | None = Field(description="How the buyer's amount became the sales-unit quantity")
    conversion_error: str | None = None
    unit_price: float | None = Field(description="Fixed catalog price per sales unit, excl. VAT")
    unit_price_with_tax: float | None
    currency: str
    line_total: float | None
    available_amount: float | None
    unlimited_stock: bool
    earliest_available_date: date | None
    order_cutoff: str | None
    orderable: bool
    covers_request: bool | None = Field(description="Quantity is available by the delivery date")
    meets_requirements: bool
    missing_requirements: list[str]
    breaks_mandate: bool = Field(
        default=False, description="A missing tag is part of the company mandate; placing this line is refused"
    )
    delivery_reliability: float | None
    co2_kg_per_sales_unit: float | None
    co2_kg_total: float | None
    cheapest_covering_option: bool = False


class QuoteView(BaseModel):
    quote_id: str
    agent_id: str
    created_at: datetime
    expires_at: datetime
    delivery_date: date
    currency: str
    request_text: str
    purpose: str | None = Field(default=None, description="What the buyer will use the product for; frozen")
    requirements: list[str] = Field(description="Requests plus mandate tags, checked on every line")
    ignored_requirements: list[str] = Field(description="Tags the catalog cannot check; not enforced")
    options: list[QuoteOption]
    unknown_products: list[str]
    order_id: str | None = Field(default=None, description="Set once an order was placed from this quote")


class PlaceOrderLine(BaseModel):
    product_id: ProductId
    quantity: float = Field(gt=0, le=MAX_LINE_QUANTITY, description="Quantity in sales units")
    substitute_for: ProductId | None = Field(
        default=None, description="Product the buyer originally asked for, if this line is a substitute"
    )


class PlaceOrderRequest(BaseModel):
    quote_id: str = Field(min_length=1, max_length=40)
    lines: list[PlaceOrderLine] = Field(min_length=1, max_length=MAX_QUOTE_ITEMS)
    reason: str = Field(min_length=1, max_length=1000, description="Why these options were chosen")
    client_reference: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
        description="Unique per order; retrying with the same value returns the same order",
    )


class OrderView(BaseModel):
    order_id: str
    status: OrderStatus
    agent_id: str | None = Field(description="The agent that placed the order")
    quote_id: str | None
    client_reference: str | None
    delivery_date: date
    currency: str
    total: float
    lines: list[OrderLine]
    requirements: list[str]
    purpose: str | None = Field(description="What the buyer will use the product for, from the quote")
    approval_reasons: list[str] = Field(
        description="Why a human must approve (the spend limit); empty when placed autonomously"
    )
    decision: OrderDecision | None
    cancellation: Cancellation | None = Field(
        default=None, description="Who cancelled the order, why, how it was confirmed, and its replacement"
    )
    shipped_at: datetime | None = Field(default=None, description="When it shipped; it can no longer be cancelled")
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, o: Order) -> Self:
        return cls(
            order_id=o.id,
            status=o.status,
            agent_id=o.agent_id,
            quote_id=o.quote_id,
            client_reference=o.client_reference,
            delivery_date=o.delivery_date,
            currency=o.currency,
            total=o.total,
            lines=o.lines,
            requirements=o.preferences,
            purpose=o.purpose,
            approval_reasons=o.approval_reasons,
            decision=o.decision,
            cancellation=o.cancellation,
            shipped_at=o.shipped_at,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )


class OrderList(BaseModel):
    orders: list[OrderView]


class AuditView(BaseModel):
    order_id: str
    entries: list[AuditEntry]
    text: str
