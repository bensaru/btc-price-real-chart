# BTC/USD Realtime Dashboard

React + Vite app for live BTC/USD tracking with charting, interval target tracking, prediction, and recent interval results.

## Features

- Realtime BTC/USD chart with Coinbase WebSocket ticker feed
- 1-second backup polling from Coinbase REST ticker when socket ticks are delayed
- Time window buttons: `5m`, `15m`, `1h`, `4h`, `1d`
- Interval target logic:
  - "Price To Beat" is the price at the start of the selected interval
  - Dashed target price line on chart
  - Red boundary markers at interval start points
- Prediction panel for current interval close:
  - `UP` / `DOWN` direction
  - `UP %` and `DOWN %` probabilities
  - expected close price and remaining seconds
- Last 10 completed interval results table (`Start`, `Target`, `Close`, `Diff`, `Result`)
- Browser title updates with current price and signed delta vs target
- Optional chart engine toggle (Lightweight Charts / TradingView iframe)

## Tech Stack

- React 19
- Vite 7
- `lightweight-charts`
- Coinbase public APIs (no API key required)

## Run Locally

```bash
npm install
npm start
```

Vite prints the local URL in the terminal (for example `http://localhost:5173`, or the next available port).

## Available Scripts

- `npm start` - start dev server
- `npm run dev` - start dev server
- `npm run build` - create production build in `dist`
- `npm run preview` - preview production build

## Project Structure

- `src/App.jsx` - top-level layout and component wiring
- `src/hooks/useBtcRealtimeChart.js` - realtime data, chart state, target/prediction/history logic
- `src/components/StatusRow.jsx` - status cards + prediction panel
- `src/components/ChartControls.jsx` - metric/timescale/chart-engine controls
- `src/components/ChartViewport.jsx` - chart container / TradingView iframe
- `src/components/HistoryResults.jsx` - last 10 interval results table
- `src/constants/chartConfig.js` - endpoints and timescale options
- `src/utils/formatters.js` - formatting helpers
