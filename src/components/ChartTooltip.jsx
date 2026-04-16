export default function ChartTooltip({ tooltip }) {
  if (!tooltip.visible) {
    return null;
  }

  return (
    <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <div className="tooltip-head">
        <span>{tooltip.date}</span>
        <span>{tooltip.time}</span>
      </div>
      <div className="tooltip-row">
        <span className="dot red" />
        <span>{tooltip.primaryLabel}:</span>
        <strong>{tooltip.primaryValue}</strong>
      </div>
      <div className="tooltip-row">
        <span className="dot gray" />
        <span>{tooltip.secondaryLabel}:</span>
        <strong>{tooltip.secondaryValue}</strong>
      </div>
    </div>
  );
}
