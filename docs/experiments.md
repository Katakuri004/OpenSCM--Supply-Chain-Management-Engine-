# M7 experiment grids and reproducible outputs

The runner expands validated YAML into E1–E6 cases, executes replications through
joblib worker processes, and writes a deterministic Parquet table, statistical
summary, static figure and manifest. Run commands at the repository root.

```powershell
.\.venv\Scripts\python.exe -m scm.experiments.runner E2
.\.venv\Scripts\python.exe -m scm.experiments.runner E3 --workers 8
.\.venv\Scripts\python.exe -m scm.experiments.runner E4 --config configs/m7_validation.yaml --output docs/evidence/m7
```

The default configuration is `configs/experiments.yaml`, and the default output
directory is `data/experiments/<experiment>`. Options `--replications`, `--screen`
and `--confirm` override their corresponding counts; zero uses the YAML value.
Invalid counts, duplicate factor values and unknown experiment names are rejected.
An existing output directory is replaced by the new run's generated files. A manifest
is written only after successful completion; a failed rerun removes its old manifest
so incomplete output cannot be mistaken for a completed run.

## Designs

| Experiment | Implemented design | Outputs |
| --- | --- | --- |
| E1 | Existing M2 V1–V4 checks and eight-point quantity sweep; its separate validated benchmark settings are retained | Analytical versus simulated checks, replication cost sweep, validation and Welch figures |
| E2 | Five target CSLs × three representative master SKUs, one from each synthetic A/B/C class | Achieved CSL, unit fill, inventory value, ordering + holding cost, marginal cost per achieved CSL point |
| E3 | 4 DC counts × 3 CVs × 4 correlations × 3 outbound freight factors × 3 inbound transit settings = 432 cells | Eight cost accounts, landed cost, unit fill, inventory value, cost curve and winning-DC heat map |
| E4 | All 16 cause combinations × 2 POS settings × 2 lead factors = 64 cells | Weekly BWE at each reported stage, costs, service, paired cause and countermeasure differences |
| E5 | Uniform policy versus eight segmented safety-factor candidates, followed by separate evaluation | Calibration/evaluation records, selected offset, blended service gap, inventory and cost differences |
| E6 | 6 event types × 4 mitigation settings × 9 OAT settings = 216 cells | TTS, TTR, paired disruption cost, lost sales, service and cost accounts; mitigation bars and sensitivity tornado |

E1 delegates to `scm.sim.validate`, preserving its longer horizons and independent
validation tolerances. Its nested `validation/` directory contains the underlying
checks and plots. Other experiments use the horizon and warm-up in their resolved
specification. Costs are totals for measured days, except E1's annualized inventory
cost. Inventory value is average on-hand units valued at base unit cost.

E2 uses isolated stocking-node simulations with each chosen SKU's mean, variability,
demand family, primary supplier lead settings, purchase multiplier and customer
ordering/holding rates. It omits lane geography, network capacity, supplier delays
and MOQ constraints to expose the service/inventory relationship. These are three
representatives, not empirical class averages. Normal-loss service targets remain
approximations for gamma demand and rounded variable transit. Achieved CSL counts
completed replenishment cycles and may be undefined when none complete.

For each SKU, adjacent increasing targets define marginal inventory cost divided by
the **paired achieved CSL increase in percentage points**. Nonpositive or missing
achieved increases produce null, rather than an unstable or misleading slope. These
finite-run slopes are descriptive and are not guaranteed to increase monotonically.

E3 sets every SKU's demand CV to the factor value, retains each demand family and B2B
arrival model, and varies the shared regional latent correlation. It overrides
supplier-to-DC unrounded base transit means **before** inventory targets are built.
Gamma rounding and configured supplier delay draws remain active, so realized lead
means can exceed the factor. Outbound freight factors scale both FTL and LTL costs
on DC-to-customer lanes; inbound costs are unaffected. Site selection remains weighted
distance k-median. No U shape or particular winning DC count is assumed.

Each E3 block holds every factor except DC count constant. Screen means select all
DC counts within the configured fraction of the cheapest; only blocks with at least
two such counts receive confirmation. Confirmation uses new seeds and is summarized
separately. Its paired differences use the lowest available DC count in that phase.
Screen results and heat-map winners are exploratory; confirmation does not reuse
screen samples or automatically establish statistical superiority.

E4 uses M5's uniform order-up-to mechanism and configured forecasting method. Causes
are signal processing, batching, price and rationing; other controls retain their
configured defaults. POS and lead effects are paired within otherwise identical
cause cells. The four-stage supplier-orders-received series still equals DC orders:
no additional upstream buying stage has been invented. Daily Chen validation remains
in the separate M5 reference; its bound is not imposed on weekly network ratios.

