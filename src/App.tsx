import { useEffect, useState } from "react";
import ChartControls from "./components/ChartControls";
import HistoryResults from "./components/HistoryResults";
import ChartViewport from "./components/ChartViewport";
import StatusRow from "./components/StatusRow";
import { TIME_WINDOW_OPTIONS } from "./constants/chartConfig";
import { useBtcRealtimeChart } from "./hooks/useBtcRealtimeChart";

export default function App() {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);

  const {
    chartContainerRef,
    chartHostRef,
    visibleWindowSeconds,
    setVisibleWindowSeconds,
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
    if (!autoRefreshEnabled) return undefined;
    const timerId = window.setInterval(() => {
      window.location.reload();
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [autoRefreshEnabled]);

  return (
    <main className="container">
      <h1>BTC/USD Live Chart</h1>
      <p className="subtitle">
        React + Vite + Lightweight Charts. Continuous real-time BTC updates via WebSocket, with
        REST polling as a backup if a tick is delayed. Default timeline window is 5 minutes.
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

      <ChartControls
        visibleWindowSeconds={visibleWindowSeconds}
        setVisibleWindowSeconds={setVisibleWindowSeconds}
        timeWindowOptions={TIME_WINDOW_OPTIONS}
        autoRefreshEnabled={autoRefreshEnabled}
        setAutoRefreshEnabled={setAutoRefreshEnabled}
      />

      <ChartViewport chartHostRef={chartHostRef} chartContainerRef={chartContainerRef} tooltip={tooltip} />
      <HistoryResults items={historyResults} />
      <p id="message">{message}</p>
    </main>
  );
}
