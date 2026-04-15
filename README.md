# BTC Live Chart (1-second updates)

This project shows a real-time BTC/USD chart using:

- TradingView **Lightweight Charts** (free, open-source chart library)
- Coinbase public REST + WebSocket feed (free market data endpoints)

## Run

```bash
npm start
```

Then open:

- `http://localhost:3000`

## Notes

- The chart receives live tick data and updates once per second.
- Candle interval is 1 minute (OHLC candles).
- No API key is required for this demo.
