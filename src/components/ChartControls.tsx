import type { ChartEngine, Metric, TimeWindowOption } from "../types/chart";
import type { Dispatch, SetStateAction } from "react";

interface ChartControlsProps {
  metric: Metric;
  setMetric: Dispatch<SetStateAction<Metric>>;
  visibleWindowSeconds: number;
  setVisibleWindowSeconds: Dispatch<SetStateAction<number>>;
  timeWindowOptions: TimeWindowOption[];
  chartEngine: ChartEngine;
  setChartEngine: Dispatch<SetStateAction<ChartEngine>>;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: Dispatch<SetStateAction<boolean>>;
}

export default function ChartControls({
  metric,
  setMetric,
  visibleWindowSeconds,
  setVisibleWindowSeconds,
  timeWindowOptions,
  chartEngine,
  setChartEngine,
  autoRefreshEnabled,
  setAutoRefreshEnabled
}: ChartControlsProps) {
  return (
    <section className="chart-controls">
      <div className="toggle-group">
        <button
          type="button"
          className={metric === "price" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setMetric("price")}
        >
          Price
        </button>
        <button
          type="button"
          className={metric === "marketcap" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setMetric("marketcap")}
        >
          Market cap
        </button>
      </div>
      <div className="toggle-group">
        {timeWindowOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={visibleWindowSeconds === option.value ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setVisibleWindowSeconds(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="toggle-group">
        <button
          type="button"
          className={
            chartEngine === "simple" ? "toggle-btn toggle-btn--icon active" : "toggle-btn toggle-btn--icon"
          }
          onClick={() => setChartEngine("simple")}
          title="Simple chart"
          aria-label="Simple chart"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M4 18h16M6 15l4-4 3 2 5-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={chartEngine === "tradingview" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setChartEngine("tradingview")}
        >
          TradingView
        </button>
      </div>
      <div className="toggle-group">
        <button
          type="button"
          className={autoRefreshEnabled ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setAutoRefreshEnabled((prev) => !prev)}
        >
          Auto refresh 5m: {autoRefreshEnabled ? "On" : "Off"}
        </button>
      </div>
    </section>
  );
}
