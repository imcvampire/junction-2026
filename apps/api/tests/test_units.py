from dataclasses import replace

import pytest

from api.catalog.index import Catalog, Content, Product
from api.procurement.units import ConversionError, is_valid_quantity, to_sales_units


def _product(catalog: Catalog, product_id: str) -> Product:
    p = catalog.get(product_id)
    assert p is not None
    return p


def test_litres_round_up_to_lot_size(catalog: Catalog) -> None:
    carton = replace(_product(catalog, "462775"), allowed_lot_size=6.0)

    c = to_sales_units(carton, 1000, "L")

    assert c.quantity == 1002
    assert "rounded up to a multiple of 6" in c.derivation


def test_cases_of_ten_litres(catalog: Catalog) -> None:
    c = to_sales_units(_product(catalog, "464119"), 1000, "L")

    assert c.quantity == 100
    assert c.derivation.startswith("1000 L / 10 L per KI = 100")


def test_counted_units_are_whole_even_with_fractional_lot(catalog: Catalog) -> None:
    assert to_sales_units(_product(catalog, "464119"), 1005, "L").quantity == 101
    assert to_sales_units(_product(catalog, "462775"), 500, "ml").quantity == 1


def test_measured_sales_units_keep_fractions(catalog: Catalog) -> None:
    assert to_sales_units(_product(catalog, "460025"), 2.5, "kg").quantity == 2.5
    assert to_sales_units(_product(catalog, "460025"), 2500, "g").quantity == 2.5


def test_refuses_unit_mismatch_and_unknown_content(catalog: Catalog) -> None:
    with pytest.raises(ConversionError, match="measured in L"):
        to_sales_units(_product(catalog, "462775"), 10, "kg")
    with pytest.raises(ConversionError, match="content per"):
        to_sales_units(_product(catalog, "460077"), 1, "kg")


def test_zero_content_is_a_conversion_error_not_a_crash(catalog: Catalog) -> None:
    broken = replace(_product(catalog, "462775"), content_per_sales_unit=Content(0.0, "L"))
    with pytest.raises(ConversionError, match="content per"):
        to_sales_units(broken, 10, "L")


def test_order_step_is_whole_for_counted_units_and_lot_for_measured(catalog: Catalog) -> None:
    assert is_valid_quantity(_product(catalog, "464119"), 12)
    assert not is_valid_quantity(_product(catalog, "464119"), 12.37)
    assert is_valid_quantity(_product(catalog, "460025"), 12.37)
