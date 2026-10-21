import numpy as np
import pytest
from scm.config.planning import ForecastSettings, load_planning
from scm.demand.classify import classify
from scm.forecast.error_metrics import error_metrics
from scm.forecast.methods import Forecaster


@pytest.mark.parametrize(
    "method,expected",
    [
        ("moving_average", [10, 12, 13, 15]),
        ("ses", [10, 11, 12.5, 14.25]),
        ("holt", [10, 11.5, 13.875, 16.59375]),
    ],
)
def test_one_step_forecasts(method: str, expected: list[float]) -> None:
    settings = ForecastSettings.model_validate(
        {"method": method, "window": 2, "alpha": 0.5, "beta": 0.5}
    )
    model = Forecaster(np.array([10.0]), np.array([4.0]), settings)
    predictions = []
    for observed in [12, 14, 16, 18]:
        predictions.append(float(model.prediction[0]))
        model.update(np.array([observed], dtype=float))
    np.testing.assert_allclose(predictions, expected)
    assert model.variance[0] == 1  # Latest two observations: 16, 18; population variance.


def test_forecast_zero_and_invalid_inputs() -> None:
    settings = load_planning().forecast
    model = Forecaster(np.zeros((2, 3)), np.zeros((2, 3)), settings)
    model.update(np.zeros((2, 3)))
    np.testing.assert_array_equal(model.prediction, 0)
    with pytest.raises(ValueError):
        model.update(np.ones(2))
    with pytest.raises(ValueError):
        model.update(np.full((2, 3), np.nan))
    with pytest.raises(ValueError):
        ForecastSettings(method="ses", window=0, alpha=0.5, beta=0.5)


def test_forecast_metrics_and_zero_denominators() -> None:
    metrics = error_metrics([[0, 0], [10, 0], [20, 0]], [[2, 0], [8, 0], [25, 0]])
    np.testing.assert_allclose(metrics["mad"], [3, 0])
    np.testing.assert_allclose(metrics["bias"], [-5 / 3, 0])
    assert metrics["mape"][0] == pytest.approx(0.225)
    assert metrics["wmape"][0] == pytest.approx(0.3)
    assert metrics["tracking_signal"][0] == pytest.approx(-5 / 3)
    assert np.isnan(metrics["mape"][1])
    assert np.isnan(metrics["wmape"][1])
    assert np.isnan(metrics["tracking_signal"][1])
    with pytest.raises(ValueError):
        error_metrics([[1]], [[np.inf]])


def test_abc_boundary_crossers_and_xyz_thresholds() -> None:
    # Include the SKU crossing each value threshold; stable ties retain input order.
    history = np.array([[60, 25, 10, 5, 0], [60, 25, 10, 5, 0]], dtype=float)
    settings = load_planning().segmentation
    segments = classify(history, np.ones(5), settings)
    assert segments.cell.tolist() == ["AX", "AX", "BX", "CX", "CZ"]
    np.testing.assert_allclose(segments.annual_value, [21900, 9125, 3650, 1825, 0])
    assert np.isinf(segments.cv[-1])
    variation = np.array([[1.0, 0.0, 0.0], [3.0, 2.0, 0.0], [1.0, 0.0, 3.0], [3.0, 2.0, 0.0]])
    classes = classify(variation, np.ones(3), settings)
    assert classes.xyz.tolist() == ["Y", "Y", "Z"]  # CV 0.5 and 1 both belong to Y.
    with pytest.raises(ValueError):
        classify([[1, 2]], [1, 1], settings)


def test_nine_cell_map_is_complete_and_validated() -> None:
    settings = load_planning()
    assert set(settings.segmentation.cells) == {a + x for a in "ABC" for x in "XYZ"}
    assert settings.segmentation.cells["AX"].policy == "QR"
    assert settings.segmentation.cells["AX"].target_csl == 0.98
    assert settings.segmentation.cells["CZ"].policy == "sS"
    bad = settings.model_dump()
    del bad["segmentation"]["cells"]["AX"]
    with pytest.raises(ValueError):
        type(settings).model_validate(bad)
