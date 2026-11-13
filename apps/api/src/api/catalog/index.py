"""In-memory product catalog built from the static challenge data files.

The raw product JSON (~80 MB) is projected into slim `Product` records at startup; the raw
tree is dropped afterwards. Price and availability are never stored here — they are dynamic.
"""

import csv
import json
import logging
import math
import re
import time
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

log = logging.getLogger(__name__)

PRODUCTS_FILE = "valio_aimo_junction26_product_data.json"
RELIABILITY_FILE = "valio_aimo_junction26_delivery_reliability.csv"
CARBON_FILE = "valio_aimo_junction26_carbon_footprint.csv"

# GS1 allergen type codes used in synkkaData classifications.
ALLERGEN_NAMES: dict[str, str] = {
    "AC": "crustaceans",
    "AE": "eggs",
    "AF": "fish",
    "AM": "milk",
    "AN": "tree nuts",
    "AP": "peanuts",
    "AS": "sesame",
    "AU": "sulphites",
    "AW": "gluten cereals",
    "AY": "soy",
    "BC": "celery",
    "BM": "mustard",
    "NL": "lupin",
    "UM": "molluscs",
    "UW": "wheat",
    "SA": "almonds",
    "SH": "hazelnuts",
}

_CASE_UNITS = ("KI", "KRT", "CS", "KRS")
_TOKEN = re.compile(r"[\wåäö]+", re.IGNORECASE)
_NAME_CONTENT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(l|dl|cl|ml|kg|g)\b", re.IGNORECASE)
_TO_BASE = {
    "l": (1.0, "L"),
    "dl": (0.1, "L"),
    "cl": (0.01, "L"),
    "ml": (0.001, "L"),
    "kg": (1.0, "kg"),
    "g": (0.001, "kg"),
}


@dataclass(frozen=True, slots=True)
class Pack:
    """A physical box the order is delivered in, at true size."""

    width_mm: float
    length_mm: float
    height_mm: float
    gross_kg: float | None
    sales_units_per_pack: float
    estimated: bool
    source: str

    @property
    def volume_m3(self) -> float:
        return self.width_mm * self.length_mm * self.height_mm / 1e9


@dataclass(frozen=True, slots=True)
class Content:
    amount: float
    unit: str  # "L" or "kg"


@dataclass(frozen=True, slots=True)
class Product:
    id: str
    names: dict[str, str]
    brand: str | None
    vendor: str | None
    category: str
    sales_unit: str
    base_unit: str
    allowed_lot_size: float
    base_units_per_sales_unit: float | None
    content_per_sales_unit: Content | None
    pack: Pack | None
    allergens: frozenset[str]
    tags: frozenset[str]
    temperature_condition: int | None
    country_of_origin: str | None
    delivery_reliability: float | None
    co2_kg_per_kg: float | None
    substitutes: tuple[str, ...]
    search_text: str = field(repr=False)

    @property
    def name(self) -> str:
        return self.names.get("en") or self.names.get("fi") or next(iter(self.names.values()), self.id)

    def name_in(self, language: str) -> str:
        return self.names.get(language) or self.name

    @property
    def co2_kg_per_sales_unit(self) -> float | None:
        c = self.content_per_sales_unit
        if self.co2_kg_per_kg is None or c is None:
            return None
        # Litres are treated as kilograms; good enough for a group-average footprint figure.
        return round(self.co2_kg_per_kg * c.amount, 3)

    def has_tags(self, required: Iterable[str]) -> bool:
        return all(self._has_tag(t) for t in required)

    def _has_tag(self, tag: str) -> bool:
        t = tag.strip()
        if t.lower().startswith("no:"):
            return t.split(":", 1)[1].strip().upper() not in self.allergens
        if t.lower().startswith("brand:"):
            return (self.brand or "").lower() == t.split(":", 1)[1].strip().lower()
        return t.upper() in self.tags


def _obj(value: Any) -> dict[str, Any]:
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _objs(value: Any) -> list[dict[str, Any]]:
    return (
        [cast(dict[str, Any], v) for v in cast(list[Any], value) if isinstance(v, dict)]
        if isinstance(value, list)
        else []
    )


def _lang_values(items: list[dict[str, Any]] | None) -> dict[str, str]:
    return {i["language"]: i["value"] for i in items or [] if i.get("value")}


def _to_mm(dim: dict[str, Any] | None) -> float | None:
    if not dim or dim.get("value") is None:
        return None
    v = float(dim["value"])
    return {"MMT": v, "CMT": v * 10, "MTR": v * 1000}.get(dim.get("unit", "MMT"))


