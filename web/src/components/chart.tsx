import { useEffect, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  ToolboxComponent,
  AriaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { Button } from "./ui/button";
import { csv, download, type Schema } from "../lib/tower";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  ToolboxComponent,
  AriaComponent,
  CanvasRenderer,
]);

export function Chart({
  series,
  day,
  reorder,
  quantity,
  dark,
  spark = false,
}: {
  series: Schema["TimeSeries"];
  day: number;
  reorder?: number | undefined;
  quantity?: number | undefined;
  dark: boolean;
  spark?: boolean;
}) {
  const chart = useRef<ReactEChartsCore>(null);
  const names = spark ? (["fill_rate"] as const) : (["on_hand", "on_order", "backorders"] as const);
  const labels = {
    on_hand: "On hand",
    on_order: "On order",
    backorders: "Backorders",
    fill_rate: "Daily fill rate",
  };
  const colors = [dark ? "#e4e4e7" : "#27272a", "#2B5C8A", "#a1a1aa"];
  const option: EChartsOption = {
    animation: false,
    aria: { enabled: true },
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter", color: dark ? "#a1a1aa" : "#71717a" },
    grid: spark
      ? { left: 0, right: 0, top: 3, bottom: 3 }
      : { left: 48, right: 16, top: 38, bottom: 32 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      valueFormatter: (value) =>
        value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
    },
    toolbox: {
      show: false,
      right: 0,
      feature: { saveAsImage: { title: "Export PNG", name: `inventory-${series.node_id}` } },
    },
    xAxis: {
      type: "category",
      data: series.days,
      show: !spark,
      boundaryGap: false,
      axisLabel: { fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      show: !spark,
      splitLine: { lineStyle: { color: dark ? "#3f3f46" : "#e4e4e7" } },
      axisLabel: { fontSize: 10 },
    },
    series: names.map((name, i) => ({
      name: labels[name],
      type: "line",
      showSymbol: false,
      lineStyle: { width: spark ? 1.3 : 1.5, type: i === 2 ? "dashed" : "solid" },
      itemStyle: { color: colors[i]! },
      data: series.metrics[name] ?? [],
      markLine:
        !spark && i === 0
          ? {
              symbol: "none",
              silent: true,
              label: { fontSize: 9, position: "insideEndTop" },
              data: [
                { xAxis: day, name: "Day", label: { formatter: "Day {c}" } },
                ...(reorder === undefined
                  ? []
                  : [{ yAxis: reorder, name: "Nominal ROP", label: { formatter: "ROP {c}" } }]),
                ...(quantity === undefined
                  ? []
                  : [{ yAxis: quantity, name: "Nominal Q", label: { formatter: "Q {c}" } }]),
              ],
            }
          : {},
    })),
  };
  useEffect(() => {
    if (!spark)
      chart.current
        ?.getEchartsInstance()
        .dispatchAction({ type: "updateAxisPointer", xAxisIndex: 0, value: day });
  }, [day, spark]);
  return (
    <div>
      <ReactEChartsCore
        ref={chart}
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: spark ? 32 : 260 }}
        opts={{ renderer: "canvas" }}
      />
      {spark && (
        <div className="flex justify-end gap-3 text-[9px] text-[var(--secondary)]">
          <button
            aria-label="Export fill CSV"
            onClick={() =>
              download(
                `fill-${series.node_id}.csv`,
                csv([
                  ["day", "fill_rate"],
                  ...series.days.map((value, i) => [value, series.metrics.fill_rate?.[i] ?? null]),
                ]),
              )
            }
          >
            CSV ↓
          </button>
          <button
            aria-label="Export fill PNG"
            onClick={() => {
              const link = document.createElement("a");
              link.href = chart.current!.getEchartsInstance().getDataURL({
                type: "png",
                pixelRatio: 2,
                backgroundColor: dark ? "#18181b" : "#ffffff",
              });
              link.download = `fill-${series.node_id}.png`;
              link.click();
            }}
          >
            PNG ↓
          </button>
        </div>
      )}
      {!spark && (
        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-xs text-[var(--secondary)]">
            {names.map((name, i) => (
              <span key={name}>
                <span style={{ color: colors[i]! }}>━ </span>
                {labels[name]}
              </span>
            ))}
          </div>
          <Button
            variant="ghost"
            aria-label="Export inventory CSV"
            onClick={() =>
              download(
                `inventory-${series.node_id}.csv`,
                csv([
                  ["day", ...names],
                  ...series.days.map((value, i) => [
                    value,
                    ...names.map((name) => series.metrics[name]?.[i] ?? null),
                  ]),
                ]),
              )
            }
          >
            CSV ↓
          </Button>
          <Button
            variant="ghost"
            aria-label="Export inventory PNG"
            onClick={() => {
              const link = document.createElement("a");
              link.href = chart.current!.getEchartsInstance().getDataURL({
                type: "png",
                pixelRatio: 2,
                backgroundColor: dark ? "#18181b" : "#ffffff",
              });
              link.download = `inventory-${series.node_id}.png`;
              link.click();
            }}
          >
            PNG ↓
          </Button>
        </div>
      )}
    </div>
  );
}
