import { useEffect, useRef, useState } from "react";
import { ColorType, LineSeries, createChart } from "lightweight-charts";
import ChartControls from "./components/ChartControls";
import ChartTooltip from "./components/ChartTooltip";
import StatusRow from "./components/StatusRow";
import {
  BTC_CIRCULATING_SUPPLY,
  DEFAULT_VISIBLE_WINDOW_SECONDS,
  DOCUMENT_TITLE_BASE,
  HISTORY_URL,
  TICKER_REST_URL,
  TIME_WINDOW_OPTIONS,
  WS_URL
} from "./constants/chartConfig";
import {
  formatDateOnly,
  formatLargeCurrency,
  formatMarketCap,
  formatPrice,
  formatTime,
  formatTitlePrice
} from "./utils/formatters";

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
  const visibleWindowSecondsRef = useRef(DEFAULT_VISIBLE_WINDOW_SECONDS);

  const [chartEngine, setChartEngine] = useState("simple");
  const [metric, setMetric] = useState("price");
  const [visibleWindowSeconds, setVisibleWindowSeconds] = useState(DEFAULT_VISIBLE_WINDOW_SECONDS);
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
        secondsVisible: true
      },
      rightPriceScale: {
        borderColor: "#334155"
      },
      crosshair: {
        vertLine: { color: "rgba(148, 163, 184, 0.45)", width: 1, style: 3 },
        horzLine: { color: "rgba(148, 163, 184, 0.45)", width: 1, style: 3 }
      }
    });

    const priceSeries = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true
    });

    const marketCapSeries = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 2,
      visible: false,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
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
    let pollInFlight = false;

    function setVisibleRangeSafely(toUnixSeconds) {
      if (!Number.isFinite(toUnixSeconds)) return;
      if (!currentPointRef.current) return;

      const windowSeconds = visibleWindowSecondsRef.current;
      try {
        chart.timeScale().setVisibleRange({
          from: toUnixSeconds - windowSeconds,
          to: toUnixSeconds + 5
        });
      } catch {
        // Lightweight Charts can throw while internal time scale is not ready.
      }
    }

    function applyLivePrice(price, unixSeconds) {
      if (!Number.isFinite(price) || !Number.isFinite(unixSeconds)) return;
      latestTickRef.current = { price, time: unixSeconds };

      // Plot each second as its own point for continuous real-time updates.
      const bucket = unixSeconds;
      const current = currentPointRef.current;
      if (!current || current.time < bucket) {
        currentPointRef.current = { time: bucket, value: price };
      } else {
        current.value = price;
      }

      if (priceSeriesRef.current) {
        priceSeriesRef.current.update(currentPointRef.current);
      }
      if (marketCapSeriesRef.current) {
        marketCapSeriesRef.current.update({
          time: currentPointRef.current.time,
          value: price * BTC_CIRCULATING_SUPPLY
        });
      }

      setVisibleRangeSafely(unixSeconds);

      setLatestPrice(formatPrice(price));
      setLatestMarketCap(formatMarketCap(price * BTC_CIRCULATING_SUPPLY));
      setLastUpdate(formatTime(unixSeconds));
      document.title = `${formatTitlePrice(price)} · ${DOCUMENT_TITLE_BASE}`;
    }

    async function loadInitialCandles() {
      setMessage("Loading recent BTC/USD candles...");
      const response = await fetch(`${HISTORY_URL}?granularity=60`);
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
        priceData.map((p) => ({
          time: p.time,
          value: p.value * BTC_CIRCULATING_SUPPLY
        }))
      );
      chart.timeScale().fitContent();

      if (priceData.length > 0) {
        const last = priceData[priceData.length - 1];
        currentPointRef.current = { time: last.time, value: last.value };
        applyLivePrice(last.value, last.time);
      }

      setMessage("History loaded. Connecting to live feed...");
    }

    /** Poll REST ticker every second — WS `ticker` can be sparse; this keeps UI + title in sync. */
    async function pollTickerOnce() {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const res = await fetch(TICKER_REST_URL);
        if (!res.ok) return;
        const data = await res.json();
        const price = Number(data.price);
        const vol = Number(data.volume);
        const nowSec = Math.floor(Date.now() / 1000);
        if (Number.isFinite(price)) {
          applyLivePrice(price, nowSec);
        }
        if (Number.isFinite(vol) && vol > 0 && Number.isFinite(price)) {
          const formattedVolume = formatLargeCurrency(vol * price);
          latestVolume24hRef.current = formattedVolume;
          setLatestVolume24h(formattedVolume);
        }
      } catch {
        /* ignore transient network errors */
      } finally {
        pollInFlight = false;
      }
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

        applyLivePrice(price, time);
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
        await pollTickerOnce();
        tickInterval = setInterval(pollTickerOnce, 1000);
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
      document.title = DOCUMENT_TITLE_BASE;
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
    visibleWindowSecondsRef.current = visibleWindowSeconds;

    const chart = chartRef.current;
    if (!chart) return;

    const tickTime = latestTickRef.current?.time ?? Math.floor(Date.now() / 1000);
    if (!currentPointRef.current) return;
    try {
      chart.timeScale().setVisibleRange({
        from: tickTime - visibleWindowSeconds,
        to: tickTime + 5
      });
    } catch {
      // Ignore until chart has enough data loaded.
    }
  }, [visibleWindowSeconds]);

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
        React + Vite + Lightweight Charts. Continuous real-time BTC updates via WebSocket, with
        REST polling as a backup if a tick is delayed. Default timeline window is 5 minutes.
      </p>

      <StatusRow
        connection={connection}
        connectionClass={connectionClass}
        latestPrice={latestPrice}
        latestMarketCap={latestMarketCap}
        lastUpdate={lastUpdate}
      />

      <ChartControls
        metric={metric}
        setMetric={setMetric}
        visibleWindowSeconds={visibleWindowSeconds}
        setVisibleWindowSeconds={setVisibleWindowSeconds}
        timeWindowOptions={TIME_WINDOW_OPTIONS}
        chartEngine={chartEngine}
        setChartEngine={setChartEngine}
      />

      <div className="chart-host" ref={chartHostRef}>
        <div id="chart" ref={chartContainerRef} style={{ display: chartEngine === "simple" ? "block" : "none" }} />
        {chartEngine === "simple" && <ChartTooltip tooltip={tooltip} />}
        {chartEngine === "tradingview" && (
          <iframe
            title="TradingView BTCUSD Chart"
            className="tv-frame"
            src={`https://s.tradingview.com/widgetembed/?symbol=BITSTAMP%3ABTCUSD&interval=${TIME_WINDOW_OPTIONS.find((o) => o.value === visibleWindowSeconds)?.tvInterval ?? "5"}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=1f2937&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&enable_publishing=0&allow_symbol_change=1`}
          />
        )}
      </div>
      <p id="message">{message}</p>
    </main>
  );
}
