import { calcEma } from './ema';

export interface MacdResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export function calcMacd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdResult | null {
  if (closes.length < slow + signal) return null;

  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);

  // Align arrays - slow EMA starts later
  const macdValues: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdValues.push(fastEma[i + (fastEma.length - slowEma.length)] - slowEma[i]);
  }

  const signalEma = calcEma(macdValues, signal);
  if (!signalEma.length) return null;

  const macdNow = macdValues[macdValues.length - 1];
  const signalNow = signalEma[signalEma.length - 1];

  return {
    macdLine: macdNow,
    signalLine: signalNow,
    histogram: macdNow - signalNow,
  };
}

export function macdScore(closes: number[], fast = 12, slow = 26, signal = 9): number {
  const result = calcMacd(closes, fast, slow, signal);
  if (!result) return 0;

  const hist = result.histogram;
  // Score based on histogram sign and magnitude
  if (hist > 0) return Math.min(1, hist / (Math.abs(result.macdLine) + 0.0001) * 10);
  if (hist < 0) return Math.max(-1, hist / (Math.abs(result.macdLine) + 0.0001) * 10);
  return 0;
}