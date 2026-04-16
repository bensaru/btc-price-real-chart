export default function StatusRow({
  connection,
  connectionClass,
  latestPrice,
  targetPrice,
  targetTime,
  latestMarketCap,
  lastUpdate
}) {
  const toNumber = (value) => {
    if (typeof value !== "string") return NaN;
    return Number(value.replace(/[^0-9.-]/g, ""));
  };

  const current = toNumber(latestPrice);
  const target = toNumber(targetPrice);
  const diff = Number.isFinite(current) && Number.isFinite(target) ? current - target : NaN;
  const deltaClass = !Number.isFinite(diff) ? "" : diff >= 0 ? "ok" : "error";
  const deltaArrow = !Number.isFinite(diff) ? "" : diff >= 0 ? "▲" : "▼";
  const deltaText = !Number.isFinite(diff)
    ? "--"
    : `${deltaArrow} $${Math.abs(diff).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;

  return (
    <section className="status-row">
      <div className="status-card">
        <span className="label">Connection</span>
        <span className={`value ${connectionClass}`}>{connection}</span>
      </div>
      <div className="status-card">
        <span className="label">Market Cap (Est.)</span>
        <span className="value">{latestMarketCap}</span>
      </div>
      <div className="status-card">
        <span className="label">Last Update</span>
        <span className="value">{lastUpdate}</span>
      </div>
      <div className="status-card status-card--beat">
        <div className="beat-grid">
          <div>
            <span className="label">Price To Beat</span>
            <span className="value">{targetPrice}</span>
            <span className="label label--subtle">Start time: {targetTime}</span>
          </div>
          <div>
            <span className="label">Current Price</span>
            <span className="value">{latestPrice}</span>
            <span className={`label delta ${deltaClass}`}>{deltaText}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
