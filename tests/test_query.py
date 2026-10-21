import operator
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from hypothesis import given
from hypothesis import strategies as st
from scm.contracts import Query

from api.app.query import filter_nodes, parse_filter


def test_rule_parser_units_and_node_vocabulary() -> None:
    assert parse_filter("warehouses with days of cover < 7") == Query(
        node_type="dc", metric="days_of_cover", operator="lt", value=7
    )
    assert parse_filter("retailers with fill rate < 95%").value == 0.95
    with pytest.raises(ValueError):
        parse_filter("suppliers with on hand < 12%")


@given(st.text(max_size=200))
def test_arbitrary_query_phrases_only_produce_typed_filters(text: str) -> None:
    try:
        query = parse_filter(text)
    except ValueError:
        return
    assert Query.model_validate(query.model_dump()) == query


@pytest.fixture(scope="module")
def node_table(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("query") / "nodes.parquet"
    data: dict[str, list[str | float | int | None]] = {
        "node_id": ["R01", "DC1", "S1"],
        "node_type": ["retailer", "dc", "supplier"],
        "day": [2, 2, 2],
    }
    for name in ("on_hand", "on_order", "backorders", "days_of_cover"):
        data[name] = [0.0, 7.0, None]
    data["fill_rate"] = [0.0, 0.7, None]
    pq.write_table(pa.table(data), path)
    return path


@given(
    metric=st.sampled_from(["on_hand", "on_order", "backorders", "days_of_cover", "fill_rate"]),
    operation=st.sampled_from(["lt", "le", "eq", "ge", "gt"]),
    kind=st.sampled_from([None, "retailer", "dc", "supplier"]),
    threshold=st.floats(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False),
)
def test_duckdb_filters_match_python_and_exclude_nulls(
    node_table: Path, metric: str, operation: str, kind: str | None, threshold: float
) -> None:
    value = threshold / 1000 if metric == "fill_rate" else threshold
    query = Query.model_validate(
        dict(metric=metric, operator=operation, node_type=kind, value=value)
    )
    result = filter_nodes(node_table, "synthetic_query", 2, query)
    compare = {
        "lt": operator.lt,
        "le": operator.le,
        "eq": operator.eq,
        "ge": operator.ge,
        "gt": operator.gt,
    }[operation]
    expected = sorted(
        [
            node
            for node, node_kind, amount in [
                ("R01", "retailer", 0.0),
                ("DC1", "dc", 0.7 if metric == "fill_rate" else 7.0),
            ]
            if (kind is None or kind == node_kind) and compare(amount, value)
        ]
    )
    assert result.node_ids == expected
