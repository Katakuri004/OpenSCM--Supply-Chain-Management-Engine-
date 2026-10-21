from scm.sim.validate_network import load_validation, pooling_validation


def test_v5_empirical_protection_demand_pooling() -> None:
    config = load_validation()
    rows = pooling_validation(config)
    assert len(rows) == 4
    assert all(row["passed"] for row in rows)
    assert abs(rows[0]["observed_ratio"] - 0.5) < 0.03
    assert abs(rows[-1]["observed_ratio"] - 1) < 1e-10
