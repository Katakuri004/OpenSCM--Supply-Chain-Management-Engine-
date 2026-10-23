import { useState } from "react";
import type { Schema } from "../lib/tower";
import { Button } from "../components/ui/button";

type Request = Schema["RunRequest"];
type Overrides = NonNullable<Request["overrides"]>;
type Lab = NonNullable<Request["lab"]>;
export function Numeric({
  label,
  value,
  change,
  min = 0,
  max,
  step = "any",
}: {
  label: string;
  value: number | undefined;
  change: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label className="lab-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
}
export default function LabControls({
  request,
  change,
  catalog,
}: {
  request: Request;
  change: (value: Request) => void;
  catalog: Schema["LabCatalog"];
}) {
  const overrides = request.overrides ?? {};
  const lab = request.lab ?? {};
  const options = request.options ?? {};
  const profiles = request.model?.spec.suppliers ?? catalog.suppliers;
  const [selectedSupplier, setSupplier] = useState(profiles.at(-1)!.id);
  const profile = profiles.find((row) => row.id === selectedSupplier) ?? profiles[0]!;
  const supplierId = profile.id;
  const supplier = { ...profile, ...lab.suppliers?.[supplierId] };
  const update = (patch: Partial<Overrides>) =>
    change({ ...request, overrides: { ...overrides, ...patch } });
  const operating = (patch: Partial<Lab>) => change({ ...request, lab: { ...lab, ...patch } });
  const planning = options.segmented ? "segmented" : options.forecasting ? "forecast" : "known";
  return (
    <div className="space-y-5">
      <section className="lab-section">
        <h3>Experiment design</h3>
        <div className="lab-grid">
          <Numeric
            label="Root seed"
            value={request.seed}
            min={0}
            max={4294967295}
            step={1}
            change={(seed) => change({ ...request, seed })}
          />
          <Numeric
            label="Replications"
            value={request.replications}
            min={1}
            max={catalog.max_replications}
            step={1}
            change={(replications) => change({ ...request, replications })}
          />
          <Numeric
            label="Warm-up days"
            value={overrides.warmup_days ?? catalog.request.overrides?.warmup_days ?? 0}
            max={catalog.max_warmup_days}
            step={1}
            change={(warmup_days) => update({ warmup_days })}
          />
          <Numeric
            label="Measured days"
            value={overrides.horizon_days ?? catalog.request.overrides?.horizon_days ?? 365}
            min={1}
            max={catalog.max_horizon_days}
            step={1}
            change={(horizon_days) => update({ horizon_days })}
          />
          <label className="lab-field">
            <span>Open distribution centres</span>
            <select
              aria-label="Open distribution centres"
              disabled={!!request.model?.spec.open_dcs}
              value={
                overrides.network?.dc_count ??
                request.model?.spec.open_dcs?.length ??
                Math.min(4, request.model?.spec.dcs.length ?? 4)
              }
              onChange={(event) =>
                update({
                  network: {
                    ...overrides.network,
                    dc_count: Number(event.target.value) as 1 | 2 | 4 | 8,
                  },
                })
              }
            >
              {(request.model
                ? Array.from({ length: request.model.spec.dcs.length }, (_, i) => i + 1)
                : [1, 2, 4, 8]
              ).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {request.model?.spec.open_dcs && (
              <span className="lab-help">
                Explicit open set; edit DC membership in Network builder.
              </span>
            )}
          </label>
          <Numeric
            label="Target cycle service"
            value={overrides.policy?.target_csl ?? 0.95}
            min={0.01}
            max={0.9999}
            change={(target_csl) => update({ policy: { ...overrides.policy, target_csl } })}
          />
        </div>
      </section>
      <section className="lab-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Demand, uncertainty and seasonality</h3>
          <Button
            variant="outline"
            onClick={() => operating({ monthly_index: catalog.seasonal_example })}
          >
            Apply seasonal example
          </Button>
        </div>
        <p className="lab-help">
          Monthly indices multiply baseline demand on the model's repeating 365-day calendar. The
          example is an explicit synthetic assumption.
        </p>
        <div className="lab-grid">
          <Numeric
            label="Demand CV multiplier"
            value={overrides.demand?.cv_scale ?? 1}
            change={(cv_scale) => update({ demand: { ...overrides.demand, cv_scale } })}
          />
          <Numeric
            label="Regional demand correlation"
            value={overrides.demand?.regional_rho ?? 0.3}
            max={1}
            change={(regional_rho) => update({ demand: { ...overrides.demand, regional_rho } })}
          />
          <Numeric
            label="DC capacity factor"
            value={lab.dc_capacity_factor ?? 1}
            change={(dc_capacity_factor) => operating({ dc_capacity_factor })}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ].map((month, i) => (
            <Numeric
              key={month}
              label={`${month} demand index`}
              value={
                (lab.monthly_index ??
                  request.model?.seasonality.monthly_index_v1 ??
                  catalog.monthly_index)[i]
              }
              change={(value) => {
                const indices = [
                  ...(lab.monthly_index ??
                    request.model?.seasonality.monthly_index_v1 ??
                    catalog.monthly_index),
                ];
                indices[i] = value;
                operating({ monthly_index: indices });
              }}
            />
          ))}
        </div>
      </section>
      <section className="lab-section">
        <h3>Replenishment and forecast assumptions</h3>
        <div className="lab-grid">
          <label className="lab-field">
            <span>Forecast mode</span>
            <select
              aria-label="Forecast mode"
              value={planning}
              onChange={(event) =>
                change({
                  ...request,
                  options: {
                    ...options,
                    forecasting: event.target.value !== "known",
                    segmented: event.target.value === "segmented",
                    bullwhip: false,
                  },
                })
              }
            >
              <option value="known">Known demand control</option>
              <option value="forecast">Forecast-driven planning</option>
              <option value="segmented">ABC–XYZ policy map</option>
            </select>
          </label>
          <label className="lab-field">
            <span>Replenishment policy</span>
            <select
              aria-label="Portfolio replenishment policy"
              disabled={planning === "segmented"}
              value={overrides.policy?.default ?? "QR"}
              onChange={(event) =>
                update({
                  policy: {
                    ...overrides.policy,
                    default: event.target.value as NonNullable<Schema["PolicyConfig"]["default"]>,
                  },
                })
              }
            >
              {["QR", "sS", "RS", "order_up_to"].map((policy) => (
                <option key={policy}>{policy}</option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            <span>Unfilled demand</span>
            <select
              aria-label="Portfolio unfilled demand"
              value={options.lost_sales ? "lost" : "backorders"}
              onChange={(event) =>
                change({
                  ...request,
                  options: { ...options, lost_sales: event.target.value === "lost" },
                })
              }
            >
              <option value="backorders">Backorder</option>
              <option value="lost">Lost sales</option>
            </select>
          </label>
          <label className="lab-field">
            <span>Forecast method</span>
            <select
              aria-label="Forecast method"
              disabled={planning === "known"}
              value={lab.forecast_method ?? catalog.forecast.forecast_method ?? "ses"}
              onChange={(event) =>
                operating({
                  forecast_method: event.target.value as NonNullable<Lab["forecast_method"]>,
                })
              }
            >
              <option value="ses">Exponential smoothing</option>
              <option value="moving_average">Moving average</option>
              <option value="holt">Holt level + trend</option>
            </select>
          </label>
          <Numeric
            label="Forecast window"
            value={lab.forecast_window ?? catalog.forecast.forecast_window ?? 28}
            min={1}
            max={3650}
            step={1}
            change={(forecast_window) => operating({ forecast_window })}
          />
          <Numeric
            label="Forecast alpha"
            value={lab.forecast_alpha ?? catalog.forecast.forecast_alpha ?? 0.2}
            min={0.001}
            max={1}
            change={(forecast_alpha) => operating({ forecast_alpha })}
          />
          <Numeric
            label="Forecast beta"
            value={lab.forecast_beta ?? catalog.forecast.forecast_beta ?? 0.1}
            max={1}
            change={(forecast_beta) => operating({ forecast_beta })}
          />
        </div>
        <p className="lab-help">
          Forecast errors are measured against pre-demand forecasts. Window applies to moving
          average; alpha/beta apply to the selected smoothing method. Known-demand mode does not
          generate forecast-error diagnostics.
        </p>
      </section>
      <section className="lab-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Supplier reliability and sourcing alternatives</h3>
          <select
            aria-label="Supplier to configure"
            value={supplierId}
            onChange={(event) => setSupplier(event.target.value)}
          >
            {profiles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.id} · {row.label}
              </option>
            ))}
          </select>
        </div>
        <div className="lab-grid mt-4">
          {(
            [
              ["lead_mean", "Supplier lead mean", 0.01],
              ["lead_cv", "Supplier lead CV", 0],
              ["delay_probability", "Supplier delay probability", 0],
              ["delay_days", "Supplier delay days", 0],
              ["daily_capacity", "Supplier daily capacity", 0],
              ["price_multiplier", "Supplier price multiplier", 0.01],
              ["moq", "Supplier MOQ", 1],
            ] as const
          ).map(([key, label, min]) => (
            <Numeric
              key={key}
              label={label}
              value={supplier[key] ?? undefined}
              min={min}
              {...(key === "delay_probability" ? { max: 1 } : {})}
              {...(["moq", "delay_days"].includes(key) ? { step: 1 } : {})}
              change={(value) =>
                operating({
                  suppliers: {
                    ...lab.suppliers,
                    [supplierId]: { ...lab.suppliers?.[supplierId], [key]: value },
                  },
                })
              }
            />
          ))}
          <label className="lab-field">
            <span>Reactive backup supplier</span>
            <select
              aria-label="Reactive backup supplier"
              value={lab.backup_suppliers?.[supplierId] ?? ""}
              onChange={(event) => {
                const backups = { ...lab.backup_suppliers };
                if (event.target.value) backups[supplierId] = event.target.value;
                else delete backups[supplierId];
                operating({ backup_suppliers: backups });
              }}
            >
              <option value="">No backup</option>
              {profiles
                .filter((row) => row.id !== supplierId)
                .map((row) => (
                  <option key={row.id}>{row.id}</option>
                ))}
            </select>
          </label>
        </div>
        <p className="lab-help">
          Delay probability adds delay days to sampled transit. Backup suppliers use remaining
          capacity after primary commitments and charge their own prices; they are not unlimited
          insurance.
        </p>
      </section>
      <section className="lab-section">
        <h3>Mitigation policy</h3>
        <div className="lab-grid">
          <Numeric
            label="Safety buffer days"
            value={lab.buffer_days ?? 0}
            change={(buffer_days) => operating({ buffer_days })}
          />
          <Numeric
            label="Expedite transit factor"
            value={lab.expedite_factor ?? 1}
            min={0.01}
            max={1}
            change={(expedite_factor) => operating({ expedite_factor })}
          />
          <Numeric
            label="Expedite premium INR per unit"
            value={lab.expedite_unit_cost ?? 0}
            change={(expedite_unit_cost) => operating({ expedite_unit_cost })}
          />
        </div>
        <p className="lab-help">
          Buffers add nominal coverage to initial stock and targets. Expedite scales transit and
          adds the stated premium on every dispatched unit. Shared starting-inventory acquisition is
          excluded from measured purchase expense.
        </p>
      </section>
    </div>
  );
}
