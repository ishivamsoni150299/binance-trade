/** RSI — Wilder smoothing method */
export function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Returns score: +1 (oversold→buy), -1 (overbought→sell), 0 (neutral) */
export function rsiScore(
  closes: number[],
  period = 14,
  oversold = 30,
  overbought = 70,
): number {
  const rsi = calcRsi(closes, period);
  if (rsi <= oversold) return 1;
  if (rsi >= overbought) return -1;
  // Linear interpolation in the middle
  if (rsi < 50) return (50 - rsi) / (50 - oversold);
  return -(rsi - 50) / (overbought - 50);
}
