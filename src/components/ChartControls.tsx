import type { TimeWindowOption } from "../types/chart";
import type { Dispatch, SetStateAction } from "react";

interface ChartControlsProps {
  visibleWindowSeconds: number;
  setVisibleWindowSeconds: Dispatch<SetStateAction<number>>;
  timeWindowOptions: TimeWindowOption[];
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: Dispatch<SetStateAction<boolean>>;
}

export default function ChartControls({
  visibleWindowSeconds,
  setVisibleWindowSeconds,
  timeWindowOptions,
  autoRefreshEnabled,
  setAutoRefreshEnabled
}: ChartControlsProps) {
  return (
    <section className="chart-controls">
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
          className={autoRefreshEnabled ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setAutoRefreshEnabled((prev) => !prev)}
        >
          Auto refresh 5m: {autoRefreshEnabled ? "On" : "Off"}
        </button>
      </div>
    </section>
  );
}
