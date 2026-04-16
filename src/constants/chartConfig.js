export const HISTORY_URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles";
export const TICKER_REST_URL = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";
export const WS_URL = "wss://ws-feed.exchange.coinbase.com";
export const BTC_CIRCULATING_SUPPLY = 19_650_000;
export const DOCUMENT_TITLE_BASE = "BTC Live Chart";
export const DEFAULT_VISIBLE_WINDOW_SECONDS = 5 * 60;
export const TIME_WINDOW_OPTIONS = [
  { label: "5m", value: 5 * 60, tvInterval: "5" },
  { label: "15m", value: 15 * 60, tvInterval: "15" },
  { label: "1h", value: 60 * 60, tvInterval: "60" },
  { label: "4h", value: 4 * 60 * 60, tvInterval: "240" },
  { label: "1d", value: 24 * 60 * 60, tvInterval: "D" }
];
