from math import isfinite


def finite(**values: float) -> None:
    for name, value in values.items():
        if isinstance(value, bool) or not isfinite(value):
            raise ValueError(f"{name} must be finite and numeric")


def nonnegative(**values: float) -> None:
    finite(**values)
    for name, value in values.items():
        if value < 0:
            raise ValueError(f"{name} must be nonnegative")


def positive(**values: float) -> None:
    nonnegative(**values)
    for name, value in values.items():
        if value == 0:
            raise ValueError(f"{name} must be positive")


def probability(value: float) -> None:
    finite(probability=value)
    if not 0 < value < 1:
        raise ValueError("probability must be strictly between 0 and 1")
