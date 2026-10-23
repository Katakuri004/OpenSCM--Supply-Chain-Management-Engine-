import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core, ElementDefinition, StylesheetCSS, EventObject } from "cytoscape";
import { Maximize, Minus, Plus, Download } from "lucide-react";
import { Button } from "../components/ui/button";
import { facilities, type BuilderRequest } from "../lib/builder";
import type { Schema } from "../lib/tower";
import { useTower } from "../lib/state";

export default function BuilderCanvas({
  request,
  preview,
  selected,
  select,
  move,
  connect,
  connecting,
}: {
  request: BuilderRequest;
  preview: Schema["ModelPreview"] | undefined;
  selected: string;
  select: (id: string) => void;
  move: (positions: Record<string, { x: number; y: number }>, geographic: boolean) => void;
  connect: (id: string) => void;
  connecting: boolean;
}) {
  const [cy, setCy] = useState<Core>();
  const [geographic, setGeographic] = useState(false);
  const dark = useTower((state) => state.dark);
  const callbacks = useRef({ select, move, connect, connecting, geographic });
  callbacks.current = { select, move, connect, connecting, geographic };
  useLayoutEffect(() => {
    cy?.resize();
  });
  const elements = useMemo(() => {
    const nodes = facilities(request);
    const open = new Set(request.model.spec.open_dcs ?? preview?.open_dcs ?? []);
    const groups = [
      nodes.filter((row) => row.kind === "supplier"),
      nodes.filter((row) => row.kind === "dc"),
      nodes.filter((row) => row.kind !== "supplier" && row.kind !== "dc"),
    ];
    const result: ElementDefinition[] = groups.flatMap((group, column) =>
      group.map((row, index) => ({
        data: {
          id: row.id,
          label: `${row.id}\n${row.label}`,
          kind: row.kind,
          open: row.kind !== "dc" || open.has(row.id) ? "yes" : "no",
          shape:
            row.kind === "supplier"
              ? "diamond"
              : row.kind === "dc"
                ? "rectangle"
                : row.kind === "b2b"
                  ? "hexagon"
                  : "ellipse",
        },
        position: geographic
          ? { x: (row.longitude + 180) * 6, y: (90 - row.latitude) * 6 }
          : (request.model.positions?.[row.id] ?? {
              x: 100 + column * 330 + Math.floor(index / 12) * 200,
              y: 70 + (index % 12) * 65,
            }),
      })),
    );
    const pairs = new Map<string, { source: string; target: string }>();
    if (preview)
      for (let index = 0; index < preview.network.edges.id.length; index++) {
        const source = preview.network.edges.source[index]!,
          target = preview.network.edges.target[index]!;
        pairs.set(`${source}|${target}`, { source, target });
      }
    else {
      for (const dc of open)
        for (const supplier of request.model.spec.suppliers)
          pairs.set(`${supplier.id}|${dc}`, { source: supplier.id, target: dc });
      for (const [target, source] of Object.entries(request.model.spec.assignments ?? {}))
        pairs.set(`${source}|${target}`, { source, target });
    }
    const ids = new Set(nodes.map((row) => row.id));
    for (const [id, pair] of pairs)
      if (ids.has(pair.source) && ids.has(pair.target))
        result.push({
          data: {
            id: `lane:${id}`,
            ...pair,
            label: request.model.spec.lanes?.some(
              (lane) => lane.source === pair.source && lane.target === pair.target,
            )
              ? "edited"
              : "",
          },
        });
    return result;
  }, [request, preview, geographic]);
  const style = useMemo<StylesheetCSS[]>(
    () => [
      {
        selector: "node",
        css: {
          shape: "data(shape)" as "ellipse",
          width: 30,
          height: 30,
          "background-color": dark ? "#71717a" : "#d4d4d8",
          "border-color": "#71717a",
          "border-width": 1,
          label: "data(label)",
          color: dark ? "#e4e4e7" : "#3f3f46",
          "font-size": 11,
          "text-wrap": "wrap",
          "text-valign": "bottom",
          "text-margin-y": 6,
        },
      },
      {
        selector: 'node[open = "no"]',
        css: { "background-opacity": 0.15, "border-style": "dashed" },
      },
      {
        selector: "edge",
        css: {
          "line-color": "#a1a1aa",
          "target-arrow-color": "#a1a1aa",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          width: 1.4,
          opacity: 0.6,
          label: "data(label)",
          "font-size": 9,
          color: dark ? "#e4e4e7" : "#52525b",
        },
      },
      {
        selector: ".inspected, :selected",
        css: {
          "border-color": "#2B5C8A",
          "border-width": 3,
          "line-color": "#2B5C8A",
          "target-arrow-color": "#2B5C8A",
          opacity: 1,
        },
      },
    ],
    [dark],
  );
  useEffect(() => {
    if (!cy) return;
    const tap = (event: EventObject) => {
      const id = event.target.id() as string;
      if (callbacks.current.connecting && event.target.isNode()) callbacks.current.connect(id);
      else callbacks.current.select(id);
    };
    const drag = (event: EventObject) => {
      callbacks.current.select(event.target.id() as string);
      const positions = Object.fromEntries(cy.nodes().map((row) => [row.id(), row.position()]));
      callbacks.current.move(positions, callbacks.current.geographic);
    };
    cy.on("tap", "node,edge", tap);
    cy.on("dragfree", "node", drag);
    cy.fit(undefined, 45);
    return () => {
      cy.off("tap", "node,edge", tap);
      cy.off("dragfree", "node", drag);
    };
  }, [cy]);
  useEffect(() => {
    if (cy) {
      cy.elements().removeClass("inspected");
      cy.getElementById(selected).addClass("inspected");
    }
  }, [cy, selected, elements]);
  const topologyKey = facilities(request)
    .map((row) => row.id)
    .join("|");
  useEffect(() => {
    if (cy) cy.fit(undefined, 45);
  }, [cy, geographic, topologyKey]);
  return (
    <section className="panel min-w-0 overflow-hidden" aria-label="Interactive model canvas">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-3">
        <label className="field">
          Layout
          <select
            aria-label="Builder layout"
            value={geographic ? "geographic" : "diagram"}
            onChange={(e) => setGeographic(e.target.value === "geographic")}
          >
            <option value="diagram">Echelon diagram</option>
            <option value="geographic">Geographic sketch</option>
          </select>
        </label>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Fit model canvas"
            onClick={() => cy?.fit(undefined, 45)}
          >
            <Maximize />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom model in"
            onClick={() => cy?.zoom(cy.zoom() * 1.3)}
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom model out"
            onClick={() => cy?.zoom(cy.zoom() / 1.3)}
          >
            <Minus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Export network diagram PNG"
            onClick={() => {
              if (cy) {
                const link = document.createElement("a");
                link.href = cy.png({
                  full: true,
                  maxWidth: 4096,
                  maxHeight: 4096,
                  bg: dark ? "#18181b" : "#fff",
                });
                link.download = "supply-chain-model.png";
                link.click();
              }
            }}
          >
            <Download />
          </Button>
        </div>
      </div>
      <div
        className="relative h-[560px]"
        data-testid="builder-canvas"
        data-node-count={
          request.model.spec.suppliers.length +
          request.model.spec.dcs.length +
          request.model.spec.customers.length
        }
      >
        <CytoscapeComponent
          elements={elements}
          layout={{ name: "preset", fit: false }}
          stylesheet={style}
          style={{ position: "absolute", inset: 0 }}
          cy={setCy}
          minZoom={0.1}
          maxZoom={5}
          wheelSensitivity={0.2}
          boxSelectionEnabled
        />
      </div>
      <p className="border-t border-[var(--border)] p-3 text-[10px] leading-5 text-[var(--secondary)]">
        Drag to{" "}
        {geographic
          ? "edit latitude/longitude (geographic sketch, no map tiles)"
          : "arrange the diagram; geography and transport distances stay unchanged"}
        . Scroll to zoom; shift-drag to select. Click facilities or lanes to inspect. Dashed squares
        are candidate DCs.{" "}
        {preview
          ? "Connections reflect the validated engine topology."
          : "Automatic routing awaits validation; explicit assignments remain visible."}
      </p>
    </section>
  );
}
