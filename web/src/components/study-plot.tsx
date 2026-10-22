import { useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart, HeatmapChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkAreaComponent,
  MarkPointComponent,
  MarkLineComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { useTower } from "../lib/state";
import { csv, download } from "../lib/tower";
import { Button } from "./ui/button";
echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkAreaComponent,
  MarkPointComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
]);

export function StudyPlot({
  title,
  option,
  rows,
  source,
  group,
  height = 320,
}: {
  title: string;
  option: EChartsOption;
  rows: (string | number | null)[][];
  source: string;
  group?: string;
  height?: number;
}) {
  const ref = useRef<ReactEChartsCore>(null);
  const dark = useTower((state) => state.dark);
  const settings: EChartsOption = {
    animation: false,
    backgroundColor: "transparent",
    aria: { enabled: true },
    color: [dark ? "#e4e4e7" : "#27272a", "#2B5C8A", "#a1a1aa"],
    textStyle: { fontFamily: "Inter", color: dark ? "#d4d4d8" : "#52525b", fontSize: 11 },
    grid: { left: 70, right: 25, bottom: 55, top: 45 },
    tooltip: { trigger: "axis" },
    ...option,
  };
  return (
    <section className="panel min-w-0 p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex">
          <Button
            variant="ghost"
            aria-label={`Export ${title} CSV`}
            onClick={() => download(`${title}.csv`, csv(rows))}
          >
            CSV ↓
          </Button>
          <Button
            variant="ghost"
            aria-label={`Export ${title} PNG`}
            onClick={() => {
              const link = document.createElement("a");
              link.href = ref.current!.getEchartsInstance().getDataURL({
                type: "png",
                pixelRatio: 2,
                backgroundColor: dark ? "#18181b" : "#fff",
              });
              link.download = `${title}.png`;
              link.click();
            }}
          >
            PNG ↓
          </Button>
        </div>
      </div>
      <ReactEChartsCore
        ref={ref}
        echarts={echarts}
        option={settings}
        notMerge
        style={{ height }}
        onChartReady={(chart: echarts.ECharts) => {
          if (group) {
            chart.group = group;
            echarts.connect(group);
          }
        }}
      />
      <p className="mt-2 text-[10px] leading-5 text-[var(--secondary)]">{source}</p>
    </section>
  );
}
