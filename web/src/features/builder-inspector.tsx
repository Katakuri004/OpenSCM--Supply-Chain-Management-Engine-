import { useState } from "react";
import { Button } from "../components/ui/button";
import {
  addFacility,
  connectCustomer,
  fieldLabels,
  removeFacility,
  renameFacility,
  syncNetwork,
  updateFacility,
  type BuilderRequest,
  type FacilityKind,
} from "../lib/builder";
import type { Schema } from "../lib/tower";

export function Fields({
  row,
  prefix,
  change,
  suppliers = [],
}: {
  row: object;
  prefix: string;
  change: (patch: Record<string, string | number>) => void;
  suppliers?: string[];
}) {
  const options: Record<string, string[]> = {
    kind: ["retailer", "b2b"],
    value_class: ["A", "B", "C"],
    demand_kind: ["normal", "gamma"],
    supplier: suppliers,
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(row)
        .filter(([key]) => key !== "id")
        .map(([key, value]) => (
          <label className="lab-field" key={key}>
            <span>
              {key === "lead_mean" && "price_multiplier" in row
                ? "Supplier base lead (days)"
                : (fieldLabels[key] ?? key.replaceAll("_", " "))}
            </span>
            {options[key] ? (
              <select
                aria-label={`${prefix} ${key}`}
                value={String(value)}
                onChange={(e) => change({ [key]: e.target.value })}
              >
                {options[key]!.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`${prefix} ${key}`}
                type={typeof value === "number" ? "number" : "text"}
                step="any"
                disabled={
                  "kind" in row &&
                  row.kind === "retailer" &&
                  (key === "target_csl" || key === "arrival_probability")
                }
                value={value as string | number}
                onChange={(e) =>
                  change({
                    [key]: typeof value === "number" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
    </div>
  );
}
export default function BuilderInspector({
  request,
  selected,
  preview,
  change,
  select,
  report,
}: {
  request: BuilderRequest;
  selected: string;
  preview: Schema["ModelPreview"] | undefined;
  change: (value: BuilderRequest) => void;
  select: (id: string) => void;
  report: (message: string) => void;
}) {
  const spec = request.model.spec;
  const facility = [...spec.suppliers, ...spec.dcs, ...spec.customers].find(
    (row) => row.id === selected,
  );
  const sku = spec.skus.find((row) => `sku:${row.id}` === selected);
  const [idDraft, setIdDraft] = useState(facility?.id ?? sku?.id ?? "");
  const open = spec.open_dcs ?? preview?.open_dcs ?? [];
  const isDc = spec.dcs.some((row) => row.id === selected);
  const customer = spec.customers.find((row) => row.id === selected);
  const perform = (action: () => void) => {
    try {
      action();
      report("");
    } catch (error) {
      report(error instanceof Error ? error.message : "Unable to edit this model.");
    }
  };
  if (selected.startsWith("lane:")) {
    const [source, target] = selected.slice(5).split("|") as [string, string];
    const override = spec.lanes?.find((row) => row.source === source && row.target === target);
    const actual = preview?.lanes.find((row) => row.source === source && row.target === target);
    return (
      <section className="panel p-4">
        <p className="eyebrow">LANE ASSUMPTIONS</p>
        <h2 className="mt-3 font-semibold">
          {source} → {target}
        </h2>
        <p className="lab-help">
          Blank fields inherit geography, supplier or outbound transport settings. Overrides affect
          this directed lane when active. Freight uses the model's transport economics.
        </p>
        <div className="mt-4 grid gap-3">
          {["distance_km", "lead_mean", "lead_cv", "delay_probability", "delay_days"].map((key) => (
            <label className="lab-field" key={key}>
              <span>{fieldLabels[key]}</span>
              <input
                type="number"
                min={0}
                step={key === "delay_days" ? 1 : "any"}
                aria-label={`Lane ${key}`}
                placeholder={`Inherited: ${actual?.[key as keyof typeof actual] ?? "validate to resolve"}`}
                value={override?.[key as keyof typeof override] ?? ""}
                onChange={(e) => {
                  const draft = structuredClone(request);
                  const row = {
                    ...override,
                    source,
                    target,
                    [key]: e.target.value === "" ? null : Number(e.target.value),
                  };
                  draft.model.spec.lanes = [
                    ...(draft.model.spec.lanes ?? []).filter(
                      (lane) => lane.source !== source || lane.target !== target,
                    ),
                    row,
                  ];
                  change(draft);
                }}
              />
            </label>
          ))}
        </div>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            const draft = structuredClone(request);
            draft.model.spec.lanes = (draft.model.spec.lanes ?? []).filter(
              (lane) => lane.source !== source || lane.target !== target,
            );
            change(draft);
          }}
        >
          Reset lane overrides
        </Button>
      </section>
    );
  }
  if (!facility && !sku)
    return (
      <section className="panel p-5">
        <p className="eyebrow">MODEL INSPECTOR</p>
        <h2 className="mt-3 font-semibold">Select a facility, SKU or lane</h2>
        <p className="lab-help">
          Use the canvas or master-data tables. Facility coordinates affect geography; diagram
          positions do not.
        </p>
      </section>
    );
  return (
    <section className="panel space-y-4 p-4" aria-label="Model inspector">
      <div>
        <p className="eyebrow">{sku ? "SKU MASTER" : "FACILITY MASTER"}</p>
        <h2 className="mt-2 font-semibold">{(facility ?? sku)!.id}</h2>
      </div>
      <label className="lab-field">
        <span>Identifier</span>
        <div className="flex gap-2">
          <input
            aria-label="Selected identifier"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() =>
              perform(() => {
                if (facility) {
                  change(renameFacility(request, facility.id, idDraft));
                  select(idDraft);
                } else if (sku) {
                  if (
                    !/^[A-Za-z0-9_-]+$/.test(idDraft) ||
                    spec.skus.some((row) => row.id === idDraft && row.id !== sku.id)
                  )
                    throw new Error("Use a unique valid SKU identifier.");
                  const draft = structuredClone(request);
                  draft.model.spec.skus.find((row) => row.id === sku.id)!.id = idDraft;
                  if (draft.lab?.skus?.[sku.id]) {
                    draft.lab.skus[idDraft] = draft.lab.skus[sku.id]!;
                    delete draft.lab.skus[sku.id];
                  }
                  change(draft);
                  select(`sku:${idDraft}`);
                }
              })
            }
          >
            Rename
          </Button>
        </div>
      </label>
      {isDc && (
        <label className="field">
          <input
            aria-label="Selected DC open"
            type="checkbox"
            checked={open.includes(selected)}
            onChange={(e) =>
              perform(() => {
                const chosen = e.target.checked
                  ? [...open, selected]
                  : open.filter((id) => id !== selected);
                if (!chosen.length)
                  throw new Error("Keep at least one open DC or switch to automatic selection.");
                const draft = structuredClone(request);
                draft.model.spec.open_dcs = chosen;
                draft.model.spec.assignments = Object.fromEntries(
                  Object.entries(spec.assignments ?? {}).filter(([, dc]) => chosen.includes(dc)),
                );
                change(syncNetwork(draft));
              })
            }
          />
          Open this distribution centre
        </label>
      )}
      {customer && (
        <label className="lab-field">
          <span>Replenishment DC</span>
          <select
            aria-label="Customer distribution centre"
            value={spec.assignments?.[selected] ?? ""}
            onChange={(e) =>
              perform(() => {
                if (e.target.value)
                  change(connectCustomer(request, e.target.value, selected, open));
                else {
                  const draft = structuredClone(request);
                  delete draft.model.spec.assignments?.[selected];
                  change(draft);
                }
              })
            }
          >
            <option value="">Auto · nearest open DC</option>
            {open.map((dc) => (
              <option key={dc}>{dc}</option>
            ))}
          </select>
          <span className="lab-help">
            Resolved: {preview?.assignments[selected] ?? "pending validation"}
          </span>
        </label>
      )}
      <Fields
        row={facility ?? sku!}
        prefix={sku ? "SKU" : "Facility"}
        suppliers={spec.suppliers.map((row) => row.id)}
        change={(patch) => {
          if (facility) {
            if (patch.kind === "retailer") patch.arrival_probability = 1;
            change(updateFacility(request, facility.id, patch));
          } else {
            const draft = structuredClone(request);
            Object.assign(
              draft.model.spec.skus.find((row) => row.id === sku!.id)!,
              patch,
            );
            change(draft);
          }
        }}
      />
      {customer?.kind === "retailer" && (
        <p className="lab-help">
          Retailers arrive daily and use the scenario CSL target. A customer-specific target applies
          to B2B buyers.
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
        <Button
          variant="outline"
          onClick={() =>
            perform(() => {
              if (facility) {
                const kind: FacilityKind = spec.suppliers.some((row) => row.id === selected)
                  ? "supplier"
                  : isDc
                    ? "dc"
                    : "customer";
                const draft = addFacility(request, kind, selected);
                const rows =
                  kind === "supplier"
                    ? draft.model.spec.suppliers
                    : kind === "dc"
                      ? draft.model.spec.dcs
                      : draft.model.spec.customers;
                change(draft);
                select(rows.at(-1)!.id);
              } else {
                const draft = structuredClone(request);
                let index = 1;
                while (spec.skus.some((row) => row.id === `SKU${index}`)) index++;
                const id = `SKU${index}`;
                draft.model.spec.skus.push({ ...sku!, id, label: `${sku!.label} copy` });
                change(draft);
                select(`sku:${id}`);
              }
            })
          }
        >
          Duplicate selected
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            perform(() => {
              if (facility) change(removeFacility(request, selected));
              else {
                if (spec.skus.length === 1) throw new Error("Keep at least one SKU.");
                const draft = structuredClone(request);
                draft.model.spec.skus = spec.skus.filter((row) => row.id !== sku!.id);
                if (draft.lab?.skus) delete draft.lab.skus[sku!.id];
                change(draft);
              }
              select("");
            })
          }
        >
          Delete selected
        </Button>
      </div>
      <p className="lab-help">
        Deletion is undoable. Referenced suppliers and the last row in an echelon are protected.
        Duplicates copy synthetic assumptions; review every field.
      </p>
    </section>
  );
}
