import { compositeStrategy } from './composite-strategy';
import { rsiScore } from './indicators/rsi';
import { macdScore } from './indicators/macd';
import { bollingerScore } from './indicators/bollinger';
import { calcEma, emaScore } from './indicators/ema';

export type StrategyType = 'RSI' | 'MACD' | 'BOLLINGER' | 'EMA' | 'COMPOSITE';

export interface StrategyParams {
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  bbPeriod?: number;
  bbMultiplier?: number;
  emaFast?: number;
  emaSlow?: number;
  useTrendFilter?: boolean;
  trendEmaFast?: number;
  trendEmaSlow?: number;
  trendThresholdPct?: number;
  useVolatilityFilter?: boolean;
  volatilityLookback?: number;
  minVolatilityPct?: number;
  maxVolatilityPct?: number;
  rsiWeight?: number;
  macdWeight?: number;
  bbWeight?: number;
  emaWeight?: number;
  buyThreshold?: number;
  sellThreshold?: number;
}

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  volatilityPct: number;
  trendPct: number;
  filterReason?: string;
  indicators: {
    rsi: number;
    macd: number;
    bollinger: number;
    ema: number;
  };
}

function actionFromScore(score: number, buyThreshold = 0.5, sellThreshold = -0.5): 'BUY' | 'SELL' | 'HOLD' {
  if (score >= buyThreshold) return 'BUY';
  if (score <= sellThreshold) return 'SELL';
  return 'HOLD';
}

function calcVolatilityPct(closes: number[], lookback: number): number {
  if (closes.length < lookback + 1) return 0;
  const start = closes.length - lookback;
  const rets: number[] = [];
  for (let i = start; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev <= 0) continue;
    rets.push(((cur - prev) / prev) * 100);
  }
  if (rets.length === 0) return 0;
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

function calcTrendPct(closes: number[], fast: number, slow: number): number {
  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);
  if (!fastEma.length || !slowEma.length) return 0;
  const fastNow = fastEma[fastEma.length - 1];
  const slowNow = slowEma[slowEma.length - 1];
  return slowNow === 0 ? 0 : ((fastNow - slowNow) / slowNow) * 100;
}

export function getStrategySignal(
  strategy: StrategyType,
  closes: number[],
  params: StrategyParams = {},
): StrategySignal {
  const rsi = rsiScore(closes, params.rsiPeriod ?? 14, params.rsiOversold ?? 30, params.rsiOverbought ?? 70);
  const macd = macdScore(closes, params.macdFast ?? 12, params.macdSlow ?? 26, params.macdSignal ?? 9);
  const bollinger = bollingerScore(closes, params.bbPeriod ?? 20, params.bbMultiplier ?? 2);
  const ema = emaScore(closes, params.emaFast ?? 9, params.emaSlow ?? 21);
  const indicators = { rsi, macd, bollinger, ema };
  const volatilityPct = calcVolatilityPct(closes, params.volatilityLookback ?? 20);
  const trendPct = calcTrendPct(closes, params.trendEmaFast ?? 20, params.trendEmaSlow ?? 50);

  if (strategy === 'COMPOSITE') {
    const composite = compositeStrategy(closes, params);
    const filtered = applyFilters(composite.action, volatilityPct, trendPct, params);
    return { action: filtered.action, score: composite.score, volatilityPct, trendPct, filterReason: filtered.reason, indicators };
  }

  const buyThreshold = params.buyThreshold ?? 0.5;
  const sellThreshold = params.sellThreshold ?? -0.5;
  let score = 0;
  if (strategy === 'RSI') score = rsi;
  if (strategy === 'MACD') score = macd;
  if (strategy === 'BOLLINGER') score = bollinger;
  if (strategy === 'EMA') score = ema;

  const baseAction = actionFromScore(score, buyThreshold, sellThreshold);
  const filtered = applyFilters(baseAction, volatilityPct, trendPct, params);
  return { action: filtered.action, score, volatilityPct, trendPct, filterReason: filtered.reason, indicators };
}

function applyFilters(
  action: 'BUY' | 'SELL' | 'HOLD',
  volatilityPct: number,
  trendPct: number,
  params: StrategyParams,
): { action: 'BUY' | 'SELL' | 'HOLD'; reason?: string } {
  if (action === 'HOLD') return { action };

  const useVol = params.useVolatilityFilter !== false;
  const minVol = params.minVolatilityPct ?? 0.4;
  const maxVol = params.maxVolatilityPct ?? 8;
  if (useVol && (volatilityPct < minVol || volatilityPct > maxVol)) {
    return { action: 'HOLD', reason: 'Volatility filter' };
  }

  const useTrend = params.useTrendFilter !== false;
  const threshold = params.trendThresholdPct ?? 0.1;
  if (useTrend) {
    if (action === 'BUY' && trendPct < threshold) return { action: 'HOLD', reason: 'Trend filter' };
    if (action === 'SELL' && trendPct > -threshold) return { action: 'HOLD', reason: 'Trend filter' };
  }

  return { action };
}
