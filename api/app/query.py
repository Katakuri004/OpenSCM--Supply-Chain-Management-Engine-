"""A bounded vocabulary compiles to typed filters, never user-provided SQL."""

import re
from pathlib import Path

import duckdb
from scm.contracts import Query, QueryResults

NODES = {
    "nodes": None,
    "warehouses": "dc",
    "dcs": "dc",
    "retailers": "retailer",
    "suppliers": "supplier",
    "buyers": "b2b",
}
METRICS = {
    "days of cover": "days_of_cover",
    "fill rate": "fill_rate",
    "on hand": "on_hand",
    "on order": "on_order",
    "backorders": "backorders",
}
OPERATORS = {"<": "lt", "<=": "le", "=": "eq", ">=": "ge", ">": "gt"}
SQL_OPERATORS = {v: k for k, v in OPERATORS.items()}


def parse_filter(text: str) -> Query:
    if len(text) > 200:
        raise ValueError("query phrase is too long")
    pattern = (
        r"(nodes|warehouses|dcs|retailers|suppliers|buyers) with "
        r"(days of cover|fill rate|on hand|on order|backorders) "
        r"(<=|>=|<|>|=) ([0-9]+(?:\.[0-9]+)?)(%)?"
    )
    match = re.fullmatch(pattern, text.strip().lower())
    if match is None:
        raise ValueError("use '<node group> with <metric> <operator> <number>'")
    node, metric, operator, value, percent = match.groups()
    if percent and metric != "fill rate":
        raise ValueError("percentages apply only to fill rate")
    return Query.model_validate(
        {
            "node_type": NODES[node],
            "metric": METRICS[metric],
            "operator": OPERATORS[operator],
            "value": float(value) / (100 if percent else 1),
        }
    )


def filter_nodes(path: Path, run_id: str, day: int, query: Query) -> QueryResults:
    metric, operator = query.metric, SQL_OPERATORS[query.operator]
    if metric not in METRICS.values():
        raise ValueError("unknown metric")
    sql = (
        f"SELECT node_id,node_type,{metric} FROM read_parquet(?) "
        f"WHERE day=? AND {metric} {operator} ?"
    )
    parameters: list[object] = [str(path), day, query.value]
    if query.node_type is not None:
        sql += " AND node_type=?"
        parameters.append(query.node_type)
    with duckdb.connect() as connection:
        rows = connection.execute(sql + " ORDER BY node_id", parameters).fetchall()
    return QueryResults.model_validate(
        dict(
            run_id=run_id,
            day=day,
            filter=query.model_dump(),
            node_ids=[r[0] for r in rows],
            node_types=[r[1] for r in rows],
            values=[r[2] for r in rows],
        )
    )