def _to_kg(w: dict[str, Any] | None) -> float | None:
    if not w or w.get("value") is None:
        return None
    v = float(w["value"])
    return {"KGM": v, "GRM": v / 1000}.get(w.get("unit", ""))


def _dims(conv: dict[str, Any]) -> tuple[float, float, float] | None:
    w, length, h = _to_mm(conv.get("width")), _to_mm(conv.get("length")), _to_mm(conv.get("height"))
    if not (w and length and h):
        return None
    return w, length, h


def _base_content(raw: dict[str, Any], base_conv: dict[str, Any] | None, name_en: str) -> Content | None:
    if base_conv:
        vol = _obj(base_conv.get("volume"))
        if vol.get("unit") == "LTR" and vol.get("value"):
            return Content(float(vol["value"]), "L")
        net = _to_kg(base_conv.get("netWeight"))
        if net:
            return Content(net, "kg")
    if raw["baseUnit"] == "KG":
        return Content(1.0, "kg")
    m = _NAME_CONTENT.search(name_en)
    if m:
        factor, unit = _TO_BASE[m.group(2).lower()]
        return Content(round(float(m.group(1).replace(",", ".")) * factor, 4), unit)
    return None


def _pack(
    raw: dict[str, Any],
    convs: dict[str, dict[str, Any]],
    units: dict[str, float],
    per_sales: float | None,
    base_content: Content | None,
) -> Pack | None:
    sales_unit, base_unit = raw["salesUnit"], raw["baseUnit"]
    base_conv, case_conv = convs.get("BASE_UNIT_OR_EACH"), convs.get("CASE")
    sales_is_base = sales_unit == base_unit or per_sales == 1.0

    if sales_is_base and base_conv and (d := _dims(base_conv)):
        return Pack(*d, _to_kg(base_conv.get("grossWeight")), 1.0, False, "base_unit")

    if case_conv and (d := _dims(case_conv)):
        case_size = next((units[u] for u in _CASE_UNITS if u in units), None)
        per_pack = 1.0
        if case_size and per_sales:
            per_pack = max(case_size / per_sales, 1.0)
        return Pack(*d, _to_kg(case_conv.get("grossWeight")), per_pack, False, "case")

    if base_conv and (d := _dims(base_conv)) and per_sales:
        # Sales unit groups several base units but the case itself is unmeasured: lay the base units
        # out in a near-square grid. Labelled as an estimate.
        n = max(round(per_sales), 1)
        cols = math.ceil(math.sqrt(n))
        rows = math.ceil(n / cols)
        gross = _to_kg(base_conv.get("grossWeight"))
        return Pack(d[0] * cols, d[1] * rows, d[2], gross * n if gross else None, 1.0, True, "base_unit_grid")

    if base_content and per_sales:
        # Last resort: a cube holding the product content at density ~1 kg/L.
        litres = base_content.amount * per_sales
        side = round((litres / 1000) ** (1 / 3) * 1000, 1)
        if side > 0:
            return Pack(side, side, side, litres, 1.0, True, "content_cube")
    return None


def _classification_ids(sd: dict[str, Any], name: str, unit: str | None = None) -> list[str]:
    out: list[str] = []
    for c in _objs(sd.get("classifications")):
        if c.get("name") != name:
            continue
        for v in _objs(c.get("values")):
            if v.get("id") and (unit is None or v.get("unit") == unit):
                out.append(v["id"])
    return out


