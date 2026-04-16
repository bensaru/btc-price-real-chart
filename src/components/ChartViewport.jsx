import ChartTooltip from "./ChartTooltip";

export default function ChartViewport({
  chartEngine,
  chartHostRef,
  chartContainerRef,
  tooltip,
  tradingViewSrc
}) {
  return (
    <div className="chart-host" ref={chartHostRef}>
      <div id="chart" ref={chartContainerRef} style={{ display: chartEngine === "simple" ? "block" : "none" }} />
      {chartEngine === "simple" && <ChartTooltip tooltip={tooltip} />}
      {chartEngine === "tradingview" && (
        <iframe title="TradingView BTCUSD Chart" className="tv-frame" src={tradingViewSrc} />
      )}
    </div>
  );
}
