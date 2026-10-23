import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Plus,
  Save,
  Undo2,
  Redo2,
  Cable,
  Download,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
} from "lucide-react";
import starter from "../fixtures/builder.json";
import { Button } from "../components/ui/button";
import { Feedback } from "../components/ui/feedback";
import { StudyPlot } from "../components/study-plot";
import { client, read } from "../lib/data";
import { csv, download, number, type Schema } from "../lib/tower";
import { useTower } from "../lib/state";
import {
  addFacility,
  connectCustomer,
  facilities,
  moveFacilities,
  syncNetwork,
  type BuilderRequest,
  type FacilityKind,
} from "../lib/builder";
import BuilderCanvas from "./builder-canvas";
import BuilderInspector, { Fields } from "./builder-inspector";
import LabControls from "./lab-controls";
import RunExplanation from "./run-explanation";

const sections = ["facilities", "skus", "lanes", "economics", "experiment", "import / export"];

export default function NetworkBuilder() {
  const { portfolio, set } = useTower();
  const cache = useQueryClient();
  const [history, setHistory] = useState<{ past: BuilderRequest[]; future: BuilderRequest[] }>({
    past: [structuredClone(starter.request) as BuilderRequest],
    future: [],
  });
  const request = history.past.at(-1)!,
    model = request.model,
    spec = model.spec;
  const [name, setName] = useState("Reference supply-chain model");
  const [notes, setNotes] = useState(
    "ASSUMPTION: synthetic network copied from the reference configuration. Review and document your custom inputs.",
  );
  const [saved, setSaved] = useState<Schema["SavedScenario"]>();
  const [selected, select] = useState("DC1");
  const [tab, setTab] = useState("facilities");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [json, setJson] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectionFrom, setConnectionFrom] = useState("");
  const [showResults, setShowResults] = useState(false);
  const apply = (value: BuilderRequest) =>
    setHistory((old) =>
      JSON.stringify(old.past.at(-1)) === JSON.stringify(value)
        ? old
        : { past: [...old.past.slice(-99), value], future: [] },
    );
  const undo = () =>
    setHistory((old) =>
      old.past.length > 1
        ? { past: old.past.slice(0, -1), future: [old.past.at(-1)!, ...old.future] }
        : old,
    );
  const redo = () =>
    setHistory((old) =>
      old.future.length
        ? { past: [...old.past, old.future[0]!], future: old.future.slice(1) }
        : old,
    );
  const dirty =
    !saved ||
    name !== saved.name ||
    notes !== saved.notes ||
    JSON.stringify(request) !== JSON.stringify(saved.request);
  const catalog = useQuery({
    queryKey: ["builder-catalog"],
    queryFn: async () => read(await client.GET("/models/catalog")),
  });
  const planning = useQuery({
    queryKey: ["lab-catalog"],
    queryFn: async () => read(await client.GET("/lab")),
  });
  const list = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => read(await client.GET("/portfolio")),
  });
  const models = list.data?.filter((row) => row.request.model) ?? [];
  const load = (row: Schema["SavedScenario"]) => {
    if (!row.request.model) return;
    setSaved(row);
    setName(row.name);
    setNotes(row.notes ?? "");
    setHistory({ past: [structuredClone(row.request) as BuilderRequest], future: [] });
    select(row.request.model.spec.dcs[0]!.id);
    set({ portfolio: row.id });
    setEditError("");
    setNotice("Loaded the saved model and its exact request snapshot.");
  };
  useEffect(() => {
    if (!saved && portfolio) {
      const row = list.data?.find((row) => row.id === portfolio && row.request.model);
      if (row) load(row);
    }
  }, [list.data, portfolio, saved]);
  useEffect(() => {
    const handle = (event: BeforeUnloadEvent) => {
      if (dirty && history.past.length > 1) event.preventDefault();
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [dirty, history.past.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !(
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
        )
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const physicsJson = JSON.stringify({ ...request, model: { ...model, positions: {} } });
  const [debounced, setDebounced] = useState(physicsJson);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(physicsJson), 350);
    return () => clearTimeout(timer);
  }, [physicsJson]);
  const preview = useQuery({
    queryKey: ["builder-preview", physicsJson],
    queryFn: async () =>
      read(
        await client.POST("/models/preview", {
          body: JSON.parse(physicsJson) as Schema["RunRequest"],
        }),
      ),
    enabled: debounced === physicsJson,
    retry: false,
  });
  const persist = useMutation({
    onMutate: () => {
      setEditError("");
      setNotice("");
    },
    onError: (error: Error) => setEditError(error.message),
    mutationFn: async (clone: boolean) => {
      const body = { name, notes, request };
      return saved && !clone
        ? read(
            await client.PUT("/portfolio/{scenario_id}", {
              params: { path: { scenario_id: saved.id } },
              body: { ...body, revision: saved.revision },
            }),
          )
        : read(await client.POST("/portfolio", { body }));
    },
    onSuccess: (value) => {
      setSaved(value);
      apply(value.request as BuilderRequest);
      cache.setQueryData<Schema["SavedScenario"][]>(["portfolio"], (old) => [
        value,
        ...(old ?? []).filter((row) => row.id !== value.id),
      ]);
      set({ portfolio: value.id });
      void cache.invalidateQueries({ queryKey: ["builder-revisions", value.id] });
      setNotice(`Saved revision ${value.revision} on this server.`);
    },
  });
  const revisions = useQuery({
    queryKey: ["builder-revisions", saved?.id],
    enabled: !!saved,
    queryFn: async () =>
      read(
        await client.GET("/portfolio/{scenario_id}/revisions", {
          params: { path: { scenario_id: saved!.id } },
        }),
      ),
  });
  const runs = useQuery({
    queryKey: ["portfolio-history", saved?.id],
    enabled: !!saved,
    queryFn: async () =>
      read(
        await client.GET("/portfolio/{scenario_id}/runs", {
          params: { path: { scenario_id: saved!.id } },
        }),
      ),
    refetchInterval: (query) =>
      query.state.data?.some((row) => ["queued", "running"].includes(row.status.status))
        ? 500
        : false,
  });
  const launch = useMutation({
    onMutate: () => {
      setEditError("");
      setNotice("");
    },
    onError: (error: Error) => setEditError(error.message),
    mutationFn: async () =>
      read(
        await client.POST("/portfolio/{scenario_id}/runs", {
          params: { path: { scenario_id: saved!.id } },
          body: { revision: saved!.revision },
        }),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["portfolio-history", saved!.id] });
      setShowResults(true);
    },
  });
  const completed = runs.data?.find((row) => row.status.status === "complete");
  const importModel = useMutation({
    onMutate: () => {
      setEditError("");
      setNotice("");
    },
    onError: (error: Error) => setEditError(error.message),
    mutationFn: async (text: string) => {
      const value = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        value.format === "openscm-model-v1"
          ? value.request
          : value.spec
            ? { ...starter.request, model: value }
            : value;
      const checked = read(
        await client.POST("/lab/validate", { body: candidate as Schema["RunRequest"] }),
      );
      if (!checked.model)
        throw new Error("Import a model snapshot or a RunRequest containing model.");
      const importedName =
          typeof value.name === "string" ? value.name : "Imported supply-chain model",
        importedNotes =
          typeof value.notes === "string"
            ? value.notes
            : "ASSUMPTION: imported model; review its input sources.";
      if (!importedName.trim() || importedName.length > 100 || importedNotes.length > 10000)
        throw new Error(
          "Model name must contain 1–100 characters; notes must be at most 10000 characters.",
        );
      return { request: checked as BuilderRequest, name: importedName, notes: importedNotes };
    },
    onSuccess: (value) => {
      apply(value.request);
      setName(value.name);
      setNotes(value.notes);
      setSaved(undefined);
      set({ portfolio: "" });
      setNotice("Imported and validated as a new model draft. Save to persist it.");
      setEditError("");
    },
  });
  const report = (message: string) => {
    setEditError(message);
    setNotice("");
  };
  const perform = (action: () => void) => {
    try {
      action();
      setEditError("");
    } catch (error) {
      report(error instanceof Error ? error.message : "Unable to edit this model.");
    }
  };
  const open = spec.open_dcs ?? preview.data?.open_dcs ?? [];
  const rows = facilities(request).filter((row) =>
    `${row.id} ${row.label} ${row.kind}`.toLowerCase().includes(search.toLowerCase()),
  );
  const cells =
    (spec.suppliers.length +
      (request.overrides?.network?.dc_count ??
        spec.open_dcs?.length ??
        Math.min(4, spec.dcs.length)) +
      spec.customers.length) *
    spec.skus.length *
    ((request.overrides?.warmup_days ?? 90) + (request.overrides?.horizon_days ?? 365));
  const busy =
    persist.isPending ||
    importModel.isPending ||
    launch.isPending ||
    runs.data?.some((row) => ["queued", "running"].includes(row.status.status));
  const error = list.error ?? revisions.error ?? runs.error;
  const add = (kind: FacilityKind) =>
    perform(() => {
      const value = addFacility(request, kind);
      const added =
        kind === "supplier"
          ? value.model.spec.suppliers
          : kind === "dc"
            ? value.model.spec.dcs
            : value.model.spec.customers;
      apply(value);
      select(added.at(-1)!.id);
      setNotice("Added a copy of a reference row. Review its synthetic assumptions.");
    });
  return (
    <div className="space-y-5">
      <section className="workspace-callout">
        <div>
          <p className="eyebrow">DESIGN / VALIDATE / SIMULATE</p>
          <h2 className="mt-2 text-xl font-semibold">Build the supply chain you want to study</h2>
          <p className="lab-help">
            Edit a supported supplier → DC → retailer/B2B network. Your model is embedded in every
            run: master data, sourcing, routes, economics and seasonality. Drag the canvas, inspect
            a row, validate the topology, then run the actual engine.
          </p>
        </div>
        <span className="module-tag model-save-state" data-dirty={dirty}>
          {saved ? `Revision ${saved.revision}` : "New model"} ·{" "}
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
      </section>
      <section className="panel p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="lab-field">
            <span>Saved model library</span>
            <select
              aria-label="Saved model library"
              value={saved?.id ?? ""}
              onChange={(e) => {
                const row = models.find((row) => row.id === e.target.value);
                if (row) load(row);
              }}
            >
              <option value="">New model draft</option>
              {models.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · r{row.revision}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            <span>Model name</span>
            <input
              aria-label="Model name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <label className="lab-field mt-4">
          <span>Input sources / assumptions / design notes</span>
          <textarea
            aria-label="Model assumptions"
            rows={2}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            aria-label="Save network model"
            loading={persist.isPending}
            disabled={busy || !name.trim()}
            onClick={() => persist.mutate(false)}
          >
            <Save />
            Save model
          </Button>
          <Button
            variant="outline"
            disabled={busy || !name.trim()}
            loading={persist.isPending}
            onClick={() => persist.mutate(true)}
          >
            Save as new model
          </Button>
          <Button
            aria-label="Run saved network model"
            loading={launch.isPending}
            disabled={busy || dirty || !saved}
            onClick={() => launch.mutate()}
          >
            Run saved model
            <ArrowRight />
          </Button>
          <Button
            variant="outline"
            disabled={!saved}
            onClick={() => set({ view: "portfolio", portfolio: saved!.id })}
          >
            Open in Planning Lab
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              apply(structuredClone((catalog.data ?? starter).request) as BuilderRequest);
              setSaved(undefined);
              set({ portfolio: "" });
              setName("New reference model");
              select("DC1");
              setNotice(
                "Started from the reference configuration. Undo can recover the prior draft.",
              );
            }}
          >
            New from reference
          </Button>
        </div>
        {saved && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="field">
              Revision history
              <select
                aria-label="Model revision history"
                value=""
                onChange={(e) => {
                  const old = revisions.data?.find(
                    (row) => row.revision === Number(e.target.value),
                  );
                  if (old?.request.model) {
                    apply(structuredClone(old.request) as BuilderRequest);
                    setName(old.name);
                    setNotes(old.notes ?? "");
                    setNotice(
                      `Loaded revision ${old.revision} as a draft; saving creates a new revision.`,
                    );
                  }
                }}
              >
                <option value="">Inspect or restore a revision</option>
                {revisions.data?.map((row) => (
                  <option key={row.revision} value={row.revision}>
                    r{row.revision} · {new Date(row.updated_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                void list.refetch().then((result) => {
                  if (result.error) return;
                  const row = result.data?.find((row) => row.id === saved.id);
                  if (row) load(row);
                });
              }}
            >
              Reload server model
            </Button>
          </div>
        )}
      </section>
      {(editError || error) && (
        <Feedback kind="error" label="Builder workspace error" key={editError || error?.message}>
          {editError || error?.message}
        </Feedback>
      )}
      {notice && (
        <Feedback kind="success" key={notice}>
          {notice}
        </Feedback>
      )}
      <section className="panel flex flex-wrap items-center gap-2 p-3">
        <Button variant="outline" onClick={() => add("supplier")}>
          <Plus />
          Supplier
        </Button>
        <Button variant="outline" onClick={() => add("dc")}>
          <Plus />
          DC candidate
        </Button>
        <Button variant="outline" onClick={() => add("customer")}>
          <Plus />
          Customer
        </Button>
        <Button
          variant="outline"
          aria-label="Undo model edit"
          disabled={history.past.length < 2}
          onClick={undo}
        >
          <Undo2 />
          Undo
        </Button>
        <Button
          variant="outline"
          aria-label="Redo model edit"
          disabled={!history.future.length}
          onClick={redo}
        >
          <Redo2 />
          Redo
        </Button>
        <Button
          variant={connecting ? "default" : "outline"}
          aria-pressed={connecting}
          onClick={() => {
            setConnecting(!connecting);
            setConnectionFrom("");
          }}
        >
          <Cable />
          Connect DC → customer
        </Button>
        <span className="ml-auto mono text-[10px] text-[var(--secondary)]">
          {facilities(request).length} facilities · {spec.skus.length} SKUs ·{" "}
          {spec.lanes?.length ?? 0} lane overrides
        </span>
      </section>
      {connecting && (
        <Feedback>
          {connectionFrom
            ? `Source ${connectionFrom}: click the retailer or B2B buyer to reassign.`
            : "Click an open DC, then its customer. This changes physical replenishment routing."}
        </Feedback>
      )}
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <BuilderCanvas
          request={request}
          preview={preview.data}
          selected={selected}
          select={select}
          connecting={connecting}
          connect={(id) =>
            perform(() => {
              if (!connectionFrom) {
                if (!open.includes(id)) throw new Error("Start with an open distribution centre.");
                setConnectionFrom(id);
                select(id);
              } else {
                apply(connectCustomer(request, connectionFrom, id, open));
                select(id);
                setConnectionFrom("");
                setConnecting(false);
                setNotice(`Assigned ${id} to ${connectionFrom}.`);
              }
            })
          }
          move={(positions, geographic) => {
            apply(moveFacilities(request, positions, geographic));
          }}
        />
        <div
          key={selected}
          className="motion-inspector min-w-0"
          data-testid="builder-inspector-transition"
          data-selection={selected}
        >
          <BuilderInspector
            request={request}
            selected={selected}
            preview={preview.data}
            change={apply}
            select={select}
            report={report}
          />
        </div>
      </div>
      <section className="panel p-4" aria-label="Model validation">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="validation-marker font-semibold" aria-live="polite">
            {preview.error ? (
              <CircleAlert size={18} aria-hidden="true" />
            ) : preview.data ? (
              <CircleCheck size={18} aria-hidden="true" className="motion-check" />
            ) : (
              <LoaderCircle size={18} aria-hidden="true" className="motion-spinner" />
            )}
            {preview.error
              ? "Model needs attention"
              : preview.data
                ? "Validated engine topology"
                : "Validating model…"}
          </h2>
          <span className="mono text-xs">
            {number(cells, 0)} /{" "}
            {number(catalog.data?.max_observation_cells ?? starter.max_observation_cells, 0)}{" "}
            observation cells
          </span>
        </div>
        <p className="lab-help">
          {preview.data
            ? `${preview.data.open_dcs.length} open DCs · ${preview.data.network.edges.id.length} directed lanes · ${spec.customers.length} demand nodes. Preview validates inputs and derives routing; it does not execute a simulation.`
            : "Edit checks use the same contracts and physical resolver as a simulation."}
        </p>
        {preview.error && (
          <p role="alert" aria-label="Builder validation error" className="mt-3 text-sm">
            {preview.error.message}{" "}
            <Button variant="outline" onClick={() => void preview.refetch()}>
              Retry validation
            </Button>
          </p>
        )}
        {preview.data?.warnings.map((message) => (
          <p className="lab-help" key={message}>
            {message}
          </p>
        ))}
        {catalog.error && (
          <p className="lab-help">
            Reference starter remains editable. Connect the simulation API to validate, save and
            run.{" "}
            <Button
              variant="ghost"
              onClick={() => {
                void catalog.refetch();
                void list.refetch();
              }}
            >
              Retry server
            </Button>
          </p>
        )}
      </section>
      <div className="builder-section-tabs" role="tablist" aria-label="Builder data sections">
        {sections.map((value, index) => (
          <Button
            key={value}
            id={`builder-tab-${index}`}
            role="tab"
            variant="ghost"
            aria-selected={tab === value}
            aria-controls="builder-data-panel"
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const targets: Record<string, number> = {
                Home: 0,
                End: sections.length - 1,
                ArrowRight: (index + 1) % sections.length,
                ArrowLeft: (index + sections.length - 1) % sections.length,
              };
              const next = targets[event.key];
              if (next === undefined) return;
              event.preventDefault();
              setTab(sections[next]!);
              document.getElementById(`builder-tab-${next}`)?.focus();
            }}
          >
            {value === "skus" ? "SKU master" : value[0]!.toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>
      <div
        key={tab}
        id="builder-data-panel"
        role="tabpanel"
        aria-labelledby={`builder-tab-${sections.indexOf(tab)}`}
        tabIndex={0}
        className="motion-content min-w-0"
      >
        {tab === "facilities" && (
          <section className="panel p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                aria-label="Search model facilities"
                placeholder="Search facility, ID or echelon…"
                className="min-w-0 flex-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="field">
                <input
                  type="checkbox"
                  aria-label="Choose DCs automatically"
                  checked={!spec.open_dcs}
                  onChange={(e) => {
                    const draft = structuredClone(request);
                    draft.model.spec.open_dcs = e.target.checked
                      ? null
                      : (preview.data?.open_dcs ??
                        spec.dcs
                          .slice(0, request.overrides?.network?.dc_count ?? 4)
                          .map((row) => row.id));
                    apply(syncNetwork(draft));
                  }}
                />
                Choose DCs automatically
              </label>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    "model-facilities.csv",
                    csv([
                      ["id", "name", "echelon", "latitude", "longitude", "resolved_open"],
                      ...rows.map((row) => [
                        row.id,
                        row.label,
                        row.kind,
                        row.latitude,
                        row.longitude,
                        row.kind === "dc" ? (open.includes(row.id) ? "yes" : "candidate") : "yes",
                      ]),
                    ]),
                  )
                }
              >
                CSV
              </Button>
            </div>
            <p className="lab-help mb-3">
              Automatic DC selection uses demand-distance k-median and nearest-open-DC assignments.
              Manual customer assignments override the nearest route. Inspect a row to edit every
              supported parameter.
            </p>
            <div className="max-h-96 overflow-auto">
              <table className="operations-table" aria-label="Model facility master">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Echelon</th>
                    <th>Coordinates</th>
                    <th>Operating status</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} aria-selected={selected === row.id}>
                      <td>
                        {row.id} · {row.label}
                      </td>
                      <td>{row.kind}</td>
                      <td className="mono">
                        {number(row.latitude, 3)}, {number(row.longitude, 3)}
                      </td>
                      <td>
                        {row.kind === "dc"
                          ? open.includes(row.id)
                            ? "Open DC"
                            : "Candidate"
                          : row.kind === "supplier"
                            ? "Configured supplier"
                            : `DC: ${preview.data?.assignments[row.id] ?? spec.assignments?.[row.id] ?? "Auto / pending"}`}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          aria-label={`Inspect model facility ${row.id}`}
                          onClick={() => select(row.id)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "skus" && (
          <section className="panel p-4">
            <div className="mb-4 flex flex-wrap justify-between gap-3">
              <h2 className="font-semibold">SKU master and primary sourcing</h2>
              <Button
                variant="outline"
                onClick={() => {
                  const draft = structuredClone(request);
                  let index = 1;
                  while (spec.skus.some((row) => row.id === `SKU${index}`)) index++;
                  const id = `SKU${index}`;
                  draft.model.spec.skus.push({
                    ...spec.skus[0]!,
                    id,
                    label: `${spec.skus[0]!.label} copy`,
                  });
                  apply(draft);
                  select(`sku:${id}`);
                }}
              >
                Add SKU from reference row
              </Button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="operations-table" aria-label="Model SKU master">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Supplier</th>
                    <th>Mean / CV</th>
                    <th>Unit cost</th>
                    <th>MOQ / pack</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.skus.map((row) => (
                    <tr key={row.id} aria-selected={selected === `sku:${row.id}`}>
                      <td>
                        {row.id} · {row.label}
                      </td>
                      <td>
                        <select
                          aria-label={`Primary supplier for ${row.id}`}
                          value={row.supplier}
                          onChange={(e) => {
                            const draft = structuredClone(request);
                            draft.model.spec.skus.find((item) => item.id === row.id)!.supplier =
                              e.target.value;
                            apply(draft);
                          }}
                        >
                          {spec.suppliers.map((supplier) => (
                            <option key={supplier.id}>{supplier.id}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {row.daily_mean} / {row.cv}
                      </td>
                      <td>{row.unit_cost} INR</td>
                      <td>
                        {row.moq} / {row.pack_size}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          aria-label={`Inspect model SKU ${row.id}`}
                          onClick={() => select(`sku:${row.id}`)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "lanes" && (
          <section className="panel p-4">
            <h2 className="font-semibold">Resolved directed lanes</h2>
            <p className="lab-help">
              Supplier → open DC lanes are available for SKU sourcing and backup supply. Each
              customer has one replenishment DC. Click a lane to override its distance, lead
              distribution or delay assumptions. Unused lane overrides remain visible in validation
              warnings.
            </p>
            <div className="mt-4 max-h-96 overflow-auto">
              <table className="operations-table" aria-label="Model resolved lanes">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Road km</th>
                    <th>Mean / CV</th>
                    <th>Delay probability / days</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data?.lanes.map((row) => (
                    <tr key={`${row.source}|${row.target}`}>
                      <td>
                        {row.source} → {row.target}
                      </td>
                      <td>{number(row.distance_km, 2)}</td>
                      <td>
                        {number(row.lead_mean, 2)} / {row.lead_cv}
                      </td>
                      <td>
                        {row.delay_probability} / {row.delay_days}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          aria-label={`Inspect model lane ${row.source} to ${row.target}`}
                          onClick={() => select(`lane:${row.source}|${row.target}`)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "economics" && (
          <section className="panel space-y-5 p-5">
            <div>
              <h2 className="mb-4 font-semibold">Transport economics</h2>
              <Fields
                row={spec.transport}
                prefix="Transport"
                change={(patch) => {
                  const draft = structuredClone(request);
                  Object.assign(draft.model.spec.transport, patch);
                  apply(draft);
                }}
              />
            </div>
            <div>
              <h2 className="mb-4 font-semibold">Inventory economics and initialization</h2>
              <Fields
                row={spec.inventory}
                prefix="Inventory"
                change={(patch) => {
                  const draft = structuredClone(request);
                  Object.assign(draft.model.spec.inventory, patch);
                  apply(draft);
                }}
              />
            </div>
            <p className="lab-help">
              Costs use INR and the engine's operating ledger. Initial-stock acquisition is
              excluded. Annual holding rates, ordering charges and capacity are assumptions, not
              inferred operational recommendations.
            </p>
          </section>
        )}
        {tab === "experiment" && (
          <section className="panel p-5">
            <h2 className="font-semibold">Run design and operating overrides</h2>
            <p className="lab-help">
              Snapshot master data are the base; lab overrides apply afterwards and are recorded in
              provenance. Seasonal controls override the snapshot profile when supplied. Use the
              builder to change explicit open DCs.
            </p>
            {planning.data ? (
              <LabControls
                request={request}
                change={(value) => apply(value as BuilderRequest)}
                catalog={planning.data}
              />
            ) : (
              <p className="lab-help">Connect the API to load experiment controls.</p>
            )}
          </section>
        )}
        {tab === "import / export" && (
          <section className="panel p-5">
            <h2 className="font-semibold">Versioned model exchange</h2>
            <p className="lab-help">
              Import opens a new draft after server validation. Accepts an openscm-model-v1 package,
              full RunRequest, or format_version=1 ModelSnapshot. JSON only; maximum 2 MB. Downloads
              preserve input sources, the snapshot and diagram positions.
            </p>
            <div className="my-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    "supply-chain-model.json",
                    JSON.stringify({ format: "openscm-model-v1", name, notes, request }, null, 2),
                    "application/json",
                  )
                }
              >
                <Download />
                Export model package
              </Button>
              <Button variant="outline" onClick={() => setJson(JSON.stringify(request, null, 2))}>
                Edit current request JSON
              </Button>
              <label className="lab-field">
                <span>Import model file</span>
                <input
                  type="file"
                  aria-label="Import model file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2000000) {
                      report("Model file exceeds 2 MB.");
                      return;
                    }
                    void file
                      .text()
                      .then((text) => importModel.mutate(text))
                      .catch(() => report("Unable to read the model file."));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <textarea
              className="mono min-h-64 w-full text-xs"
              aria-label="Model import JSON"
              value={json}
              maxLength={2000000}
              onChange={(e) => setJson(e.target.value)}
            />
            <Button
              className="mt-3"
              disabled={importModel.isPending || !json.trim()}
              loading={importModel.isPending}
              onClick={() => importModel.mutate(json)}
            >
              Validate and import model
            </Button>
          </section>
        )}
      </div>
      <StudyPlot
        title="Configured DC dispatch capacity"
        rows={[
          ["dc_id", "capacity_units_per_day", "open"],
          ...spec.dcs.map((row) => [
            row.id,
            row.daily_capacity,
            open.includes(row.id) ? "yes" : "candidate",
          ]),
        ]}
        source="Model input assumptions, units/day; these bars are configured capacity, not achieved dispatch. Candidate DCs contribute to a run only if selected."
        option={{
          xAxis: { type: "category", data: spec.dcs.map((row) => row.id) },
          yAxis: { type: "value", name: "units/day" },
          series: [
            {
              type: "bar",
              data: spec.dcs.map((row) => ({
                value: row.daily_capacity,
                itemStyle: { color: open.includes(row.id) ? "#2B5C8A" : "#a1a1aa" },
              })),
            },
          ],
        }}
        height={240}
      />
      {runs.data?.length ? (
        <section className="panel p-5">
          <h2 className="font-semibold">Model run history</h2>
          <p className="lab-help">
            Launch snapshots retain their exact model revision. New revisions do not relabel older
            results.
          </p>
          <div className="mt-4 max-h-60 overflow-auto">
            <table className="operations-table" aria-label="Model run history">
              <thead>
                <tr>
                  <th>Revision / launch</th>
                  <th>Status</th>
                  <th>Seed / replications</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      r{row.revision} · {new Date(row.launched_at).toLocaleString()}
                    </td>
                    <td data-testid="builder-run-status">
                      {row.status.status}
                      {row.status.error && <p className="lab-help">{row.status.error}</p>}
                    </td>
                    <td>
                      {row.request.seed} / {row.request.replications}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={row.status.status !== "complete"}
                        onClick={() =>
                          set({
                            view: "tower",
                            mode: "live",
                            run: row.status.run_id,
                            node: row.request.model?.spec.customers[0]!.id ?? "R01",
                            day: row.request.overrides?.warmup_days ?? 90,
                          })
                        }
                      >
                        Inspect run
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          download(
                            "model-execution.json",
                            JSON.stringify(row, null, 2),
                            "application/json",
                          )
                        }
                      >
                        Snapshot
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {completed && (
            <Button className="mt-4" variant="outline" onClick={() => setShowResults(!showResults)}>
              {showResults ? "Hide" : "Show"} latest completed diagnostics
            </Button>
          )}
        </section>
      ) : (
        <p className="panel p-4 text-xs text-[var(--secondary)]">
          Save and run a model to generate actual results. Preview and capacity charts describe
          inputs.
        </p>
      )}
      {completed && showResults && (
        <>
          <p className="text-xs text-[var(--secondary)]">
            Diagnostics below belong to r{completed.revision}, run{" "}
            {completed.status.run_id.slice(0, 16)}.{" "}
            {dirty ? "The current draft has unsaved changes." : ""}
          </p>
          <RunExplanation runId={completed.status.run_id} />
        </>
      )}
    </div>
  );
}
