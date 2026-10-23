import type { Schema } from "./tower";
export type BuilderRequest = Schema["RunRequest"] & { model: Schema["ModelSnapshot"] };
export type FacilityKind = "supplier" | "dc" | "customer";
export function facilities(request: BuilderRequest) {
  const spec = request.model.spec;
  return [
    ...spec.suppliers.map((row) => ({ ...row, kind: "supplier" as const })),
    ...spec.dcs.map((row) => ({ ...row, kind: "dc" as const })),
    ...spec.customers,
  ];
}
export function syncNetwork(request: BuilderRequest): BuilderRequest {
  const spec = request.model.spec;
  return {
    ...request,
    overrides: {
      ...request.overrides,
      network: {
        ...request.overrides?.network,
        suppliers: spec.suppliers.map((row) => row.id),
        dc_count:
          spec.open_dcs?.length ??
          Math.min(request.overrides?.network?.dc_count ?? 4, spec.dcs.length),
      },
    },
  };
}
function newId(ids: string[], prefix: string) {
  let index = 1;
  while (ids.includes(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}
export function addFacility(request: BuilderRequest, kind: FacilityKind, copyId?: string) {
  const draft = structuredClone(request),
    spec = draft.model.spec;
  const rows = kind === "supplier" ? spec.suppliers : kind === "dc" ? spec.dcs : spec.customers;
  const source = rows.find((row) => row.id === copyId) ?? rows[0]!;
  const id = newId(
    facilities(draft).map((row) => row.id),
    kind === "supplier" ? "S" : kind === "dc" ? "DC" : "R",
  );
  rows.push({ ...source, id, label: `${source.label} copy` } as never);
  return syncNetwork(draft);
}
export function renameFacility(request: BuilderRequest, oldId: string, id: string) {
  if (
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    (id !== oldId && facilities(request).some((row) => row.id === id))
  )
    throw new Error("Use a unique facility ID containing letters, digits, underscores or hyphens.");
  const draft = structuredClone(request),
    spec = draft.model.spec;
  for (const row of [...spec.suppliers, ...spec.dcs, ...spec.customers])
    if (row.id === oldId) row.id = id;
  for (const sku of spec.skus) if (sku.supplier === oldId) sku.supplier = id;
  spec.open_dcs = spec.open_dcs?.map((value) => (value === oldId ? id : value)) ?? null;
  spec.assignments = Object.fromEntries(
    Object.entries(spec.assignments ?? {}).map(([key, value]) => [
      key === oldId ? id : key,
      value === oldId ? id : value,
    ]),
  );
  spec.lanes = (spec.lanes ?? []).map((lane) => ({
    ...lane,
    source: lane.source === oldId ? id : lane.source,
    target: lane.target === oldId ? id : lane.target,
  }));
  if (draft.model.positions?.[oldId]) {
    draft.model.positions[id] = draft.model.positions[oldId]!;
    delete draft.model.positions[oldId];
  }
  if (draft.lab?.suppliers?.[oldId]) {
    draft.lab.suppliers[id] = draft.lab.suppliers[oldId]!;
    delete draft.lab.suppliers[oldId];
  }
  if (draft.lab?.backup_suppliers)
    draft.lab.backup_suppliers = Object.fromEntries(
      Object.entries(draft.lab.backup_suppliers).map(([a, b]) => [
        a === oldId ? id : a,
        b === oldId ? id : b,
      ]),
    );
  for (const override of Object.values(draft.lab?.skus ?? {}))
    if (override.supplier === oldId) override.supplier = id;
  const targets = new Map<string, string>();
  for (const a of facilities(request))
    for (const b of facilities(request))
      if (a.id === oldId || b.id === oldId)
        targets.set(
          `${a.id}_${b.id}`,
          `${a.id === oldId ? id : a.id}_${b.id === oldId ? id : b.id}`,
        );
  for (const event of draft.overrides?.disruptions ?? [])
    event.target = event.target === oldId ? id : (targets.get(event.target) ?? event.target);
  return syncNetwork(draft);
}
export function removeFacility(request: BuilderRequest, id: string) {
  const draft = structuredClone(request),
    spec = draft.model.spec;
  const list = spec.suppliers.some((row) => row.id === id)
    ? spec.suppliers
    : spec.dcs.some((row) => row.id === id)
      ? spec.dcs
      : spec.customers;
  if (list.length <= 1) throw new Error("Keep at least one facility in every echelon.");
  if (spec.skus.some((row) => row.supplier === id))
    throw new Error("Reassign every SKU using this supplier before removing it.");
  if (
    (draft.overrides?.disruptions ?? []).some(
      (event) =>
        event.target === id || event.target.startsWith(`${id}_`) || event.target.endsWith(`_${id}`),
    )
  )
    throw new Error("Remove or retarget disruption events before deleting this facility.");
  list.splice(
    list.findIndex((row) => row.id === id),
    1,
  );
  spec.assignments = Object.fromEntries(
    Object.entries(spec.assignments ?? {}).filter(([a, b]) => a !== id && b !== id),
  );
  spec.lanes = (spec.lanes ?? []).filter((lane) => lane.source !== id && lane.target !== id);
  spec.open_dcs = spec.open_dcs?.filter((value) => value !== id) ?? null;
  if (spec.open_dcs?.length === 0) spec.open_dcs = null;
  if (draft.model.positions) delete draft.model.positions[id];
  if (draft.lab?.suppliers) delete draft.lab.suppliers[id];
  if (draft.lab?.backup_suppliers)
    draft.lab.backup_suppliers = Object.fromEntries(
      Object.entries(draft.lab.backup_suppliers).filter(([a, b]) => a !== id && b !== id),
    );
  const regions = [...new Set(spec.customers.map((row) => row.region))].sort((a, b) => a - b);
  for (const row of spec.customers) row.region = regions.indexOf(row.region);
  return syncNetwork(draft);
}
export function connectCustomer(
  request: BuilderRequest,
  dc: string,
  customer: string,
  open: string[],
) {
  if (
    !open.includes(dc) ||
    !request.model.spec.dcs.some((row) => row.id === dc) ||
    !request.model.spec.customers.some((row) => row.id === customer)
  )
    throw new Error("Connect an open distribution centre to a retailer or B2B buyer.");
  const draft = structuredClone(request);
  draft.model.spec.assignments = { ...draft.model.spec.assignments, [customer]: dc };
  return draft;
}
export function updateFacility(
  request: BuilderRequest,
  id: string,
  patch: Record<string, string | number>,
) {
  const draft = structuredClone(request),
    spec = draft.model.spec;
  const row = [...spec.suppliers, ...spec.dcs, ...spec.customers].find((row) => row.id === id);
  if (row) Object.assign(row, patch);
  return draft;
}
export function moveFacilities(
  request: BuilderRequest,
  positions: Record<string, { x: number; y: number }>,
  geographic: boolean,
) {
  const draft = structuredClone(request);
  if (!geographic)
    draft.model.positions = Object.fromEntries(
      Object.entries(positions).map(([id, p]) => [
        id,
        { x: Math.max(-10000, Math.min(10000, p.x)), y: Math.max(-10000, Math.min(10000, p.y)) },
      ]),
    );
  else
    for (const row of [
      ...draft.model.spec.suppliers,
      ...draft.model.spec.dcs,
      ...draft.model.spec.customers,
    ]) {
      const p = positions[row.id];
      if (p && (p.x !== (row.longitude + 180) * 6 || p.y !== (90 - row.latitude) * 6)) {
        row.longitude = Math.max(-180, Math.min(180, p.x / 6 - 180));
        row.latitude = Math.max(-90, Math.min(90, 90 - p.y / 6));
      }
    }
  return draft;
}
export const fieldLabels: Record<string, string> = {
  label: "Name",
  latitude: "Latitude (degrees)",
  longitude: "Longitude (degrees)",
  daily_capacity: "Dispatch capacity (units/day)",
  annual_fixed_cost: "Annual fixed cost (INR/year)",
  holding_rate: "Annual holding rate (fraction)",
  handling_cost: "Handling cost (INR/unit)",
  price_multiplier: "Purchase price multiplier",
  lead_mean: "Mean transit lead (days)",
  lead_cv: "Transit lead CV",
  delay_probability: "Extra-delay probability",
  delay_days: "Extra delay (whole days)",
  moq: "Minimum order quantity (units)",
  pack_size: "Pack size (units)",
  unit_cost: "SKU unit cost (INR)",
  daily_mean: "Base customer demand (units/day)",
  cv: "Demand CV",
  region: "Region index",
  demand_scale: "Demand multiplier",
  arrival_probability: "B2B daily arrival probability",
  target_csl: "Cycle service target (fraction)",
  shortage_penalty: "Shortage penalty (INR/unit)",
  circuity: "Road distance multiplier",
  km_per_day: "Transport speed (km/day)",
  outbound_handling_days: "Outbound handling (days)",
  outbound_lead_cv: "Outbound lead CV",
  ltl_per_unit_km: "LTL rate (INR/unit/km)",
  ftl_capacity: "Truck capacity (units)",
  ftl_fixed_cost: "Truck fixed cost (INR/trip)",
  ftl_per_km: "Truck distance cost (INR/km)",
  dc_order_cost: "DC ordering cost (INR/order)",
  customer_order_cost: "Customer ordering cost (INR/order)",
  customer_holding_rate: "Customer holding rate (fraction/year)",
  review_days: "Periodic review interval (days)",
  initial_stock_fraction: "Initial stock / nominal target",
  distance_km: "Lane distance (km)",
};
