import { memo, useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type {
  Core,
  StylesheetCSS,
  EventObject,
  Css,
  NodeSingular,
  ElementDefinition,
} from "cytoscape";
import { Maximize, Minus, Plus, Download } from "lucide-react";
import { Button } from "./ui/button";
import { coverColor, networkElements, upstream, type Network, type Schema } from "../lib/tower";

const stylesheet: StylesheetCSS[] = [
  {
    selector: "node",
    css: {
      shape: (node) => node.data("shape") as Css.NodeShape,
      width: 22,
      height: 22,
      "background-color": "data(color)",
      "border-color": "#71717a",
      "border-width": 1,
      label: "data(label)",
      color: "#52525b",
      "font-family": "Inter",
      "font-size": 11,
      "text-valign": "center",
      "text-halign": "right",
      "text-margin-x": 7,
      opacity: (node: NodeSingular) => Number(node.data("opacity")),
    },
  },
  {
    selector: "edge",
    css: {
      width: "data(width)",
      "line-color": "#a1a1aa",
      "target-arrow-color": "#a1a1aa",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.6,
      "curve-style": "bezier",
      opacity: 0.45,
    },
  },
  { selector: ".selected", css: { "border-color": "#2B5C8A", "border-width": 3 } },
  { selector: ".hover-faded", css: { opacity: 0.12 } },
  {
    selector: ".upstream",
    css: { "line-color": "#2B5C8A", "target-arrow-color": "#2B5C8A", opacity: 1 },
  },
];

const Canvas = memo(function Canvas({
  elements,
  onReady,
}: {
  elements: ElementDefinition[];
  onReady: (cy: Core) => void;
}) {
  return (
    <CytoscapeComponent
      elements={elements}
      layout={{ name: "preset", fit: true, padding: 48 }}
      stylesheet={stylesheet}
      style={{ position: "absolute", inset: 0 }}
      cy={onReady}
      minZoom={0.15}
      maxZoom={3}
      wheelSensitivity={0.2}
    />
  );
});

export default function NetworkCanvas({
  network,
  health,
  day,
  matches,
  selected,
  onSelect,
  dark,
}: {
  network: Network;
  health: Schema["Health"];
  day: number;
  matches: string[] | null;
  selected: string;
  onSelect: (node: string) => void;
  dark: boolean;
}) {
  const [cy, setCy] = useState<Core>();
  const host = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const elements = useMemo(() => networkElements(network), [network]);
  const rows = useMemo(() => new Map(health.node_ids.map((id, i) => [id, i])), [health]);
  useEffect(() => {
    if (!cy) return;
    const click = (event: EventObject) => select.current(event.target.id());
    const hover = (event: EventObject) => {
      const path = upstream(network, event.target.id());
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          node.toggleClass("hover-faded", !path.has(node.id()));
        });
        cy.edges().forEach((edge) => {
          edge.toggleClass(
            "upstream",
            path.has(edge.source().id()) && path.has(edge.target().id()),
          );
        });
      });
    };
    const leave = () => cy.elements().removeClass("hover-faded upstream");
    cy.on("tap", "node", click);
    cy.on("mouseover", "node", hover);
    cy.on("mouseout", "node", leave);
    const resize = new ResizeObserver(() => {
      if (cy.destroyed()) return;
      cy.resize();
      cy.fit(undefined, 48);
    });
    if (host.current) resize.observe(host.current);
    return () => {
      resize.disconnect();
      cy.off("tap", "node", click);
      cy.off("mouseover", "node", hover);
      cy.off("mouseout", "node", leave);
    };
  }, [cy, network]);
  useEffect(() => {
    if (!cy) return;
    const column = health.days.indexOf(day);
    const start = performance.now();
    const allowed = matches === null ? null : new Set(matches);
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const row = rows.get(node.id());
        const stockout = row !== undefined && (health.stockout[row]?.[column] ?? false);
        const cover = row === undefined ? null : (health.days_of_cover[row]?.[column] ?? null);
        node.data({
          color: coverColor(cover, stockout),
          label: `${stockout ? "! " : ""}${node.id()}`,
          opacity: allowed === null || allowed.has(node.id()) ? 1 : 0.15,
        });
        node.toggleClass("selected", node.id() === selected);
      });
    });
    performance.measure("tower-health-update", { start, end: performance.now() });
  }, [cy, health, day, rows, matches, selected]);
  useEffect(() => {
    cy?.nodes().style("color", dark ? "#e4e4e7" : "#52525b");
  }, [cy, dark]);
  return (
    <div
      ref={host}
      className="relative min-h-[500px] flex-1"
      data-testid="network"
      data-node-count={network.nodes.id.length}
      data-day={day}
      aria-label={`Supply network, ${network.nodes.id.length} nodes. Use Inspect node for keyboard access.`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-5 z-10 flex justify-around text-[10px] font-semibold tracking-[.15em] text-[var(--secondary)]">
        <span>SUPPLIERS</span>
        <span>DISTRIBUTION CENTRES</span>
        <span>RETAILERS & B2B BUYERS</span>
      </div>
      <Canvas elements={elements} onReady={setCy} />
      <div className="absolute right-4 bottom-4 flex rounded-md border border-[var(--border)] bg-[var(--panel)] p-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          onClick={() => cy?.zoom(cy.zoom() * 1.2)}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => cy?.zoom(cy.zoom() / 1.2)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fit network"
          onClick={() => cy?.fit(undefined, 48)}
        >
          <Maximize />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Export network PNG"
          onClick={() => {
            if (!cy) return;
            const link = document.createElement("a");
            link.download = "supply-network.png";
            link.href = cy.png({ full: true, bg: dark ? "#18181b" : "#ffffff", scale: 2 });
            link.click();
          }}
        >
          <Download />
        </Button>
      </div>
    </div>
  );
}
