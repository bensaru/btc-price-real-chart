import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TimeWindowOption } from "../types/chart";

interface HistorySnapshotChartProps {
  containerRef: RefObject<HTMLDivElement | null>;
  selectedWindowSeconds: number;
  setSelectedWindowSeconds: Dispatch<SetStateAction<number>>;
  timeWindowOptions: TimeWindowOption[];
}

export default function HistorySnapshotChart({
  containerRef,
  selectedWindowSeconds,
  setSelectedWindowSeconds,
  timeWindowOptions
}: HistorySnapshotChartProps) {
  return (
    <section className="history-snapshot-section">
      <div className="toggle-group history-snapshot-controls">
        {timeWindowOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={selectedWindowSeconds === option.value ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setSelectedWindowSeconds(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div id="history-snapshot-chart" ref={containerRef} />
    </section>
  );
}
