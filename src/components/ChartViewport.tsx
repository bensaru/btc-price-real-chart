import ChartTooltip from "./ChartTooltip";
import type { ChartEngine, TooltipState } from "../types/chart";
import type { RefObject } from "react";

interface ChartViewportProps {
  chartEngine: ChartEngine;
  chartHostRef: RefObject<HTMLDivElement | null>;
  chartContainerRef: RefObject<HTMLDivElement | null>;
  tooltip: TooltipState;
  tradingViewSrc: string;
}

export default function ChartViewport({
  chartEngine,
  chartHostRef,
  chartContainerRef,
  tooltip,
  tradingViewSrc
}: ChartViewportProps) {
  return (
    <div className="chart-host" ref={chartHostRef}>
      <div
        id="chart"
        ref={chartContainerRef}
        style={{ display: chartEngine === "simple" ? "block" : "none" }}
      />
      {chartEngine === "simple" && <ChartTooltip tooltip={tooltip} />}
      {chartEngine === "tradingview" && (
        <iframe title="TradingView BTCUSD Chart" className="tv-frame" src={tradingViewSrc} />
      )}
    </div>
  );
}
