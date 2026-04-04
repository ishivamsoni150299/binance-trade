export function calcEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function emaScore(closes: number[], fast = 9, slow = 21): number {
  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);
  if (fastEma.length < 2 || slowEma.length < 2) return 0;

  const fastNow = fastEma[fastEma.length - 1];
  const fastPrev = fastEma[fastEma.length - 2];
  const slowNow = slowEma[slowEma.length - 1];
  const slowPrev = slowEma[slowEma.length - 2];

  const crossedAbove = fastPrev <= slowPrev && fastNow > slowNow;
  const crossedBelow = fastPrev >= slowPrev && fastNow < slowNow;
  if (crossedAbove) return 1;
  if (crossedBelow) return -1;

  // Trend strength
  const diff = (fastNow - slowNow) / slowNow;
  return Math.max(-0.5, Math.min(0.5, diff * 50));
}
