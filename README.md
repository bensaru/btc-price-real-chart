# BTC Live Chart (React + Vite)

This app shows a real-time BTC/USD chart using:

- React + Vite
- TradingView `lightweight-charts` package
- Coinbase public REST + WebSocket feed

## Run locally

```bash
npm install
npm start
```

Vite prints the local URL in terminal (usually `http://localhost:5173`).

## Scripts

- `npm start` or `npm run dev` - start development server
- `npm run build` - create production build
- `npm run preview` - preview built app

## Notes

- Chart and page title update every second via Coinbase REST ticker (WebSocket ticker can be sparse).
- Candles are 1-minute OHLC bars.
- No API key required for this demo.
