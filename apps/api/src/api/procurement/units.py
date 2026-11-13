"""Convert a buyer's amount (litres, kilograms) into the product's sales units.

Agents are bad at this arithmetic, so the server does it and shows its working.
"""

import math
from dataclasses import dataclass

from api.catalog.index import Product

BUYER_UNITS: dict[str, tuple[float, str]] = {
    "L": (1.0, "L"),
    "dl": (0.1, "L"),
    "cl": (0.01, "L"),
    "ml": (0.001, "L"),
    "kg": (1.0, "kg"),
    "g": (0.001, "kg"),
}
# Sales units that are a measure rather than a count, so fractional quantities make sense.
_MEASURED_SALES_UNITS = frozenset({"KG", "L", "LTR"})


class ConversionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Conversion:
    quantity: float
    derivation: str


def order_step(product: Product) -> float:
    """Smallest valid order increment, in sales units. Quote conversion and order checks share it."""
    lot = product.allowed_lot_size
    if lot >= 1 or product.sales_unit in _MEASURED_SALES_UNITS:
        return lot
    # Counted units (pieces, cases) are ordered whole, as long as a whole unit is a valid lot multiple.
    per_unit = 1 / lot
    return 1.0 if math.isclose(per_unit, round(per_unit), abs_tol=1e-9) else lot


def round_up_to_step(product: Product, quantity: float) -> float:
    step = order_step(product)
    return round(math.ceil(round(quantity / step, 9)) * step, 6)


def is_valid_quantity(product: Product, quantity: float) -> bool:
    steps = quantity / order_step(product)
    return math.isclose(steps, round(steps), abs_tol=1e-6)


def to_sales_units(product: Product, value: float, unit: str) -> Conversion:
    if unit not in BUYER_UNITS:
        raise ConversionError(f"Unsupported unit {unit}; use one of {', '.join(BUYER_UNITS)}")
    if value <= 0:
        raise ConversionError("Amount must be positive")
    content = product.content_per_sales_unit
    if content is None or content.amount <= 0:
        raise ConversionError(
            f"{product.name}: content per {product.sales_unit} is unknown; quote a quantity in sales units"
        )
    factor, measure = BUYER_UNITS[unit]
    if measure != content.unit:
        raise ConversionError(
            f"{product.name} is measured in {content.unit} per {product.sales_unit}; cannot convert {unit}"
        )
    raw = value * factor / content.amount
    step = order_step(product)
    quantity = round_up_to_step(product, raw)
    derivation = (
        f"{value:g} {unit} / {content.amount:g} {content.unit} per {product.sales_unit} = {raw:.4g} "
        f"-> {quantity:g} {product.sales_unit}"
    )
    if quantity != round(raw, 6):
        derivation += f" (rounded up to a multiple of {step:g})"
    return Conversion(quantity, derivation)
