import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { ColorType, LineSeries, LineStyle, createChart, createSeriesMarkers } from "lightweight-charts";
import {
  BTC_CIRCULATING_SUPPLY,
  DEFAULT_VISIBLE_WINDOW_SECONDS,
  DOCUMENT_TITLE_BASE,
  HISTORY_URL,
  TICKER_REST_URL,
  WS_URL
} from "../constants/chartConfig";
import {
  formatDateOnly,
  formatLargeCurrency,
  formatMarketCap,
  formatPrice,
  formatTime,
  formatTitlePrice
} from "../utils/formatters";
import type {
  ChartEngine,
  HistoryResultItem,
  Metric,
  PredictionSignal,
  StatusTone,
  TooltipState
} from "../types/chart";

const MAX_POINTS = 20_000;
const CANDLE_GRANULARITY_SECONDS = 60;
const MAX_CANDLES_PER_REQUEST = 300;
const STALE_FEED_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 5_000;

interface PricePoint {
  time: number;
  value: number;
}

interface CandleFetchResult {
  points: PricePoint[];
  boundaryStartPrices: Map<number, number>;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function approxNormalCdf(z: number) {
  return 1 / (1 + Math.exp(-1.702 * z));
}

function buildPredictionSignal({
  points,
  currentPrice,
  nowUnixSeconds,
  intervalSeconds,
  targetPrice,
  targetBoundaryTime
}: {
  points: PricePoint[];
  currentPrice: number;
  nowUnixSeconds: number;
  intervalSeconds: number;
  targetPrice: number;
  targetBoundaryTime: number;
}): PredictionSignal {
  if (
    !Array.isArray(points) ||
    points.length < 4 ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(nowUnixSeconds) ||
    !Number.isFinite(intervalSeconds) ||
    !Number.isFinite(targetPrice) ||
    !Number.isFinite(targetBoundaryTime)
  ) {
    return {
      direction: "WAITING",
      directionClass: "warning",
      upProbability: "--",
      downProbability: "--",
      expectedClose: "$--",
      remainingText: "--"
    };
  }

  const boundaryEnd = targetBoundaryTime + intervalSeconds;
  const remainingSeconds = Math.max(0, boundaryEnd - nowUnixSeconds);
  if (remainingSeconds <= 0) {
    const isUp = currentPrice >= targetPrice;
    return {
      direction: isUp ? "UP" : "DOWN",
      directionClass: isUp ? "ok" : "error",
      upProbability: isUp ? "100%" : "0%",
      downProbability: isUp ? "0%" : "100%",
      expectedClose: formatPrice(currentPrice),
      remainingText: "0s"
    };
  }

  const lookbackSeconds = Math.min(intervalSeconds, 15 * 60);
  const lookbackStart = nowUnixSeconds - lookbackSeconds;
  const recent = points.filter((p) => Number.isFinite(p.time) && p.time >= lookbackStart);
  if (recent.length < 4) {
    return {
      direction: "WAITING",
      directionClass: "warning",
      upProbability: "--",
      downProbability: "--",
      expectedClose: "$--",
      remainingText: `${remainingSeconds}s`
    };
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = Math.max(1, last.time - first.time);
  const driftPerSecond = (last.value - first.value) / elapsed;

  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const dt = curr.time - prev.time;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    const dp = curr.value - prev.value;
    deltas.push(dp / dt);
  }

  const meanDelta =
    deltas.length > 0 ? deltas.reduce((sum, v) => sum + v, 0) / deltas.length : driftPerSecond;
  const variance =
    deltas.length > 1
      ? deltas.reduce((sum, v) => sum + (v - meanDelta) ** 2, 0) / (deltas.length - 1)
      : Math.max((Math.abs(meanDelta) * 0.1) ** 2, 1e-6);
  const sigmaPerSecond = Math.sqrt(Math.max(variance, 1e-6));

  const expectedCloseRaw = currentPrice + driftPerSecond * remainingSeconds;
  const forecastSigma = Math.max(0.5, sigmaPerSecond * Math.sqrt(remainingSeconds));
  const zScore = (expectedCloseRaw - targetPrice) / forecastSigma;
  const upProb = clamp01(approxNormalCdf(zScore));
  const downProb = 1 - upProb;

  const direction = upProb >= downProb ? "UP" : "DOWN";
  const directionClass: StatusTone = direction === "UP" ? "ok" : "error";

  return {
    direction,
    directionClass,
    upProbability: `${Math.round(upProb * 100)}%`,
    downProbability: `${Math.round(downProb * 100)}%`,
    expectedClose: formatPrice(expectedCloseRaw),
    remainingText: `${remainingSeconds}s`
  };
}

function buildBoundaryMarkers(points: PricePoint[], intervalSeconds: number) {
  if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(intervalSeconds)) {
    return [];
  }

