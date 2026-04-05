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
  confirmBars?: number;
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
  const base = computeScore(strategy, closes, params);
  const indicators = base.indicators;
  const volatilityPct = calcVolatilityPct(closes, params.volatilityLookback ?? 20);
  const trendPct = calcTrendPct(closes, params.trendEmaFast ?? 20, params.trendEmaSlow ?? 50);
  const buyThreshold = params.buyThreshold ?? 0.5;
  const sellThreshold = params.sellThreshold ?? -0.5;

  const confirmBars = Math.max(1, Math.min(5, params.confirmBars ?? 1));
  if (confirmBars <= 1) {
    const baseAction = actionFromScore(base.score, buyThreshold, sellThreshold);
    const filtered = applyFilters(baseAction, volatilityPct, trendPct, params);
    return { action: filtered.action, score: base.score, volatilityPct, trendPct, filterReason: filtered.reason, indicators };
  }

  const scores: number[] = [];
  for (let i = confirmBars - 1; i >= 0; i--) {
    const slice = closes.slice(0, closes.length - i);
    if (slice.length < 30) continue;
    scores.push(computeScore(strategy, slice, params).score);
  }
  const avgScore = scores.length ? (scores.reduce((s, v) => s + v, 0) / scores.length) : base.score;
  const buyHits = scores.filter(s => s >= buyThreshold).length;
  const sellHits = scores.filter(s => s <= sellThreshold).length;
  const minHits = Math.ceil(confirmBars * 0.6);

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (buyHits >= minHits) action = 'BUY';
  else if (sellHits >= minHits) action = 'SELL';
  else action = actionFromScore(avgScore, buyThreshold, sellThreshold);

  const filtered = applyFilters(action, volatilityPct, trendPct, params);
  return { action: filtered.action, score: avgScore, volatilityPct, trendPct, filterReason: filtered.reason, indicators };
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

function computeScore(
  strategy: StrategyType,
  closes: number[],
  params: StrategyParams,
): { score: number; indicators: StrategySignal['indicators'] } {
  const rsi = rsiScore(closes, params.rsiPeriod ?? 14, params.rsiOversold ?? 30, params.rsiOverbought ?? 70);
  const macd = macdScore(closes, params.macdFast ?? 12, params.macdSlow ?? 26, params.macdSignal ?? 9);
  const bollinger = bollingerScore(closes, params.bbPeriod ?? 20, params.bbMultiplier ?? 2);
  const ema = emaScore(closes, params.emaFast ?? 9, params.emaSlow ?? 21);
  const indicators = { rsi, macd, bollinger, ema };

  if (strategy === 'COMPOSITE') {
    const composite = compositeStrategy(closes, params);
    return { score: composite.score, indicators };
  }

  let score = 0;
  if (strategy === 'RSI') score = rsi;
  if (strategy === 'MACD') score = macd;
  if (strategy === 'BOLLINGER') score = bollinger;
  if (strategy === 'EMA') score = ema;
  return { score, indicators };
}
