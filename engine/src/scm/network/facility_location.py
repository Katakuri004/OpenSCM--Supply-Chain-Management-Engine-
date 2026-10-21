import numpy as np
from numpy.typing import ArrayLike, NDArray


def k_median(distances: ArrayLike, weights: ArrayLike, k: int) -> NDArray[np.int64]:
    """Deterministic greedy opening followed by strictly improving one-site swaps."""
    distance, weight = np.asarray(distances, dtype=float), np.asarray(weights, dtype=float)
    if (
        distance.ndim != 2
        or weight.shape != (distance.shape[1],)
        or weight.size == 0
        or not np.all(np.isfinite(distance))
        or not np.all(np.isfinite(weight))
        or np.any(distance < 0)
        or np.any(weight < 0)
        or weight.sum() == 0
    ):
        raise ValueError("distances and nonzero demand weights must be finite and nonnegative")
    if isinstance(k, bool) or not isinstance(k, int) or not 1 <= k <= len(distance):
        raise ValueError("k must be a positive integer no larger than the candidate count")
    chosen: list[int] = []

    def cost(sites: list[int]) -> float:
        return float(np.min(distance[sites], axis=0) @ weight)

    for _ in range(k):
        chosen.append(
            min(
                (i for i in range(len(distance)) if i not in chosen),
                key=lambda i: (cost([*chosen, i]), i),
            )
        )
    while True:
        best, best_cost = chosen, cost(chosen)
        for old in chosen:
            for new in range(len(distance)):
                if new not in chosen:
                    proposed = sorted([i for i in chosen if i != old] + [new])
                    candidate_cost = cost(proposed)
                    if candidate_cost < best_cost - 1e-9:
                        best, best_cost = proposed, candidate_cost
        if best == chosen:
            return np.asarray(sorted(chosen), dtype=np.int64)
        chosen = best
