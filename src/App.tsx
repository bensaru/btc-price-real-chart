import { useEffect } from "react";
import HistoryResults from "./components/HistoryResults";
import HistorySnapshotChart from "./components/HistorySnapshotChart";
import ChartViewport from "./components/ChartViewport";
import StatusRow from "./components/StatusRow";
import { TIME_WINDOW_OPTIONS } from "./constants/chartConfig";
import { useBtcRealtimeChart } from "./hooks/useBtcRealtimeChart";

export default function App() {
  const {
    chartContainerRef,
    chartHostRef,
    historySnapshotChartContainerRef,
    historyTimelineWindowSeconds,
    setHistoryTimelineWindowSeconds,
    connection,
    connectionClass,
    latestPrice,
    targetPrice,
    targetTime,
    latestMarketCap,
    lastUpdate,
    message,
    tooltip,
    historyResults,
    predictionSignal
  } = useBtcRealtimeChart();

  useEffect(() => {
    // Keep a stable title when no live tick has arrived yet.
    if (!latestPrice || latestPrice === "$--") {
      document.title = "BTC Live Chart";
    }
  }, [latestPrice]);

  const snapshotTimeWindowOptions = TIME_WINDOW_OPTIONS.filter(
    (option) => option.value !== 24 * 60 * 60
  );

  return (
    <main className="container">
      <h1>BTC/USD Live Chart</h1>
      <p className="subtitle">
        Continuous real-time BTC/USD updates every second (WebSocket with REST fallback).
      </p>

      <StatusRow
        connection={connection}
        connectionClass={connectionClass}
        latestPrice={latestPrice}
        targetPrice={targetPrice}
        targetTime={targetTime}
        latestMarketCap={latestMarketCap}
        lastUpdate={lastUpdate}
        predictionSignal={predictionSignal}
      />

      <ChartViewport
        chartEngine="simple"
        chartHostRef={chartHostRef}
        chartContainerRef={chartContainerRef}
        tooltip={tooltip}
        tradingViewSrc=""
      />
      <HistorySnapshotChart
        containerRef={historySnapshotChartContainerRef}
        selectedWindowSeconds={historyTimelineWindowSeconds}
        setSelectedWindowSeconds={setHistoryTimelineWindowSeconds}
        timeWindowOptions={snapshotTimeWindowOptions}
      />
      <HistoryResults items={historyResults} />
      <p id="message">{message}</p>
    </main>
  );
}
