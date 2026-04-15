import { useEffect, useRef, useState } from "react";
import { AreaSeries, BaselineSeries, ColorType, createChart } from "lightweight-charts";

const HISTORY_URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60";
const WS_URL = "wss://ws-feed.exchange.coinbase.com";
const BTC_CIRCULATING_SUPPLY = 19_650_000;

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

function formatMarketCap(value) {
  if (!Number.isFinite(value)) return "$--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return formatPrice(value);
}

function formatLargeCurrency(value) {
  if (!Number.isFinite(value)) return "$--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return formatPrice(value);
}

function formatDateOnly(unixSeconds) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(unixSeconds * 1000));
}

export default function App() {
  const chartContainerRef = useRef(null);
  const chartHostRef = useRef(null);
  const chartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const marketCapSeriesRef = useRef(null);
  const latestTickRef = useRef(null);
  const latestVolume24hRef = useRef("$--");
  const currentPointRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const websocketRef = useRef(null);

  const [chartEngine, setChartEngine] = useState("simple");
  const [metric, setMetric] = useState("price");
  const [connection, setConnection] = useState("Connecting...");
  const [connectionClass, setConnectionClass] = useState("warning");
  const [latestPrice, setLatestPrice] = useState("$--");
  const [latestMarketCap, setLatestMarketCap] = useState("$--");
  const [latestVolume24h, setLatestVolume24h] = useState("$--");
  const [lastUpdate, setLastUpdate] = useState("--");
  const [message, setMessage] = useState("Initializing chart...");
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    date: "--",
    time: "--",
    primaryLabel: "Price",
    primaryValue: "$--",
    secondaryLabel: "Vol 24h",
    secondaryValue: "$--"
  });

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
      },
      crosshair: {
        vertLine: { color: "rgba(148, 163, 184, 0.45)", width: 1, style: 3 },
        horzLine: { color: "rgba(148, 163, 184, 0.45)", width: 1, style: 3 }
      }
    });

    const priceSeries = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: "#22c55e",
      topFillColor1: "rgba(34, 197, 94, 0.35)",
      topFillColor2: "rgba(34, 197, 94, 0.05)",
      bottomLineColor: "#ef4444",
      bottomFillColor1: "rgba(239, 68, 68, 0.28)",
      bottomFillColor2: "rgba(239, 68, 68, 0.04)",
      lineWidth: 2
    });

    const marketCapSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(34, 197, 94, 0.35)",
      bottomColor: "rgba(34, 197, 94, 0.03)",
      lineColor: "#22c55e",
      lineWidth: 2,
      visible: false,
      priceFormat: {
        type: "custom",
        formatter: (v) => formatMarketCap(v)
      }
    });

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    marketCapSeriesRef.current = marketCapSeries;

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
          close: Number(entry[4])
        }))
        .sort((a, b) => a.time - b.time);

      const priceData = candles.map((c) => ({ time: c.time, value: c.close }));
      priceSeries.setData(priceData);
      marketCapSeries.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.close * BTC_CIRCULATING_SUPPLY
        }))
      );
      if (priceData.length > 0) {
        priceSeries.applyOptions({
          baseValue: { type: "price", price: priceData[0].value }
        });
      }
      chart.timeScale().fitContent();

      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        currentPointRef.current = { time: last.time, value: last.close };
        setLatestPrice(formatPrice(last.close));
        setLatestMarketCap(formatMarketCap(last.close * BTC_CIRCULATING_SUPPLY));
        setLastUpdate(formatTime(last.time));
      }

      setMessage("History loaded. Connecting to live feed...");
    }

    function handleTick() {
      if (!latestTickRef.current || !priceSeriesRef.current) {
        return;
      }

      const { price, time } = latestTickRef.current;
      const bucket = Math.floor(time / 60) * 60;
      const current = currentPointRef.current;

      if (!current || current.time < bucket) {
        currentPointRef.current = {
          time: bucket,
          value: price
        };
      } else {
        current.value = price;
      }

      priceSeriesRef.current.update(currentPointRef.current);
      setLatestPrice(formatPrice(price));
      if (marketCapSeriesRef.current) {
        marketCapSeriesRef.current.update({
          time: currentPointRef.current.time,
          value: price * BTC_CIRCULATING_SUPPLY
        });
        setLatestMarketCap(formatMarketCap(price * BTC_CIRCULATING_SUPPLY));
      }
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
        const volume24h = Number(data.volume_24h);
        if (!Number.isFinite(price) || !Number.isFinite(time)) {
          return;
        }

        latestTickRef.current = { price, time };
        if (Number.isFinite(volume24h) && volume24h > 0) {
          const formattedVolume = formatLargeCurrency(volume24h * price);
          latestVolume24hRef.current = formattedVolume;
          setLatestVolume24h(formattedVolume);
        }
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

    const handleCrosshairMove = (param) => {
      if (
        !param ||
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }

      const hostRect = chartHostRef.current?.getBoundingClientRect();
      if (!hostRect) return;

      const pricePoint = param.seriesData.get(priceSeriesRef.current);
      const marketCapPoint = param.seriesData.get(marketCapSeriesRef.current);
      const pointTime = typeof param.time === "number" ? param.time : null;
      if (!pointTime) return;

      let primaryLabel = "Price";
      let primaryValue = "$--";
      if (metric === "price") {
        const v = pricePoint?.value;
        if (typeof v === "number") primaryValue = formatPrice(v);
      } else {
        primaryLabel = "Market cap";
        const v = marketCapPoint?.value;
        if (typeof v === "number") primaryValue = formatMarketCap(v);
      }

      const x = Math.min(Math.max(param.point.x + 14, 12), Math.max(hostRect.width - 220, 12));
      const y = Math.max(param.point.y - 90, 12);
      setTooltip({
        visible: true,
        x,
        y,
        date: formatDateOnly(pointTime),
        time: formatTime(pointTime),
        primaryLabel,
        primaryValue,
        secondaryLabel: "Vol 24h",
        secondaryValue: latestVolume24hRef.current
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

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
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const price = priceSeriesRef.current;
    const marketCap = marketCapSeriesRef.current;
    if (!price || !marketCap) return;
    const showPrice = metric === "price";
    price.applyOptions({ visible: showPrice });
    marketCap.applyOptions({ visible: !showPrice });
  }, [metric]);

  useEffect(() => {
    if (chartEngine !== "simple") return;
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return;
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight
    });
    chart.timeScale().fitContent();
  }, [chartEngine]);

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
          <span className="label">Market Cap (Est.)</span>
          <span className="value">{latestMarketCap}</span>
        </div>
        <div className="status-card">
          <span className="label">Last Update</span>
          <span className="value">{lastUpdate}</span>
        </div>
      </section>

      <section className="chart-controls">
        <div className="toggle-group">
          <button
            type="button"
            className={metric === "price" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setMetric("price")}
          >
            Price
          </button>
          <button
            type="button"
            className={metric === "marketcap" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setMetric("marketcap")}
          >
            Market cap
          </button>
        </div>
        <div className="toggle-group">
          <button
            type="button"
            className={chartEngine === "simple" ? "toggle-btn toggle-btn--icon active" : "toggle-btn toggle-btn--icon"}
            onClick={() => setChartEngine("simple")}
            title="Simple chart"
            aria-label="Simple chart"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M4 18h16M6 15l4-4 3 2 5-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={chartEngine === "tradingview" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setChartEngine("tradingview")}
          >
            TradingView
          </button>
        </div>
      </section>

      <div className="chart-host" ref={chartHostRef}>
        <div id="chart" ref={chartContainerRef} style={{ display: chartEngine === "simple" ? "block" : "none" }} />
        {chartEngine === "simple" && tooltip.visible && (
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
        )}
        {chartEngine === "tradingview" && (
          <iframe
            title="TradingView BTCUSD Chart"
            className="tv-frame"
            src="https://s.tradingview.com/widgetembed/?symbol=BITSTAMP%3ABTCUSD&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=1f2937&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&enable_publishing=0&allow_symbol_change=1"
          />
        )}
      </div>
      <p id="message">{message}</p>
    </main>
  );
}
