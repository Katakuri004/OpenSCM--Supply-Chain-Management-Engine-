"""Static figures read only the records round-tripped through experiment Parquet."""

from pathlib import Path

import matplotlib
import numpy as np

from scm.contracts import ExperimentRow
from scm.experiments.design import Case
from scm.experiments.stats import estimate

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def plot_experiment(
    output: Path, experiment: str, cases: list[Case], rows: list[ExperimentRow]
) -> None:
    def mean(case_id: str, metric: str, phase: str = "evaluation") -> float:
        value = estimate(
            [
                r.value
                for r in rows
                if r.case_id == case_id and r.metric == metric and r.phase == phase
            ]
        )["mean"]
        return float(value) if value is not None else float("nan")

    figure, axes = plt.subplots(1, 2, figsize=(13, 5), layout="constrained")
    if experiment == "E1":
        quantity_cases = sorted(
            {r.case_id for r in rows if r.metric == "quantity"}, key=lambda x: int(x[2:])
        )
        axes[0].plot(
            [mean(c, "quantity", "validation") for c in quantity_cases],
            [mean(c, "inventory_cost_inr", "validation") for c in quantity_cases],
            "o-",
            color="#2B5C8A",
        )
        axes[0].set(xlabel="Order quantity", ylabel="Annual ordering + holding cost (INR)")
        axes[1].axis("off")
        axes[1].text(
            0.05,
            0.7,
            "V1–V4 tables in results.parquet\nValidation and Welch figure in validation/",
            fontsize=12,
        )
    elif experiment == "E2":
        for sku in sorted({str(c.factors["sku"]) for c in cases}):
            selected = sorted(
                [c for c in cases if c.factors["sku"] == sku],
                key=lambda c: float(c.factors["target_csl"]),
            )
            axes[0].plot(
                [mean(c.case_id, "achieved_csl") for c in selected],
                [mean(c.case_id, "inventory_cost_inr") for c in selected],
                "o-",
                label=sku,
            )
            axes[1].plot(
                [float(c.factors["target_csl"]) for c in selected],
                [mean(c.case_id, "fill_rate") for c in selected],
                "o-",
                label=sku,
            )
        axes[0].set(
            xlabel="Achieved cycle service", ylabel="Measured ordering + holding cost (INR)"
        )
        axes[1].set(xlabel="Target cycle service", ylabel="Achieved unit fill")
        axes[0].legend()
        axes[1].legend()
    elif experiment == "E3":

        def middle(key: str) -> float:
            values = sorted({float(c.factors[key]) for c in cases})
            return values[(len(values) - 1) // 2]

        cv, lead, rho, freight = (
            middle(k) for k in ("demand_cv", "inbound_days", "rho", "outbound_factor")
        )
        selected = sorted(
            [
                c
                for c in cases
                if c.factors["demand_cv"] == cv
                and c.factors["inbound_days"] == lead
                and c.factors["rho"] == rho
                and c.factors["outbound_factor"] == freight
            ],
            key=lambda c: int(c.factors["dc_count"]),
        )
        axes[0].plot(
            [int(c.factors["dc_count"]) for c in selected],
            [mean(c.case_id, "landed_cost_inr", "screen") for c in selected],
            "o-",
            color="#2B5C8A",
        )
        axes[0].set(
            xlabel="DC count",
            ylabel="Measured landed cost (INR)",
            title=f"Screen: CV={cv}, lead={lead}, rho={rho}, freight={freight}",
        )
        rhos = sorted({float(c.factors["rho"]) for c in cases})
        freights = sorted({float(c.factors["outbound_factor"]) for c in cases})
        best = np.zeros((len(rhos), len(freights)))
        for i, r in enumerate(rhos):
            for j, f in enumerate(freights):
                block = [
                    c
                    for c in cases
                    if c.factors["demand_cv"] == cv
                    and c.factors["inbound_days"] == lead
                    and c.factors["rho"] == r
                    and c.factors["outbound_factor"] == f
                ]
                winner = min(block, key=lambda c: mean(c.case_id, "landed_cost_inr", "screen"))
                best[i, j] = int(winner.factors["dc_count"])
                axes[1].text(j, i, str(int(best[i, j])), ha="center", va="center")
        axes[1].imshow(best, cmap="Blues", vmin=0, vmax=max(best.max(), 1))
        axes[1].set(
            xticks=range(len(freights)),
            xticklabels=freights,
            yticks=range(len(rhos)),
            yticklabels=rhos,
            xlabel="Outbound freight multiplier",
            ylabel="Regional rho",
            title=f"Screen cost winner (DC count), CV={cv}, lead={lead}",
        )
    elif experiment == "E4":
        for share, lead in sorted(
            {(bool(c.factors["pos_sharing"]), float(c.factors["lead_factor"])) for c in cases}
        ):
            selected = [
                c
                for c in cases
                if c.factors["pos_sharing"] == share and c.factors["lead_factor"] == lead
            ]
            for axis, metric in zip(axes, ("bwe_customer_orders", "bwe_dc_orders")):
                axis.plot(
                    range(len(selected)),
                    [mean(c.case_id, metric) for c in selected],
                    "o-",
                    label=f"POS={share}, lead×{lead}",
                )
                axis.set(
                    yscale="log",
                    xlabel="Cause cell (binary S/B/P/R)",
                    ylabel="Weekly order / demand variance",
                )
                axis.set_xticks(
                    range(len(selected)),
                    [
                        "".join(
                            str(int(bool(c.factors[k])))
                            for k in ("signal_processing", "batching", "price", "rationing")
                        )
                        for c in selected
                    ],
                    rotation=90,
                    fontsize=8,
                )
                axis.legend(fontsize=8)
        axes[0].set_title("Customer replenishment")
        axes[1].set_title("DC replenishment")
    elif experiment == "E5":
        evaluated = [
            c
            for c in cases
            if any(r.case_id == c.case_id and r.phase == "evaluation" for r in rows)
        ]
        labels = ["Segmented" if c.factors["segmented"] else "Uniform" for c in evaluated]
        for axis, metric in zip(axes, ("fill_rate", "inventory_value_inr")):
            axis.bar(labels, [mean(c.case_id, metric) for c in evaluated], color="#2B5C8A")
            axis.set_ylabel(metric.replace("_", " "))
        axes[0].set_title("Held-out service (matching status in summary.json)")
    else:
        events = sorted({int(c.factors["event"]) for c in cases})
        mitigations = sorted({str(c.factors["mitigation"]) for c in cases})
        for i, m in enumerate(mitigations):
            selected = [
                next(
                    c
                    for c in cases
                    if c.factors["event"] == e
                    and c.factors["mitigation"] == m
                    and c.factors["parameter"] == "none"
                )
                for e in events
            ]
            axes[0].bar(
                np.arange(len(events)) + i * 0.18,
                [mean(c.case_id, "disruption_cost_inr") for c in selected],
                width=0.18,
                label=m,
            )
        axes[0].set(
            xticks=np.arange(len(events)) + 0.27,
            xticklabels=[f"Event {e}" for e in events],
            ylabel="Paired disruption cost (INR)",
        )
        axes[0].legend(fontsize=8)
        baseline = next(
            c
            for c in cases
            if c.factors["event"] == events[0]
            and c.factors["mitigation"] == "none"
            and c.factors["parameter"] == "none"
        )
        selected = [
            c
            for c in cases
            if c.factors["event"] == events[0]
            and c.factors["mitigation"] == "none"
            and c.factors["parameter"] != "none"
        ]
        axes[1].barh(
            [f"{c.factors['parameter']} ×{c.factors['scale']}" for c in selected],
            [
                mean(c.case_id, "disruption_cost_inr")
                - mean(baseline.case_id, "disruption_cost_inr")
                for c in selected
            ],
            color="#2B5C8A",
        )
        axes[1].set(
            xlabel="Change in paired disruption cost (INR)",
            title=f"Event {events[0]}: one-at-a-time sensitivity",
        )
    figure.suptitle(
        f"{experiment} · synthetic experiment outputs; intervals and missing counts in summary.json"
    )
    figure.savefig(output / "summary.png", dpi=150)
    plt.close(figure)