def project_product(raw: dict[str, Any], reliability: dict[str, float], carbon: dict[str, float]) -> Product:
    sd = _obj(raw.get("synkkaData"))
    names = _lang_values(sd.get("names"))
    name_en = names.get("en") or names.get("fi") or ""
    convs = {str(c.get("synkkaPackagingType", "")): c for c in _objs(sd.get("unitConversions"))}
    units = {str(u["unitId"]): float(u["sizeInBaseUnits"]) for u in _objs(raw.get("units")) if u.get("sizeInBaseUnits")}

    per_sales: float | None = 1.0 if raw["salesUnit"] == raw["baseUnit"] else units.get(raw["salesUnit"])
    base_content = _base_content(raw, convs.get("BASE_UNIT_OR_EACH"), name_en)
    content = None
    if base_content and base_content.amount > 0 and per_sales:
        content = Content(round(base_content.amount * per_sales, 4), base_content.unit)

    allergens = frozenset(_classification_ids(sd, "allergen", "CONTAINS"))
    tags = {f"FREE_FROM:{a}" for a in _classification_ids(sd, "nonAllergen", "FREE_FROM")}
    tags.update(_classification_ids(sd, "nutritionalClaim"))
    tags.update(i.upper() for i in _classification_ids(sd, "packagingMarkedLabel"))
    if "FREE_FROM_LACTOSE" in tags:
        tags.add("LACTOSE_FREE")

    brand = str(sd.get("brand") or "").strip() or None
    search_text = " ".join([*names.values(), brand or "", raw.get("vendorName") or "", raw["id"]]).lower()

    return Product(
        id=raw["id"],
        names=names,
        brand=brand,
        vendor=raw.get("vendorName"),
        category=raw.get("category", ""),
        sales_unit=raw["salesUnit"],
        base_unit=raw["baseUnit"],
        allowed_lot_size=float(raw.get("allowedLotSize") or 1.0),
        base_units_per_sales_unit=per_sales,
        content_per_sales_unit=content,
        pack=_pack(raw, convs, units, per_sales, base_content),
        allergens=allergens,
        tags=frozenset(tags),
        temperature_condition=raw.get("temperatureCondition"),
        country_of_origin=raw.get("countryOfOrigin"),
        delivery_reliability=reliability.get(raw["id"]),
        co2_kg_per_kg=carbon.get(raw["id"]),
        substitutes=tuple(
            str(s["substituteProduct"]) for s in _objs(raw.get("substitutions")) if s.get("substituteProduct")
        ),
        search_text=search_text,
    )


def _read_csv_floats(path: Path, column: str) -> dict[str, float]:
    if not path.exists():
        log.warning("catalog_side_file_missing path=%s", path)
        return {}
    out: dict[str, float] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                out[row["productId"]] = float(row[column])
            except (KeyError, TypeError, ValueError):
                continue
    return out


class Catalog:
    def __init__(self, products: Iterable[Product]) -> None:
        self._by_id: dict[str, Product] = {p.id: p for p in products}
        self._tags = frozenset(t for p in self._by_id.values() for t in p.tags)

    def is_known_tag(self, tag: str) -> bool:
        """Whether a requirement tag can be checked against product data (`brand:X`, `no:AM`, or a catalog tag)."""
        prefix, _, value = tag.strip().partition(":")
        if prefix.lower() in ("brand", "no"):
            return bool(value.strip())
        return tag.strip().upper() in self._tags

    def __len__(self) -> int:
        return len(self._by_id)

    def get(self, product_id: str) -> Product | None:
        return self._by_id.get(product_id)

    def search(
        self,
        query: str,
        *,
        category: str | None = None,
        required_tags: Iterable[str] = (),
        exclude_allergens: Iterable[str] = (),
        limit: int = 10,
    ) -> list[Product]:
        tokens = [t.lower() for t in _TOKEN.findall(query)]
        tags = [t for t in required_tags if t]
        banned = {a.upper() for a in exclude_allergens}
        scored: list[tuple[float, Product]] = []
        for p in self._by_id.values():
            if category and p.category != category:
                continue
            if tags and not p.has_tags(tags):
                continue
            if banned & p.allergens:
                continue
            if tokens:
                hits = sum(1 for t in tokens if t in p.search_text)
                if hits < len(tokens):
                    continue
                primary = p.name.lower()
                score = sum(2.0 for t in tokens if t in primary)
            else:
                score = 0.0
            if p.pack and not p.pack.estimated:
                score += 0.5
            if p.delivery_reliability is not None:
                score += p.delivery_reliability
            score -= len(p.name) / 200
            scored.append((score, p))
        scored.sort(key=lambda sp: (-sp[0], sp[1].id))
        return [p for _, p in scored[: max(1, min(limit, 50))]]


def load_catalog(data_dir: Path) -> Catalog:
    started = time.monotonic()
    reliability = _read_csv_floats(data_dir / RELIABILITY_FILE, "deliveryReliability")
    carbon = _read_csv_floats(data_dir / CARBON_FILE, "AVG kg CO2-eq/kg")
    with (data_dir / PRODUCTS_FILE).open(encoding="utf-8") as f:
        raw: list[dict[str, Any]] = json.load(f)
    products = [project_product(r, reliability, carbon) for r in raw if not r.get("deleted")]
    del raw
    catalog = Catalog(products)
    log.info(
        "catalog_loaded products=%d with_pack=%d estimated_pack=%d in %.2fs",
        len(catalog),
        sum(1 for p in products if p.pack),
        sum(1 for p in products if p.pack and p.pack.estimated),
        time.monotonic() - started,
    )
    return catalog
