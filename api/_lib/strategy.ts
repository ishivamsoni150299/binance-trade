import { compositeStrategy } from './composite-strategy';
import { rsiScore } from './indicators/rsi';
import { macdScore } from './indicators/macd';
import { bollingerScore } from './indicators/bollinger';
import { emaScore } from './indicators/ema';

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

  if (strategy === 'COMPOSITE') {
    const composite = compositeStrategy(closes, params);
    return { action: composite.action, score: composite.score, indicators };
  }

  const buyThreshold = params.buyThreshold ?? 0.5;
  const sellThreshold = params.sellThreshold ?? -0.5;
  let score = 0;
  if (strategy === 'RSI') score = rsi;
  if (strategy === 'MACD') score = macd;
  if (strategy === 'BOLLINGER') score = bollinger;
  if (strategy === 'EMA') score = ema;

  return { action: actionFromScore(score, buyThreshold, sellThreshold), score, indicators };
}
