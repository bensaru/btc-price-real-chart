export default function StatusRow({
  connection,
  connectionClass,
  latestPrice,
  latestMarketCap,
  lastUpdate
}) {
  return (
    <section className="status-row">
      <div className="status-card">
        <span className="label">Connection</span>
        <span className={`value ${connectionClass}`}>{connection}</span>
      </div>
      <div className="status-card">
        <span className="label">Latest Price</span>
        <span className="value">{latestPrice}</span>
      </div>
      <div className="status-card">
        <span className="label">Market Cap (Est.)</span>
        <span className="value">{latestMarketCap}</span>
      </div>
      <div className="status-card">
        <span className="label">Last Update</span>
        <span className="value">{lastUpdate}</span>
      </div>
    </section>
  );
}
