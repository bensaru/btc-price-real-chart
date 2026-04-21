import type { HistoryResultItem } from "../types/chart";

interface HistoryResultsProps {
  items: HistoryResultItem[];
}

export default function HistoryResults({ items }: HistoryResultsProps) {
  return (
    <section className="history-panel">
      <h2>Last 10 Results</h2>
      {items.length === 0 ? (
        <p className="history-empty">Waiting for completed intervals...</p>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Target Price</th>
                <th>Close</th>
                <th>Diff</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.startTime}</td>
                  <td>{item.intervalEndTime}</td>
                  <td>{item.targetPrice}</td>
                  <td>{item.closePrice}</td>
                  <td className={item.deltaClass}>{item.diffText}</td>
                  <td className={item.deltaClass}>{item.resultText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
