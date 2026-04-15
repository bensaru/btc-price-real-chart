import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart } from "lightweight-charts";

const HISTORY_URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60";
const WS_URL = "wss://ws-feed.exchange.coinbase.com";

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(price);
}

function formatTime(unixSeconds) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(unixSeconds * 1000));
}

export default function App() {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const latestTickRef = useRef(null);
  const currentCandleRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const websocketRef = useRef(null);

  const [connection, setConnection] = useState("Connecting...");
  const [connectionClass, setConnectionClass] = useState("warning");
  const [latestPrice, setLatestPrice] = useState("$--");
  const [lastUpdate, setLastUpdate] = useState("--");
  const [message, setMessage] = useState("Initializing chart...");

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return undefined;
    }

    const chart = createChart(container, {
      layout: {
        textColor: "#e2e8f0",
        background: {
          type: ColorType.Solid,
          color: "#0b1220"
        }
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" }
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false
      },
      rightPriceScale: {
        borderColor: "#334155"
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    });

    resizeObserver.observe(container);
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight
    });

    let tickInterval = null;

    async function loadInitialCandles() {
      setMessage("Loading recent BTC/USD candles...");
      const response = await fetch(HISTORY_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading candle history.`);
      }

      const raw = await response.json();
      const candles = raw
        .map((entry) => ({
          time: entry[0],
          low: Number(entry[1]),
          high: Number(entry[2]),
          open: Number(entry[3]),
          close: Number(entry[4])
        }))
        .sort((a, b) => a.time - b.time);

      candleSeries.setData(candles);
      chart.timeScale().fitContent();

      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        currentCandleRef.current = { ...last };
        setLatestPrice(formatPrice(last.close));
        setLastUpdate(formatTime(last.time));
      }

      setMessage("History loaded. Connecting to live feed...");
    }

    function handleTick() {
      if (!latestTickRef.current || !candleSeriesRef.current) {
        return;
      }

      const { price, time } = latestTickRef.current;
      const bucket = Math.floor(time / 60) * 60;
      const current = currentCandleRef.current;

      if (!current || current.time < bucket) {
        currentCandleRef.current = {
          time: bucket,
          open: price,
          high: price,
          low: price,
          close: price
        };
      } else {
        current.high = Math.max(current.high, price);
        current.low = Math.min(current.low, price);
        current.close = price;
      }

      candleSeriesRef.current.update(currentCandleRef.current);
      setLatestPrice(formatPrice(price));
      setLastUpdate(formatTime(time));
    }

    function connectSocket() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      setConnection("Connecting...");
      setConnectionClass("warning");

      const ws = new WebSocket(WS_URL);
      websocketRef.current = ws;

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            channels: [{ name: "ticker", product_ids: ["BTC-USD"] }]
          })
        );
        setConnection("Connected");
        setConnectionClass("ok");
        setMessage("Receiving real-time BTC/USD ticks.");
      });

      ws.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== "ticker" || data.product_id !== "BTC-USD") {
          return;
        }

        const price = Number(data.price);
        const time = Math.floor(new Date(data.time).getTime() / 1000);
        if (!Number.isFinite(price) || !Number.isFinite(time)) {
          return;
        }

        latestTickRef.current = { price, time };
      });

      ws.addEventListener("close", () => {
        setConnection("Disconnected");
        setConnectionClass("error");
        setMessage("Socket closed. Reconnecting in 3s...");
        reconnectTimerRef.current = setTimeout(connectSocket, 3000);
      });

      ws.addEventListener("error", () => {
        setConnection("Error");
        setConnectionClass("error");
        setMessage("WebSocket error. Reconnecting...");
        ws.close();
      });
    }

    (async () => {
      try {
        await loadInitialCandles();
        connectSocket();
        tickInterval = setInterval(handleTick, 1000);
      } catch (error) {
        setConnection("Failed");
        setConnectionClass("error");
        setMessage(`Startup error: ${error.message}`);
      }
    })();

    return () => {
      if (tickInterval) {
        clearInterval(tickInterval);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  return (
    <main className="container">
      <h1>BTC/USD Live Chart</h1>
      <p className="subtitle">
        React + Vite + TradingView Lightweight Charts + Coinbase feed, updated every second.
      </p>

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
          <span className="label">Last Update</span>
          <span className="value">{lastUpdate}</span>
        </div>
      </section>

      <div id="chart" ref={chartContainerRef} />
      <p id="message">{message}</p>
    </main>
  );
}