  return points
    .filter((p) => Number.isFinite(p.time) && p.time % intervalSeconds === 0)
    .map((p) => ({
      time: p.time,
      position: "atPriceMiddle",
      price: p.value,
      shape: "circle",
      color: "#ef4444",
      size: 1
    }));
}

function findPriceAtOrBefore(points: PricePoint[], unixSeconds: number) {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    if (p.time <= unixSeconds) {
      return p.value;
    }
  }
  return null;
}

function formatSignedDelta(currentPrice: number, targetPrice: number) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(targetPrice)) {
    return "";
  }

  const delta = currentPrice - targetPrice;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatTitlePrice(Math.abs(delta))}`;
}

function formatResultEntry(startTime: number, targetPrice: number, closePrice: number): HistoryResultItem {
  const diff = closePrice - targetPrice;
  const sign = diff >= 0 ? "+" : "-";
  const absDiff = Math.abs(diff);
  const resultText: "UP" | "DOWN" | "FLAT" = diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT";
  const deltaClass: StatusTone = diff > 0 ? "ok" : diff < 0 ? "error" : "";

  return {
    id: `${startTime}-${targetPrice}-${closePrice}`,
    startTime: formatTime(startTime),
    targetPrice: formatPrice(targetPrice),
    closePrice: formatPrice(closePrice),
    diffText: `${sign}${formatPrice(absDiff)}`,
    deltaClass,
    resultText
  };
}

function buildHistoryFromPoints(points: PricePoint[], intervalSeconds: number, limit = 10): HistoryResultItem[] {
  if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(intervalSeconds)) {
    return [];
  }

  const buckets: Array<{ start: number; startPrice: number; closePrice: number; lastTime: number }> = [];
  for (const p of points) {
    if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) {
      continue;
    }

    const bucketStart = Math.floor(p.time / intervalSeconds) * intervalSeconds;
    const lastBucket = buckets[buckets.length - 1];
    if (!lastBucket || lastBucket.start !== bucketStart) {
      buckets.push({
        start: bucketStart,
        startPrice: p.value,
        closePrice: p.value,
        lastTime: p.time
      });
    } else {
      lastBucket.closePrice = p.value;
      lastBucket.lastTime = p.time;
    }
  }

  if (buckets.length === 0) {
    return [];
  }

  const latestTime = points[points.length - 1]?.time;
  const lastBucket = buckets[buckets.length - 1];
  const isLastBucketComplete =
    Number.isFinite(latestTime) &&
    Number.isFinite(lastBucket?.start) &&
    latestTime >= lastBucket.start + intervalSeconds;

  const completedBuckets = isLastBucketComplete ? buckets : buckets.slice(0, -1);
  if (completedBuckets.length === 0) {
    return [];
  }

  const results = completedBuckets.map((bucket) =>
    formatResultEntry(bucket.start, bucket.startPrice, bucket.closePrice)
  );
  return results.slice(-limit).reverse();
}

function mergePoints(existing: PricePoint[], incoming: PricePoint[]): PricePoint[] {
  const byTime = new Map<number, PricePoint>();
  for (const point of existing) {
    byTime.set(point.time, point);
  }
  for (const point of incoming) {
    byTime.set(point.time, point);
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

async function fetchCandlesRange(startSec: number, endSec: number): Promise<CandleFetchResult> {
  const allPoints: PricePoint[] = [];
  const boundaryStartPrices = new Map<number, number>();
  const chunkSeconds = CANDLE_GRANULARITY_SECONDS * MAX_CANDLES_PER_REQUEST;
  let cursor = startSec;

  while (cursor < endSec) {
    const chunkEnd = Math.min(cursor + chunkSeconds, endSec);
    const startIso = new Date(cursor * 1000).toISOString();
    const endIso = new Date(chunkEnd * 1000).toISOString();
    const response = await fetch(
      `${HISTORY_URL}?granularity=${CANDLE_GRANULARITY_SECONDS}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&_ts=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading candle history.`);
    }

    const raw = await response.json();
    const chunkPoints: PricePoint[] = raw
      .map((entry: number[]) => {
        const time = entry[0];
        const open = Number(entry[3]);
        const close = Number(entry[4]);
        if (Number.isFinite(time) && Number.isFinite(open)) {
          boundaryStartPrices.set(time, open);
        }
        return {
          time,
          value: close
        };
      })
      .filter((p: PricePoint) => Number.isFinite(p.time) && Number.isFinite(p.value))
      .sort((a: PricePoint, b: PricePoint) => a.time - b.time);

    allPoints.push(...chunkPoints);
    cursor = chunkEnd;
  }

  return {
    points: mergePoints([], allPoints),
    boundaryStartPrices
  };
}

interface UseBtcRealtimeChartReturn {
  chartContainerRef: RefObject<HTMLDivElement | null>;
  chartHostRef: RefObject<HTMLDivElement | null>;
  chartEngine: ChartEngine;
  setChartEngine: Dispatch<SetStateAction<ChartEngine>>;
  metric: Metric;
  setMetric: Dispatch<SetStateAction<Metric>>;
  visibleWindowSeconds: number;
  setVisibleWindowSeconds: Dispatch<SetStateAction<number>>;
  connection: string;
  connectionClass: StatusTone;
  latestPrice: string;
  targetPrice: string;
  targetTime: string;
  latestMarketCap: string;
  lastUpdate: string;
  message: string;
  tooltip: TooltipState;
  historyResults: HistoryResultItem[];
  predictionSignal: PredictionSignal;
}

export function useBtcRealtimeChart(): UseBtcRealtimeChartReturn {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const priceSeriesRef = useRef<any>(null);
  const marketCapSeriesRef = useRef<any>(null);
  const targetPriceLineRef = useRef<any>(null);
  const boundaryMarkersRef = useRef<any>(null);
  const latestTickRef = useRef<{ price: number; time: number } | null>(null);
  const lastSocketTickReceivedAtMsRef = useRef<number>(0);
  const lastAnyTickReceivedAtMsRef = useRef<number>(0);
  const pricePointsRef = useRef<PricePoint[]>([]);
  const latestVolume24hRef = useRef("$--");
  const currentPointRef = useRef<PricePoint | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const visibleWindowSecondsRef = useRef(DEFAULT_VISIBLE_WINDOW_SECONDS);
  const targetBoundaryRef = useRef<number | null>(null);
  const targetPriceRef = useRef<number | null>(null);
  const boundaryStartPriceByTimeRef = useRef<Map<number, number>>(new Map());
  const boundaryOpenFetchInFlightRef = useRef<Set<number>>(new Set());
  const historyResultsRef = useRef<HistoryResultItem[]>([]);
  const metricRef = useRef<Metric>("price");

  const [chartEngine, setChartEngine] = useState<ChartEngine>("simple");
  const [metric, setMetric] = useState<Metric>("price");
  const [visibleWindowSeconds, setVisibleWindowSeconds] = useState(DEFAULT_VISIBLE_WINDOW_SECONDS);
  const [connection, setConnection] = useState("Connecting...");
  const [connectionClass, setConnectionClass] = useState<StatusTone>("warning");
  const [latestPrice, setLatestPrice] = useState("$--");
  const [latestMarketCap, setLatestMarketCap] = useState("$--");
  const [latestVolume24h, setLatestVolume24h] = useState("$--");
  const [targetPrice, setTargetPrice] = useState("$--");
  const [targetTime, setTargetTime] = useState("--");
  const [historyResults, setHistoryResults] = useState<HistoryResultItem[]>([]);
  const [predictionSignal, setPredictionSignal] = useState<PredictionSignal>({
    direction: "WAITING",
    directionClass: "warning",
    upProbability: "--",
    downProbability: "--",
    expectedClose: "$--",
    remainingText: "--"
  });
  const [lastUpdate, setLastUpdate] = useState("--");
  const [message, setMessage] = useState("Initializing chart...");
  const [tooltip, setTooltip] = useState<TooltipState>({
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
        formatter: (v: number) => formatMarketCap(v)
      }
    });

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    marketCapSeriesRef.current = marketCapSeries;
    boundaryMarkersRef.current = createSeriesMarkers(priceSeries, []);

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

    let tickInterval: number | null = null;
    let watchdogInterval: number | null = null;
    let pollInFlight = false;

    function refreshPredictionSignal(currentPrice: number, nowUnixSeconds: number) {
      setPredictionSignal(
        buildPredictionSignal({
          points: pricePointsRef.current,
          currentPrice,
          nowUnixSeconds,
          intervalSeconds: visibleWindowSecondsRef.current,
          targetPrice: targetPriceRef.current as number,
          targetBoundaryTime: targetBoundaryRef.current as number
        })
      );
    }

    function updateTargetPrice(nowUnixSeconds: number) {
      if (!Number.isFinite(nowUnixSeconds)) return;
      const intervalSeconds = visibleWindowSecondsRef.current;
      const boundaryTime = Math.floor(nowUnixSeconds / intervalSeconds) * intervalSeconds;
      const boundaryOpen = boundaryStartPriceByTimeRef.current.get(boundaryTime);
      const fallbackBoundaryPrice = findPriceAtOrBefore(pricePointsRef.current, boundaryTime);
      if (!Number.isFinite(boundaryOpen)) {
        if (!boundaryOpenFetchInFlightRef.current.has(boundaryTime)) {
          boundaryOpenFetchInFlightRef.current.add(boundaryTime);
          void (async () => {
            try {
              const { boundaryStartPrices } = await fetchCandlesRange(
                boundaryTime,
                boundaryTime + CANDLE_GRANULARITY_SECONDS
              );
              const resolvedOpen = boundaryStartPrices.get(boundaryTime);
              if (Number.isFinite(resolvedOpen)) {
                boundaryStartPriceByTimeRef.current.set(boundaryTime, resolvedOpen as number);
                const latestTime = latestTickRef.current?.time ?? nowUnixSeconds;
                updateTargetPrice(latestTime);
              }
            } catch {
              // keep current target state if boundary open fetch fails
            } finally {
              boundaryOpenFetchInFlightRef.current.delete(boundaryTime);
            }
          })();
        }
      }
      const boundaryPrice = Number.isFinite(boundaryOpen)
        ? (boundaryOpen as number)
        : fallbackBoundaryPrice;
      if (!Number.isFinite(boundaryPrice)) return;

      const changedBoundary = targetBoundaryRef.current !== boundaryTime;
      const changedPrice = targetPriceRef.current !== boundaryPrice;
      if (!changedBoundary && !changedPrice) return;

      targetBoundaryRef.current = boundaryTime;
      targetPriceRef.current = boundaryPrice;
      setTargetPrice(formatPrice(boundaryPrice));
      setTargetTime(formatTime(boundaryTime));
      const latestLivePrice = latestTickRef.current?.price;
      const latestLiveTime = latestTickRef.current?.time ?? nowUnixSeconds;
      refreshPredictionSignal(latestLivePrice as number, latestLiveTime);

      if (!priceSeriesRef.current) return;

      if (!targetPriceLineRef.current) {
        targetPriceLineRef.current = priceSeriesRef.current.createPriceLine({
          price: boundaryPrice,
          color: "#94a3b8",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Target"
        });
        return;
      }

      targetPriceLineRef.current.applyOptions({
        price: boundaryPrice
      });
    }

    function setVisibleRangeSafely(toUnixSeconds: number) {
      if (!Number.isFinite(toUnixSeconds)) return;
      if (!currentPointRef.current) return;

      const windowSeconds = visibleWindowSecondsRef.current;
      try {
        chart.timeScale().setVisibleRange({
          from: (toUnixSeconds - windowSeconds) as any,
          to: (toUnixSeconds + 5) as any
        });
      } catch {
        // Lightweight Charts can throw while internal time scale is not ready.
      }
    }

    function applyLivePrice(price: number, unixSeconds: number) {
      if (!Number.isFinite(price) || !Number.isFinite(unixSeconds)) return;
      latestTickRef.current = { price, time: unixSeconds };
      lastAnyTickReceivedAtMsRef.current = Date.now();

      const bucket = unixSeconds;
      const current = currentPointRef.current;
      if (current && bucket < current.time) {
        // Ignore out-of-order/stale ticks; they can distort latest price/target.
        return;
      }

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

      const points = pricePointsRef.current;
      const last = points[points.length - 1];
      if (!last || currentPointRef.current.time > last.time) {
        points.push({ time: currentPointRef.current.time, value: currentPointRef.current.value });
      } else if (currentPointRef.current.time === last.time) {
        points[points.length - 1] = { time: currentPointRef.current.time, value: currentPointRef.current.value };
      }
      if (points.length > MAX_POINTS) {
        points.splice(0, points.length - MAX_POINTS);
      }

      if (boundaryMarkersRef.current) {
        boundaryMarkersRef.current.setMarkers(
          buildBoundaryMarkers(points, visibleWindowSecondsRef.current)
        );
      }

      updateTargetPrice(unixSeconds);

      const rebuiltHistory = buildHistoryFromPoints(
        pricePointsRef.current,
        visibleWindowSecondsRef.current,
        10
      );
      historyResultsRef.current = rebuiltHistory;
      setHistoryResults(rebuiltHistory);

      setLatestPrice(formatPrice(price));
      setLatestMarketCap(formatMarketCap(price * BTC_CIRCULATING_SUPPLY));
      setLastUpdate(formatTime(unixSeconds));
      refreshPredictionSignal(price, unixSeconds);
      const deltaText = formatSignedDelta(price, targetPriceRef.current as number);
      document.title = deltaText
        ? `${formatTitlePrice(price)} ${deltaText} · ${DOCUMENT_TITLE_BASE}`
        : `${formatTitlePrice(price)} · ${DOCUMENT_TITLE_BASE}`;
    }

    async function loadInitialCandles() {
      setMessage("Live feed connected. Syncing recent history...");
      const nowSec = Math.floor(Date.now() / 1000);
      const lookbackSeconds = Math.max(6 * 60 * 60, visibleWindowSecondsRef.current * 20);
      const { points: priceData, boundaryStartPrices } = await fetchCandlesRange(
        nowSec - lookbackSeconds,
        nowSec
      );
      boundaryStartPriceByTimeRef.current = boundaryStartPrices;
      const mergedPoints = mergePoints(pricePointsRef.current, priceData).slice(-MAX_POINTS);
      pricePointsRef.current = mergedPoints;
      priceSeries.setData(mergedPoints as any);
      marketCapSeries.setData(
        mergedPoints.map((p: PricePoint) => ({
          time: p.time,
          value: p.value * BTC_CIRCULATING_SUPPLY
        })) as any
      );
      chart.timeScale().fitContent();

      const liveTick = latestTickRef.current;
      const latestMergedPoint = mergedPoints[mergedPoints.length - 1];
      if (liveTick && Number.isFinite(liveTick.price) && Number.isFinite(liveTick.time)) {
        applyLivePrice(liveTick.price, liveTick.time);
      } else if (latestMergedPoint) {
        currentPointRef.current = { time: latestMergedPoint.time, value: latestMergedPoint.value };
        applyLivePrice(latestMergedPoint.value, latestMergedPoint.time);
      }

      setMessage("Receiving real-time BTC/USD ticks.");

      if (boundaryMarkersRef.current) {
        boundaryMarkersRef.current.setMarkers(
          buildBoundaryMarkers(pricePointsRef.current, visibleWindowSecondsRef.current)
        );
      }

      const lastTime = pricePointsRef.current[pricePointsRef.current.length - 1]?.time;
      if (Number.isFinite(lastTime)) {
        updateTargetPrice(lastTime as number);
      }

      const initialHistory = buildHistoryFromPoints(
        pricePointsRef.current,
        visibleWindowSecondsRef.current,
        10
      );
      historyResultsRef.current = initialHistory;
      setHistoryResults(initialHistory);
    }

    async function pollTickerOnce() {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const res = await fetch(`${TICKER_REST_URL}?_ts=${Date.now()}`, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const data = await res.json();
        const price = Number(data.price);
        const vol = Number(data.volume);
        const tickerTimeSec = Number.isFinite(Date.parse(data.time))
          ? Math.floor(new Date(data.time).getTime() / 1000)
          : Math.floor(Date.now() / 1000);
        const socketIsFresh = Date.now() - lastSocketTickReceivedAtMsRef.current < 3000;
        if (Number.isFinite(price) && !socketIsFresh) {
          // REST is a fallback only when socket ticks are delayed.
          applyLivePrice(price, tickerTimeSec);
        }
        if (Number.isFinite(vol) && vol > 0 && Number.isFinite(price)) {
          const formattedVolume = formatLargeCurrency(vol * price);
          latestVolume24hRef.current = formattedVolume;
          setLatestVolume24h(formattedVolume);
        }
      } catch {
        // ignore transient network errors
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
        lastSocketTickReceivedAtMsRef.current = Date.now();
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

        lastSocketTickReceivedAtMsRef.current = Date.now();
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
        reconnectTimerRef.current = window.setTimeout(connectSocket, 3000);
      });

      ws.addEventListener("error", () => {
        setConnection("Error");
        setConnectionClass("error");
        setMessage("WebSocket error. Reconnecting...");
        ws.close();
      });
    }

    (async () => {
      lastAnyTickReceivedAtMsRef.current = Date.now();
      connectSocket();
      await pollTickerOnce();
      tickInterval = window.setInterval(pollTickerOnce, 1000);
      watchdogInterval = window.setInterval(() => {
        const nowMs = Date.now();
        const sinceAnyTick = nowMs - lastAnyTickReceivedAtMsRef.current;
        const sinceSocketTick = nowMs - lastSocketTickReceivedAtMsRef.current;

        if (sinceAnyTick > STALE_FEED_MS) {
          setConnection("Resyncing...");
          setConnectionClass("warning");
          setMessage("Feed looks stale. Refreshing ticker and reconnecting socket...");
          pollTickerOnce();
        }

        if (
          websocketRef.current &&
          websocketRef.current.readyState === WebSocket.OPEN &&
          sinceSocketTick > STALE_FEED_MS
        ) {
          websocketRef.current.close();
        }
      }, WATCHDOG_INTERVAL_MS);

      try {
        await loadInitialCandles();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown history sync error";
        setMessage(`Live feed active. History sync failed: ${errorMessage}`);
      }
    })();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      pollTickerOnce();
      if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
        connectSocket();
      }
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);

    const handleCrosshairMove = (param: any) => {
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
      if (metricRef.current === "price") {
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
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (targetPriceLineRef.current && priceSeriesRef.current) {
        priceSeriesRef.current.removePriceLine(targetPriceLineRef.current);
      }
      targetPriceLineRef.current = null;
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      boundaryMarkersRef.current = null;
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    visibleWindowSecondsRef.current = visibleWindowSeconds;

    const chart = chartRef.current;
    if (!chart) return;

    const tickTime = latestTickRef.current?.time ?? Math.floor(Date.now() / 1000);
    const applyWindowState = () => {
      if (!currentPointRef.current) return;
      try {
        chart.timeScale().setVisibleRange({
          from: (tickTime - visibleWindowSeconds) as any,
          to: (tickTime + 5) as any
        });
      } catch {
        // Ignore until chart has enough data loaded.
      }

      if (boundaryMarkersRef.current) {
        boundaryMarkersRef.current.setMarkers(
          buildBoundaryMarkers(pricePointsRef.current, visibleWindowSeconds)
        );
      }

      const boundaryTime = Math.floor(tickTime / visibleWindowSeconds) * visibleWindowSeconds;
      const boundaryOpen = boundaryStartPriceByTimeRef.current.get(boundaryTime);
      const boundaryPrice = Number.isFinite(boundaryOpen)
        ? (boundaryOpen as number)
        : findPriceAtOrBefore(pricePointsRef.current, boundaryTime);
      if (Number.isFinite(boundaryPrice)) {
        targetBoundaryRef.current = boundaryTime;
        targetPriceRef.current = boundaryPrice;
        setTargetPrice(formatPrice(boundaryPrice));
        setTargetTime(formatTime(boundaryTime));
        setPredictionSignal(
          buildPredictionSignal({
            points: pricePointsRef.current,
            currentPrice: latestTickRef.current?.price as number,
            nowUnixSeconds: latestTickRef.current?.time ?? tickTime,
            intervalSeconds: visibleWindowSeconds,
            targetPrice: boundaryPrice,
            targetBoundaryTime: boundaryTime
          })
        );
        if (targetPriceLineRef.current) {
          targetPriceLineRef.current.applyOptions({ price: boundaryPrice });
        } else if (priceSeriesRef.current) {
          targetPriceLineRef.current = priceSeriesRef.current.createPriceLine({
            price: boundaryPrice,
            color: "#94a3b8",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Target"
          });
        }
      }

      const rebuiltHistory = buildHistoryFromPoints(pricePointsRef.current, visibleWindowSeconds, 10);
      historyResultsRef.current = rebuiltHistory;
      setHistoryResults(rebuiltHistory);
    };

    const requiredFrom = tickTime - visibleWindowSeconds - 120;
    const earliestTime = pricePointsRef.current[0]?.time ?? tickTime;
    if (earliestTime <= requiredFrom) {
      applyWindowState();
      return;
    }

    (async () => {
      try {
        const backfillSeconds = Math.max(visibleWindowSeconds * 3, 30 * 60);
        const { points: backfill, boundaryStartPrices } = await fetchCandlesRange(
          tickTime - backfillSeconds,
          tickTime
        );
        for (const [ts, open] of boundaryStartPrices.entries()) {
          boundaryStartPriceByTimeRef.current.set(ts, open);
        }

        if (backfill.length > 0) {
          const merged = mergePoints(pricePointsRef.current, backfill).slice(-MAX_POINTS);
          pricePointsRef.current = merged;
          priceSeriesRef.current?.setData(merged);
          marketCapSeriesRef.current?.setData(
            merged.map((p) => ({
              time: p.time,
              value: p.value * BTC_CIRCULATING_SUPPLY
            }))
          );
        }
      } catch {
        // Non-fatal: keep existing in-memory points if backfill fails.
      } finally {
        applyWindowState();
      }
    })();
  }, [visibleWindowSeconds]);

  useEffect(() => {
    metricRef.current = metric;
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

  return {
    chartContainerRef,
    chartHostRef,
    chartEngine,
    setChartEngine,
    metric,
    setMetric,
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
  };
}
