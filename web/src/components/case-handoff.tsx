import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { client, read } from "../lib/data";
import { caseDefinition, starterCase } from "../lib/cases";
import { useTower } from "../lib/state";
import type { Schema } from "../lib/tower";

export function CaseHandoff({
  request,
  name,
  load,
}: {
  request: Schema["RunRequest"];
  name: string;
  load?: (request: Schema["RunRequest"]) => void;
}) {
  const { decisionCase, caseSide, set } = useTower();
  const cache = useQueryClient();
  const loading = useMutation({
    mutationFn: async () => {
      const detail = read(
        await client.GET("/cases/{identity}", { params: { path: { identity: decisionCase } } }),
      );
      return caseSide === "a" ? detail.case.baseline : detail.case.alternative;
    },
    onSuccess: (value) => load?.(value),
  });
  const transfer = useMutation({
    mutationFn: async () => {
      if (!decisionCase)
        return read(
          await client.POST("/cases", {
            body: {
              ...starterCase(),
              name,
              question: "Which operating plan meets our service, cost and inventory goals?",
              baseline: request,
              alternative: request,
            },
          }),
        );
      const detail = read(
        await client.GET("/cases/{identity}", { params: { path: { identity: decisionCase } } }),
      );
      const other = caseSide === "a" ? detail.case.alternative : detail.case.baseline;
      // The experiment design is shared across both conditions; the operating assumptions are not.
      const aligned = {
        ...other,
        seed: request.seed ?? 0,
        replications: request.replications ?? 1,
        overrides: {
          ...other.overrides,
          warmup_days: request.overrides?.warmup_days ?? null,
          horizon_days: request.overrides?.horizon_days ?? null,
        },
      };
      return read(
        await client.PUT("/cases/{identity}", {
          params: { path: { identity: decisionCase } },
          body: {
            ...caseDefinition(detail.case),
            revision: detail.case.revision,
            baseline: caseSide === "a" ? request : aligned,
            alternative: caseSide === "b" ? request : aligned,
          },
        }),
      );
    },
    onSuccess: (value) => {
      cache.setQueryData<Schema["CaseDetail"]>(["case", value.id], (previous) => ({
        case: value,
        imported_evidence: previous?.imported_evidence ?? null,
      }));
      void cache.invalidateQueries({ queryKey: ["cases"] });
      void cache.invalidateQueries({ queryKey: ["case", value.id] });
      set({ view: "cases", decisionCase: value.id, caseExecution: "" });
    },
  });
  return (
    <div className="space-y-2">
      {decisionCase && load && (
        <Button
          className="mr-2"
          variant="outline"
          disabled={loading.isPending}
          onClick={() => loading.mutate()}
        >
          Load saved case condition {caseSide.toUpperCase()}
        </Button>
      )}
      <Button
        variant="outline"
        loading={transfer.isPending}
        disabled={transfer.isPending}
        onClick={() => transfer.mutate()}
      >
        {decisionCase ? `Use as case condition ${caseSide.toUpperCase()}` : "Start decision case"}
      </Button>
      {decisionCase && (
        <p className="lab-help">
          Copies this request into the saved case and aligns its seed, replications and observation
          window. Facility and SKU masters must match the other condition.
        </p>
      )}
      {(transfer.error || loading.error) && (
        <p role="alert" className="text-xs">
          {(transfer.error ?? loading.error)?.message}
        </p>
      )}
    </div>
  );
}

export function CaseContext() {
  const { decisionCase, caseExecution, caseSide, view, mode, run, set } = useTower();
  const detail = useQuery({
    queryKey: ["case", decisionCase],
    enabled: !!decisionCase && view !== "cases",
    queryFn: async () =>
      read(await client.GET("/cases/{identity}", { params: { path: { identity: decisionCase } } })),
  });
  const history = useQuery({
    queryKey: ["case-history", decisionCase],
    enabled: !!decisionCase && !!caseExecution && view !== "cases",
    queryFn: async () =>
      read(
        await client.GET("/cases/{identity}/runs", {
          params: { path: { identity: decisionCase } },
        }),
      ),
  });
  if (!decisionCase || view === "cases") return null;
  const reference = !["tower", "overview", "exceptions", "builder", "portfolio"].includes(view);
  const execution = history.data?.find((r) => r.id === caseExecution);
  const actualSide =
    mode === "live" && execution
      ? execution.run_a === run
        ? "A"
        : execution.run_b === run
          ? "B"
          : null
      : null;
  return (
    <section
      aria-label="Active decision case"
      className="panel mx-6 mt-4 flex flex-wrap items-center gap-3 p-3 text-xs"
    >
      <strong>{detail.data?.case.name ?? "Decision case active"}</strong>
      <Button variant="outline" onClick={() => set({ view: "cases" })}>
        Return to case
      </Button>
      <label>
        Editing condition{" "}
        <select
          aria-label="Case condition"
          value={caseSide}
          onChange={(e) => set({ caseSide: e.target.value as "a" | "b" })}
        >
          <option value="a">A · baseline</option>
          <option value="b">B · alternative</option>
        </select>
      </label>
      <span className="text-[var(--secondary)]">
        {reference
          ? "Reference example · this module does not display the active case run."
          : view === "builder" || view === "portfolio"
            ? "Use the handoff action to save your draft into this case."
            : actualSide
              ? `Showing condition ${actualSide} · execution snapshot r${execution!.snapshot.revision}. Return to the case for paired evidence.`
              : mode === "fixture"
                ? "Recorded reference example · not the active case execution."
                : "Standalone run · this view is not showing the selected case execution."}
      </span>
      <Button variant="ghost" onClick={() => set({ decisionCase: "", caseExecution: "" })}>
        Leave case
      </Button>
    </section>
  );
}
