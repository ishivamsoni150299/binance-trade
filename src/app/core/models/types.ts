export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type StrategyType = 'RSI' | 'MACD' | 'BOLLINGER' | 'EMA' | 'COMPOSITE';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'open' | 'closed' | 'cancelled';
export type BotStatus = 'running' | 'stopped' | 'paused' | 'error';

export interface StrategyParams {
  // RSI
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  // MACD
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  // Bollinger Bands
  bbPeriod: number;
  bbMultiplier: number;
  // EMA Crossover
  emaFast: number;
  emaSlow: number;
  // Filters
  useTrendFilter: boolean;
  trendEmaFast: number;
  trendEmaSlow: number;
  trendThresholdPct: number;
  useVolatilityFilter: boolean;
  volatilityLookback: number;
  minVolatilityPct: number;
  maxVolatilityPct: number;
  confirmBars: number;
  adaptiveWeights: boolean;
  trendRegimeThresholdPct: number;
  // Composite weights (sum to 1)
  rsiWeight: number;
  macdWeight: number;
  bbWeight: number;
  emaWeight: number;
  buyThreshold: number;
  sellThreshold: number;
}

export interface RiskParams {
  positionSizePct: number;    // % of balance per trade
  stopLossPct: number;        // % below entry
  takeProfitPct: number;      // % above entry
  maxDailyLossPct: number;    // pause bot if daily loss exceeds this
  maxOpenPositions: number;   // max concurrent open trades
  dynamicPositionSizing: boolean;
  minPositionSizePct: number;
  maxPositionSizePct: number;
  volatilityTargetPct: number;
  maxDrawdownPct: number;
  cooldownSec: number;
  noTradeStartHour: number;   // 0-23
  noTradeEndHour: number;     // 0-23
  paperTrading: boolean;
}

export interface BotConfig {
  enabled: boolean;
  pair: string;               // e.g. BTCUSDT
  trustedOnly: boolean;
  trustedPairs: string[];
  scanEnabled: boolean;
  scanTopN: number;
  scanMinQuoteVolume: number;
  scanRotationSec: number;
  simpleMode: boolean;
  autoStart: boolean;
  timeframe: Timeframe;
  strategy: StrategyType;
  strategyParams: StrategyParams;
  riskParams: RiskParams;
  botIntervalSec: number;
}

export interface Trade {
  id: string;
  pair: string;
  side: TradeSide;
  strategy: StrategyType;
  entryPrice: number;
  exitPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPct?: number;
  fee: number;
  status: TradeStatus;
  openedAt: number;           // Unix ms
  closedAt?: number;
  isPaper: boolean;
  signalScore: number;        // composite score at signal time
  indicators?: Record<string, number>;
  binanceOrderId?: string;
}

export interface Signal {
  action: 'BUY' | 'SELL' | 'HOLD';
  score: number;              // -1 to +1
  indicators: {
    rsi?: number;
    macd?: number;
    bollinger?: number;
    ema?: number;
  };
}

export interface PortfolioSnapshot {
  totalValue: number;
  availableBalance: number;
  inPositionValue: number;
  totalPnl: number;
  dailyPnl: number;
  dailyPnlPct: number;
  openTrades: number;
}

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbMultiplier: 2,
  emaFast: 9,
  emaSlow: 21,
  useTrendFilter: true,
  trendEmaFast: 20,
  trendEmaSlow: 50,
  trendThresholdPct: 0.1,
  useVolatilityFilter: true,
  volatilityLookback: 20,
  minVolatilityPct: 0.4,
  maxVolatilityPct: 8,
  confirmBars: 2,
  adaptiveWeights: true,
  trendRegimeThresholdPct: 0.3,
  rsiWeight: 0.25,
  macdWeight: 0.30,
  bbWeight: 0.25,
  emaWeight: 0.20,
  buyThreshold: 0.5,
  sellThreshold: -0.5,
};

export const DEFAULT_RISK_PARAMS: RiskParams = {
  positionSizePct: 5,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxDailyLossPct: 5,
  maxOpenPositions: 1,
  dynamicPositionSizing: true,
  minPositionSizePct: 1,
  maxPositionSizePct: 8,
  volatilityTargetPct: 2,
  maxDrawdownPct: 12,
  cooldownSec: 90,
  noTradeStartHour: 0,
  noTradeEndHour: 0,
  paperTrading: true,
};

export const TRUSTED_PAIRS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'DOTUSDT',
  'MATICUSDT',
  'LINKUSDT',
];

export const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: false,
  pair: 'BTCUSDT',
  trustedOnly: true,
  trustedPairs: TRUSTED_PAIRS,
  scanEnabled: true,
  scanTopN: 4,
  scanMinQuoteVolume: 20_000_000,
  scanRotationSec: 120,
  simpleMode: true,
  autoStart: true,
  timeframe: '1h',
  strategy: 'COMPOSITE',
  strategyParams: DEFAULT_STRATEGY_PARAMS,
  riskParams: DEFAULT_RISK_PARAMS,
  botIntervalSec: 30,
};
