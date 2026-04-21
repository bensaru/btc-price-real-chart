export type StatusTone = "ok" | "warning" | "error" | "";

export interface TimeWindowOption {
  label: string;
  value: number;
  tvInterval: string;
}

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  time: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
}

export interface HistoryResultItem {
  id: string;
  startTime: string;
  /** Interval close time (same scale as Start). */
  intervalEndTime: string;
  targetPrice: string;
  closePrice: string;
  diffText: string;
  deltaClass: StatusTone;
  resultText: "UP" | "DOWN" | "FLAT";
}

export interface PredictionSignal {
  direction: "UP" | "DOWN" | "WAITING";
  directionClass: StatusTone;
  upProbability: string;
  downProbability: string;
  expectedClose: string;
  remainingText: string;
}
