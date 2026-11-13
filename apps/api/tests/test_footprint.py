import json
import struct
from datetime import date

import pytest

from api.catalog.index import Catalog
from api.orders.footprint import compute_layout
from api.orders.gltf import build_glb
from api.orders.models import Order, OrderLine, OrderStatus, utcnow


def _order(*lines: tuple[str, float]) -> Order:
    now = utcnow()
    return Order(
        id="ord_fp",
        session_id=None,
        status=OrderStatus.AGREED,
        customer="c",
        delivery_date=date(2026, 11, 16),
        currency="EUR",
        lines=[
            OrderLine(
                product_id=pid,
                name=pid,
                quantity=qty,
                sales_unit="KI",
                unit_price=1,
                line_total=qty,
                available_amount=None,
                available_date=None,
                covers_request=True,
            )
            for pid, qty in lines
        ],
        total=1,
        preferences=[],
        quoted_at=now,
        created_at=now,
        updated_at=now,
    )


def test_cases_stack_onto_eur_pallets(catalog: Catalog) -> None:
    # 342 x 432 x 280 mm cases: 3 x 1 per layer one way, 2 x 2 = 4 the other way; 5 layers under 1.6 m.
    layout = compute_layout(_order(("462921", 50)), catalog, max_stack_m=1.6)
    fp = layout.footprint
    line = fp.lines[0]
    assert (line.packs, line.pallets) == (50, 3)
    assert fp.pallets == 3
    assert fp.height_m == pytest.approx(0.144 + 5 * 0.28)
    assert fp.width_m == pytest.approx(3 * 1.2 + 2 * 0.15)
    assert fp.depth_m == pytest.approx(0.8)
    assert fp.volume_m3 == pytest.approx(50 * 0.342 * 0.432 * 0.28, rel=1e-3)
    assert fp.weight_kg == pytest.approx(50 * 5.3015, rel=1e-3)
    assert "3 pallets" in fp.spoken_summary


def test_boxes_stay_within_pallet_and_height_limit(catalog: Catalog) -> None:
    layout = compute_layout(_order(("462775", 1000), ("464119", 7)), catalog, max_stack_m=1.6)
    assert layout.footprint.height_m <= 1.6
    for b in layout.boxes:
        assert b.w <= 1.2 + 1e-9 and b.d <= 0.8 + 1e-9
    assert {b.group for b in layout.boxes} == {-1, 0, 1}


def test_unsized_line_is_reported_not_rendered(catalog: Catalog) -> None:
    layout = compute_layout(_order(("460077", 3)), catalog, max_stack_m=1.6)
    fp = layout.footprint
    assert not fp.renderable
    assert fp.lines[0].note and "No size data" in fp.lines[0].note
    assert "can't show" in fp.spoken_summary


def test_estimated_sizes_are_flagged(catalog: Catalog) -> None:
    fp = compute_layout(_order(("460004", 10)), catalog, max_stack_m=1.6).footprint
    assert fp.has_estimates and "estimates" in fp.spoken_summary


def test_glb_is_valid_and_true_scale(catalog: Catalog) -> None:
    layout = compute_layout(_order(("462921", 50)), catalog, max_stack_m=1.6)
    glb = build_glb(layout.boxes, ["milk"])

    magic, version, length = struct.unpack_from("<III", glb, 0)
    assert (magic, version, length) == (0x46546C67, 2, len(glb))
    json_len, json_type = struct.unpack_from("<II", glb, 12)
    assert json_type == 0x4E4F534A
    doc = json.loads(glb[20 : 20 + json_len])
    bin_len, bin_type = struct.unpack_from("<II", glb, 20 + json_len)
    assert bin_type == 0x004E4942 and bin_len == doc["buffers"][0]["byteLength"]

    positions = [doc["accessors"][p["attributes"]["POSITION"]] for p in doc["meshes"][0]["primitives"]]
    xs = [v for a in positions for v in (a["min"][0], a["max"][0])]
    ys = [v for a in positions for v in (a["min"][1], a["max"][1])]
    assert max(xs) - min(xs) == pytest.approx(layout.footprint.width_m, abs=1e-4)
    assert min(ys) == 0 and max(ys) == pytest.approx(layout.footprint.height_m, abs=1e-4)
    assert max(xs) == pytest.approx(-min(xs), abs=1e-4)


def test_empty_glb_is_still_a_valid_scene() -> None:
    glb = build_glb([], [])
    doc = json.loads(glb[20 : 20 + struct.unpack_from("<I", glb, 12)[0]])
    assert doc["asset"]["version"] == "2.0" and "meshes" not in doc


def test_huge_orders_are_summarised_not_rendered(catalog: Catalog) -> None:
    layout = compute_layout(_order(("462921", 5000)), catalog, max_stack_m=1.6)
    assert layout.boxes == []
    assert not layout.footprint.renderable
    assert layout.footprint.pallets == 250
    assert "too large" in layout.footprint.spoken_summary
