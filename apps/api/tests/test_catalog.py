from api.catalog.index import Catalog


def test_case_sold_product_uses_case_dimensions(catalog: Catalog) -> None:
    p = catalog.get("462921")
    assert p is not None
    assert p.sales_unit == "KI"
    assert p.content_per_sales_unit is not None
    assert (p.content_per_sales_unit.amount, p.content_per_sales_unit.unit) == (5.0, "L")
    assert p.pack is not None
    assert (p.pack.width_mm, p.pack.length_mm, p.pack.height_mm) == (342.0, 432.0, 280.0)
    assert not p.pack.estimated


def test_each_sold_product_uses_base_unit_dimensions(catalog: Catalog) -> None:
    p = catalog.get("462775")
    assert p is not None and p.pack is not None
    assert (p.pack.width_mm, p.pack.length_mm, p.pack.height_mm) == (70.0, 72.0, 214.0)
    assert p.pack.gross_kg == 1.055


def test_missing_dimensions_fall_back_to_labelled_estimate_or_none(catalog: Catalog) -> None:
    cube = catalog.get("460004")
    assert cube is not None and cube.pack is not None and cube.pack.estimated
    unsized = catalog.get("460077")
    assert unsized is not None and unsized.pack is None


def test_join_with_reliability_and_carbon_files(catalog: Catalog) -> None:
    p = catalog.get("462921")
    assert p is not None
    assert p.delivery_reliability == 1.0
    assert p.co2_kg_per_kg is not None
    assert p.co2_kg_per_sales_unit == round(p.co2_kg_per_kg * 5.0, 3)


def test_search_requires_every_token_across_languages(catalog: Catalog) -> None:
    en = {p.id for p in catalog.search("lactose free milk")}
    fi = {p.id for p in catalog.search("laktoositon maito")}
    assert {"462775", "464119", "464073"} <= en
    assert "460000" not in en
    assert en & fi


def test_search_filters_by_tags_and_allergens(catalog: Catalog) -> None:
    tagged = catalog.search("milk", required_tags=["LACTOSE_FREE"])
    assert tagged and all("LACTOSE_FREE" in p.tags for p in tagged)
    assert all("AM" not in p.allergens for p in catalog.search("", exclude_allergens=["AM"], limit=50))
    assert [p.id for p in catalog.search("", required_tags=["brand:Arla"], limit=50)] == ["462775"]


def test_substitutes_are_exposed(catalog: Catalog) -> None:
    p = catalog.get("460025")
    assert p is not None
    assert p.substitutes == ("460150",)
