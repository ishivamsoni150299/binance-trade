import { rsiScore } from './indicators/rsi';
import { macdScore } from './indicators/macd';
import { bollingerScore } from './indicators/bollinger';
import { emaScore } from './indicators/ema';

export interface Signal {
  action: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  indicators: {
    rsi: number;
    macd: number;
    bollinger: number;
    ema: number;
  };
}

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

export function compositeStrategy(closes: number[], params: StrategyParams = {}): Signal {
  const {
    rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70,
    macdFast = 12, macdSlow = 26, macdSignal = 9,
    bbPeriod = 20, bbMultiplier = 2,
    emaFast = 9, emaSlow = 21,
    rsiWeight = 0.25, macdWeight = 0.30,
    bbWeight = 0.25, emaWeight = 0.20,
    buyThreshold = 0.5, sellThreshold = -0.5,
  } = params;

  const rsi = rsiScore(closes, rsiPeriod, rsiOversold, rsiOverbought);
  const macd = macdScore(closes, macdFast, macdSlow, macdSignal);
  const bollinger = bollingerScore(closes, bbPeriod, bbMultiplier);
  const ema = emaScore(closes, emaFast, emaSlow);

  const totalWeight = rsiWeight + macdWeight + bbWeight + emaWeight;
  const score = (rsi * rsiWeight + macd * macdWeight + bollinger * bbWeight + ema * emaWeight) / totalWeight;

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (score >= buyThreshold) action = 'BUY';
  else if (score <= sellThreshold) action = 'SELL';

  return { action, score, indicators: { rsi, macd, bollinger, ema } };
}
