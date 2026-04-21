import ChartTooltip from "./ChartTooltip";
import type { TooltipState } from "../types/chart";
import type { RefObject } from "react";

interface ChartViewportProps {
  chartHostRef: RefObject<HTMLDivElement | null>;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  tooltip: TooltipState;
}

export default function ChartViewport({ chartHostRef, chartContainerRef, tooltip }: ChartViewportProps) {
  return (
    <div className="chart-host" ref={chartHostRef}>
      <div id="chart" ref={chartContainerRef} />
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}