E5 minimizes the calibration blended-fill gap across the configured z offsets,
preferring the smallest absolute adjustment on ties. Selected policies are then
evaluated on new seeds. `service_matched` requires both calibration and evaluation
mean gaps to satisfy the configured tolerance. The runner retains unsuccessful
matching results for inspection; they must not be described as inventory comparisons
at equal service. Classification and forecasts initialize from a separate historical
stream; historical classes remain fixed throughout each replication.

## Resilience mitigations and sensitivity

E6 takes event definitions and resilience measurement settings from
`configs/m6_validation.yaml`. Each event is run separately against an event-free
baseline with the same mitigation, sensitivity adjustment, initial state and input
streams. Whole-run landed-cost comparisons between mitigation arms are also saved.
The paired disruption-cost metric isolates the event's cost **within** a mitigation
arm; it does not include the baseline cost of adopting that mitigation.

- **Stock buffer:** add nominal daily demand × buffer days to initial stock,
  reorder points and upper targets at DCs and customers. Holding charges apply;
  initial inventory acquisition is excluded, consistently with existing initial-stock
  accounting. This convention limits comparisons of upfront mitigation investment.
- **Expedite:** scale and ceil transit draws, retaining at least one day, and charge
  a configured unit premium on every dispatched lane. It is a standing policy for
  the entire run, including the paired baseline. Policy targets retain nominal
  transit assumptions, so the experiment does not claim to optimize expedited stock.
- **Dual sourcing:** after primary FIFO allocation, send remaining supplier requests
  to their configured backup. Backups share their remaining daily throughput after
  primary commitments, use existing lanes and their own transit draws, and charge
  their actual SKU purchase multiplier. Outstanding primary-order obligations are
  reduced by backup fulfillment. This is reactive backup fulfillment, with unlimited
  raw material and no extra backup setup fee, reservation fee or new MOQ negotiation.

The normal reference disables these settings. Backup prices affect purchase costs;
holding valuation remains at primary base unit cost. Lateral transshipment is
deferred under the plan's explicit descoping provision.

OAT settings apply 0.8 or 1.2 to one of demand mean, supplier/DC capacity, supplier
base lead time, or DC/customer holding rates. The unadjusted setting is also included.
Policy targets are rebuilt after each change; baseline and event arms share it.
The tornado shows changes in paired disruption cost for the first configured event
without mitigation. It is a local sensitivity check, not a ranked risk probability.

## Records, statistics and provenance

`results.parquet` follows the [ExperimentRow contract](../contracts/README.md).
Rows and columns have a fixed order; the writer uses fixed Parquet version, row-group
size, plain encoding and no compression or timestamps. The file is atomically replaced
after writing. Exact byte identity is tested across serial and parallel execution
in the pinned environment. Different library versions or hardware are not promised
to produce identical bytes.

SeedSequence branches distinguish experiment, training, calibration, screening,
confirmation and evaluation. Case factors do not affect replication seeds, preserving
common random numbers. Canonical customer/lane streams retain their M3 identities.
Worker processes use one internal numerical-library thread. Completion order does
not determine record order. The parent process collects small metric records rather
than retaining simulation histories from every worker.

`summary.json` contains means and two-sided 95% Student t intervals across independent
replications. Paired intervals are calculated from differences on matching seeds,
never from two independent standard errors. One observation has no interval; null
observations are omitted while their count is preserved. Recovery estimates with
censored observations are therefore conditional on observed recovery; they are not
survival estimates. There is no multiple-comparison correction or automatic claim
that a confidence interval establishes operational importance.

`manifest.json` records resolved settings, case factors, source/config/schema hashes,
package versions, Python version, Git commit, row count and output hashes. The
configuration hash includes the resolved spec and input hashes. It is independent
of the CLI worker override. A Git SHA identifies the parent commit when local edits
exist; source hashes identify the actual implementation used. Reports and figures
must cite the outputs corresponding to their manifest.
Evidence files are excluded from Git newline conversion so their recorded output
checksums survive transfer. Source hashes describe the actual checkout bytes used;
different checkout newline conventions can change those input hashes.

Each static figure reads records after Parquet round-trip. E3 plots one documented
central factor slice; E4 plots all cause cells; E5 labels held-out service and points
to its matching status. Interval estimates and missing counts are saved alongside
figures rather than inferred from plotted averages.

## Acceptance evidence

`configs/m7_validation.yaml` retains all grid cells and reduces evaluation/screening
to two replications and confirmation to three. E5 retains five calibration replications;
E1 retains the original M2 benchmark. These runs check the implementation and output
pipeline. The full configuration defaults to 30 evaluation replications, ten screening
replications and 30 confirmation replications. Broader operating calibration and a
fully powered study remain unverified.

See [validation](validation.md) for saved counts, hashes and measured results.
M8 adds the [API and DuckDB query layer](api.md); M7 artifacts are available directly
through the documented CLI and Parquet contract.
