import { useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { StylesheetCSS } from "cytoscape";
import { networkElements, type Network } from "../lib/tower";
import { useTower } from "../lib/state";

export function Placement({
  network,
  geographic = false,
}: {
  network: Network;
  geographic?: boolean;
}) {
  const dark = useTower((state) => state.dark);
  const elements = useMemo(() => {
    const entries = networkElements(network);
    if (geographic)
      network.nodes.id.forEach((_, i) => {
        entries[i]!.position = {
          x: network.nodes.longitude[i]! * 40,
          y: -network.nodes.latitude[i]! * 40,
        };
      });
    return entries;
  }, [network, geographic]);
  const styles: StylesheetCSS[] = [
    {
      selector: "node",
      css: {
        width: 14,
        height: 14,
        shape: (node) => node.data("shape"),
        "background-color": "#2B5C8A",
        label: "data(label)",
        "font-size": 9,
        color: dark ? "#e4e4e7" : "#27272a",
        "text-margin-y": 5,
        "text-valign": "bottom",
      },
    },
    {
      selector: "edge",
      css: {
        width: 1,
        "line-color": "#a1a1aa",
        opacity: 0.6,
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#a1a1aa",
        "arrow-scale": 0.5,
      },
    },
  ];
  return (
    <div aria-label="Facility placement network">
      <CytoscapeComponent
        key={`${network.run_id}-${geographic}`}
        elements={elements}
        layout={{ name: "preset", padding: 35, fit: true }}
        stylesheet={styles}
        style={{ height: 340, width: "100%" }}
      />
    </div>
  );
}
