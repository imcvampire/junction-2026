"""Physical footprint of an order: packs stacked on EUR pallets at true scale (metres)."""

import math
from dataclasses import dataclass, field

from pydantic import BaseModel

from api.catalog.index import Catalog, Pack
from api.orders.models import Order

PALLET_W_MM = 1200.0
PALLET_D_MM = 800.0
PALLET_H_MM = 144.0
PALLET_GAP_MM = 150.0
PALLETS_PER_ROW = 4
# Beyond this the GLB gets heavy and a phone AR view stops being useful.
MAX_RENDER_PALLETS = 48


@dataclass(frozen=True, slots=True)
class Box:
    """Axis-aligned box in metres; (x, z) is the floor-plane min corner, y is up."""

    x: float
    y: float
    z: float
    w: float
    h: float
    d: float
    group: int  # -1 for pallet wood, else index into lines


class FootprintLine(BaseModel):
    product_id: str
    name: str
    quantity: float
    sales_unit: str
    packs: int
    pallets: int
    pack_mm: tuple[float, float, float] | None
    estimated: bool
    note: str | None = None


class Footprint(BaseModel):
    width_m: float
    depth_m: float
    height_m: float
    volume_m3: float
    weight_kg: float | None
    pallets: int
    lines: list[FootprintLine]
    has_estimates: bool
    renderable: bool
    spoken_summary: str


@dataclass
class Layout:
    footprint: Footprint
    boxes: list[Box] = field(default_factory=list[Box])


def _per_layer(pack: Pack) -> tuple[int, int, float, float]:
    """Best of the two orientations: (cols, rows, pack_w, pack_d) on the pallet deck."""
    best = (0, 0, pack.width_mm, pack.length_mm)
    for w, d in ((pack.width_mm, pack.length_mm), (pack.length_mm, pack.width_mm)):
        cols, rows = int(PALLET_W_MM // w), int(PALLET_D_MM // d)
        if cols * rows > best[0] * best[1]:
            best = (cols, rows, w, d)
    return best


def compute_layout(order: Order, catalog: Catalog, max_stack_m: float) -> Layout:
    max_load_mm = max(max_stack_m * 1000 - PALLET_H_MM, 100.0)
    lines: list[FootprintLine] = []
    boxes: list[Box] = []
    slot = 0
    volume = 0.0
    weight = 0.0
    weight_known = True

    sized = [p.pack for li in order.lines if (p := catalog.get(li.product_id)) and p.pack]
    # Oversize packs stand on the floor in a pallet slot, so slots grow to fit the largest one.
    pitch_x = (max([PALLET_W_MM, *(pk.width_mm for pk in sized)]) + PALLET_GAP_MM) / 1000
    pitch_z = (max([PALLET_D_MM, *(pk.length_mm for pk in sized)]) + PALLET_GAP_MM) / 1000

    def slot_origin(i: int) -> tuple[float, float]:
        col, row = i % PALLETS_PER_ROW, i // PALLETS_PER_ROW
        return col * pitch_x, row * pitch_z

    for group, line in enumerate(order.lines):
        product = catalog.get(line.product_id)
        pack = product.pack if product else None
        if pack is None:
            lines.append(
                FootprintLine(
                    product_id=line.product_id,
                    name=line.name,
                    quantity=line.quantity,
                    sales_unit=line.sales_unit,
                    packs=0,
                    pallets=0,
                    pack_mm=None,
                    estimated=True,
                    note="No size data for this product, so it is left out of the AR view",
                )
            )
            continue

        packs = math.ceil(line.quantity / pack.sales_units_per_pack - 1e-9)
        volume += packs * pack.volume_m3
        if pack.gross_kg is None:
            weight_known = False
        else:
            weight += packs * pack.gross_kg

        cols, rows, pw, pd = _per_layer(pack)
        layers = int(max_load_mm // pack.height_mm)
        oversize = cols == 0 or rows == 0 or layers == 0
        per_pallet = 1 if oversize else cols * rows * layers
        pallets = math.ceil(packs / per_pallet)

        remaining = packs
        if slot + pallets > MAX_RENDER_PALLETS:
            slot += pallets
            remaining = 0
        for _ in range(pallets if remaining else 0):
            ox, oz = slot_origin(slot)
            slot += 1
            on_this = min(remaining, per_pallet)
            remaining -= on_this
            if oversize:
                boxes.append(Box(ox, 0, oz, pack.width_mm / 1000, pack.height_mm / 1000, pack.length_mm / 1000, group))
                continue
            boxes.append(Box(ox, 0, oz, PALLET_W_MM / 1000, PALLET_H_MM / 1000, PALLET_D_MM / 1000, -1))
            per_layer = cols * rows
            full_layers, partial = divmod(on_this, per_layer)
            base_y = PALLET_H_MM / 1000
            if full_layers:
                boxes.append(
                    Box(ox, base_y, oz, cols * pw / 1000, full_layers * pack.height_mm / 1000, rows * pd / 1000, group)
                )
            if partial:
                y = base_y + full_layers * pack.height_mm / 1000
                full_rows, rest = divmod(partial, cols)
                if full_rows:
                    boxes.append(Box(ox, y, oz, cols * pw / 1000, pack.height_mm / 1000, full_rows * pd / 1000, group))
                if rest:
                    boxes.append(
                        Box(
                            ox,
                            y,
                            oz + full_rows * pd / 1000,
                            rest * pw / 1000,
                            pack.height_mm / 1000,
                            pd / 1000,
                            group,
                        )
                    )

        lines.append(
            FootprintLine(
                product_id=line.product_id,
                name=line.name,
                quantity=line.quantity,
                sales_unit=line.sales_unit,
                packs=packs,
                pallets=pallets,
                pack_mm=(pack.width_mm, pack.length_mm, pack.height_mm),
                estimated=pack.estimated,
                note="Size estimated from product content" if pack.estimated else None,
            )
        )

    too_large = slot > MAX_RENDER_PALLETS
    if too_large:
        boxes = []
    width = max((b.x + b.w for b in boxes), default=0.0)
    depth = max((b.z + b.d for b in boxes), default=0.0)
    height = max((b.y + b.h for b in boxes), default=0.0)
    footprint = Footprint(
        width_m=round(width, 3),
        depth_m=round(depth, 3),
        height_m=round(height, 3),
        volume_m3=round(volume, 3),
        weight_kg=round(weight, 1) if weight_known and boxes else None,
        pallets=slot,
        lines=lines,
        has_estimates=any(li.estimated and li.packs for li in lines),
        renderable=bool(boxes),
        spoken_summary=f"That is about {slot} pallets, too large to preview in AR."
        if too_large
        else _speak(slot, width, depth, height, lines),
    )
    return Layout(footprint, boxes)


def _speak(pallets: int, width: float, depth: float, height: float, lines: list[FootprintLine]) -> str:
    if not pallets:
        return "I don't have size data for these products, so I can't show them in AR."
    noun = "pallet" if pallets == 1 else "pallets"
    text = (
        f"That is about {pallets} {noun}, taking roughly {width:.1f} by {depth:.1f} metres of floor "
        f"and up to {height:.1f} metres high."
    )
    missing = [li.name for li in lines if li.packs == 0]
    if missing:
        text += f" I couldn't size {', '.join(missing)}."
    elif any(li.estimated for li in lines):
        text += " Some sizes are estimates."
    return text
