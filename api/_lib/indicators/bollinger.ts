export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  percentB: number; // 0 = lower band, 1 = upper band
}

export function calcBollinger(closes: number[], period = 20, multiplier = 2): BollingerResult | null {
  if (closes.length < period) return null;

  const slice = closes.slice(closes.length - period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;
  const current = closes[closes.length - 1];
  const percentB = upper === lower ? 0.5 : (current - lower) / (upper - lower);

  return { upper, middle, lower, percentB };
}

export function bollingerScore(closes: number[], period = 20, multiplier = 2): number {
  const result = calcBollinger(closes, period, multiplier);
  if (!result) return 0;

  const b = result.percentB;
  if (b <= 0) return 1;     // Below lower band - strong buy
  if (b >= 1) return -1;    // Above upper band - strong sell
  if (b < 0.2) return 0.7;
  if (b > 0.8) return -0.7;
  // Linear: 0.5 -> 0 (neutral at midpoint)
  return (0.5 - b) * 2;
}