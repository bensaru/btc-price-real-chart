const connectionEl = document.getElementById("connectionStatus");
const latestPriceEl = document.getElementById("latestPrice");
const lastUpdateEl = document.getElementById("lastUpdate");
const messageEl = document.getElementById("message");
const chartEl = document.getElementById("chart");

const chart = LightweightCharts.createChart(chartEl, {
  layout: {
    background: { color: "#0b1220" },
    textColor: "#e2e8f0"
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
    mode: LightweightCharts.CrosshairMode.Normal
  }
});

const candleSeries = chart.addCandlestickSeries({
  upColor: "#22c55e",
  downColor: "#ef4444",
  wickUpColor: "#22c55e",
  wickDownColor: "#ef4444",
  borderVisible: false
});

window.addEventListener("resize", () => {
  chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });
});
chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });

let latestTick = null;
let currentCandle = null;
let reconnectTimer = null;
let ws = null;

function setConnectionState(text, className) {
  connectionEl.textContent = text;
  connectionEl.className = `value ${className}`;
}

function setMessage(text) {
  messageEl.textContent = text;
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(price);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

async function loadInitialCandles() {
  setMessage("Loading recent BTC/USD candles...");
  const response = await fetch(
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60"
  );

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
    currentCandle = { ...last };
    latestPriceEl.textContent = formatPrice(last.close);
    lastUpdateEl.textContent = formatTime(new Date(last.time * 1000));
  }

  setMessage("Live stream active.");
}

function handleTick() {
  if (!latestTick) {
    return;
  }

  const price = latestTick.price;
  const tickTime = latestTick.time;
  const bucket = Math.floor(tickTime / 60) * 60;

  if (!currentCandle || currentCandle.time < bucket) {
    currentCandle = {
      time: bucket,
      open: price,
      high: price,
      low: price,
      close: price
    };
  } else {
    currentCandle.high = Math.max(currentCandle.high, price);
    currentCandle.low = Math.min(currentCandle.low, price);
    currentCandle.close = price;
  }

  candleSeries.update(currentCandle);
  latestPriceEl.textContent = formatPrice(price);
  lastUpdateEl.textContent = formatTime(new Date(tickTime * 1000));
}

function connectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  setConnectionState("Connecting...", "warning");
  ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  ws.addEventListener("open", () => {
    ws.send(
      JSON.stringify({
        type: "subscribe",
        channels: [{ name: "ticker", product_ids: ["BTC-USD"] }]
      })
    );
    setConnectionState("Connected", "ok");
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

    latestTick = { price, time };
  });

  ws.addEventListener("close", () => {
    setConnectionState("Disconnected", "error");
    setMessage("Socket closed. Reconnecting in 3s...");
    reconnectTimer = setTimeout(connectSocket, 3000);
  });

  ws.addEventListener("error", () => {
    setConnectionState("Error", "error");
    setMessage("WebSocket error. Reconnecting...");
    ws.close();
  });
}

setInterval(handleTick, 1000);

(async () => {
  try {
    await loadInitialCandles();
    connectSocket();
  } catch (error) {
    setConnectionState("Failed", "error");
    setMessage(`Startup error: ${error.message}`);
  }
})();
