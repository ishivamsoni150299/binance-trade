/// <reference lib="webworker" />

let intervalId: ReturnType<typeof setInterval> | null = null;
let config: any = null;

self.onmessage = (evt) => {
  const { type, payload } = evt.data;

  switch (type) {
    case 'START':
      config = payload.config;
      if (intervalId) clearInterval(intervalId);
      runBotCycle();
      intervalId = setInterval(runBotCycle, payload.intervalMs ?? 30000);
      break;

    case 'STOP':
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      break;

    case 'UPDATE_CONFIG':
      config = payload.config;
      if (payload.intervalMs && intervalId) {
        clearInterval(intervalId);
        intervalId = setInterval(runBotCycle, payload.intervalMs);
      }
      break;
  }
};

// ── Binance public data — called directly from browser, not blocked ────────
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<number[][]> {
  let lastErr: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(
        `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      if (Array.isArray(data)) return data;
      throw new Error(data?.msg ?? 'Non-array response');
    } catch (e: any) { lastErr = e; }
  }
  throw lastErr ?? new Error('All Binance hosts failed');
}

// ── Indicator math (mirrors api/_lib/indicators/) ─────────────────────────
function calcEma(vals: number[], period: number): number[] {
  if (vals.length < period) return [];
  const k = 2 / (period + 1);
  let ema = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [ema];
  for (let i = period; i < vals.length; i++) {
    ema = vals[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function rsiScore(closes: number[], period = 14, oversold = 30, overbought = 70): number {
  if (closes.length < period + 1) return 0;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  if (rsi <= oversold) return 1;
  if (rsi >= overbought) return -1;
  return rsi < 50 ? (50 - rsi) / (50 - oversold) : -(rsi - 50) / (overbought - 50);
}

function macdScore(closes: number[], fast = 12, slow = 26, signal = 9): number {
  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);
  if (!fastEma.length || !slowEma.length) return 0;
  const macdVals = slowEma.map((s, i) => fastEma[i + (fastEma.length - slowEma.length)] - s);
  const signalLine = calcEma(macdVals, signal);
  if (!signalLine.length) return 0;
  const hist = macdVals[macdVals.length - 1] - signalLine[signalLine.length - 1];
  const scale = Math.abs(macdVals[macdVals.length - 1]) + 0.0001;
  return Math.max(-1, Math.min(1, (hist / scale) * 10));
}

function bollingerScore(closes: number[], period = 20, mult = 2): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  const upper = mid + mult * std, lower = mid - mult * std;
  const cur = closes[closes.length - 1];
  const b = upper === lower ? 0.5 : (cur - lower) / (upper - lower);
  if (b <= 0) return 1;
  if (b >= 1) return -1;
  return b < 0.2 ? 0.7 : b > 0.8 ? -0.7 : (0.5 - b) * 2;
}

function emaScore(closes: number[], fast = 9, slow = 21): number {
  const f = calcEma(closes, fast), s = calcEma(closes, slow);
  if (f.length < 2 || s.length < 2) return 0;
  const crossedAbove = f[f.length - 2] <= s[s.length - 2] && f[f.length - 1] > s[s.length - 1];
  const crossedBelow = f[f.length - 2] >= s[s.length - 2] && f[f.length - 1] < s[s.length - 1];
  if (crossedAbove) return 1;
  if (crossedBelow) return -1;
  return Math.max(-0.5, Math.min(0.5, ((f[f.length - 1] - s[s.length - 1]) / s[s.length - 1]) * 50));
}

function computeSignal(strategy: string, closes: number[], params: any) {
  const p = params ?? {};
  const rsi = rsiScore(closes, p.rsiPeriod ?? 14, p.rsiOversold ?? 30, p.rsiOverbought ?? 70);
  const macd = macdScore(closes, p.macdFast ?? 12, p.macdSlow ?? 26, p.macdSignal ?? 9);
  const bollinger = bollingerScore(closes, p.bbPeriod ?? 20, p.bbMultiplier ?? 2);
  const ema = emaScore(closes, p.emaFast ?? 9, p.emaSlow ?? 21);
  const indicators = { rsi, macd, bollinger, ema };
  const buyTh = p.buyThreshold ?? 0.5;
  const sellTh = p.sellThreshold ?? -0.5;

  let score: number;
  if (strategy === 'RSI') score = rsi;
  else if (strategy === 'MACD') score = macd;
  else if (strategy === 'BOLLINGER') score = bollinger;
  else if (strategy === 'EMA') score = ema;
  else {
    score =
      rsi * (p.rsiWeight ?? 0.25) +
      macd * (p.macdWeight ?? 0.30) +
      bollinger * (p.bbWeight ?? 0.25) +
      ema * (p.emaWeight ?? 0.20);
  }

  const action: 'BUY' | 'SELL' | 'HOLD' =
    score >= buyTh ? 'BUY' : score <= sellTh ? 'SELL' : 'HOLD';

  return { action, score, indicators };
}

// ── Main bot cycle ─────────────────────────────────────────────────────────
async function runBotCycle(): Promise<void> {
  if (!config) return;

  const isPaper = config.riskParams?.paperTrading !== false;

  try {
    self.postMessage({ type: 'CYCLE_START', timestamp: Date.now() });

    // Paper mode: run entirely in browser — no Vercel/server needed
    if (isPaper) {
      const rawKlines = await fetchKlines(config.pair ?? 'BTCUSDT', config.timeframe ?? '1h', 200);
      const closes = rawKlines.map((k: any[]) => parseFloat(k[4]));
      const currentPrice = closes[closes.length - 1];
      const signal = computeSignal(config.strategy ?? 'COMPOSITE', closes, config.strategyParams);
      const risk = config.riskParams ?? {};
      const maxOpenPositions = risk.maxOpenPositions ?? 1;
      const maxDailyLossPct = risk.maxDailyLossPct ?? 5;

      if ((config.openPositions ?? 0) >= maxOpenPositions && signal.action !== 'HOLD') {
        self.postMessage({ type: 'CYCLE_RESULT', result: { action: 'BLOCKED', reason: 'Max open positions reached', score: signal.score, price: currentPrice, indicators: signal.indicators, timestamp: Date.now() } });
        return;
      }
      if ((config.dailyPnlPct ?? 0) <= -maxDailyLossPct) {
        self.postMessage({ type: 'CYCLE_RESULT', result: { action: 'BLOCKED', reason: 'Daily loss limit reached', score: signal.score, price: currentPrice, indicators: signal.indicators, timestamp: Date.now() } });
        return;
      }

      let trade = null;
      if (signal.action !== 'HOLD') {
        const positionSizePct = risk.positionSizePct ?? 5;
        const stopLossPct = risk.stopLossPct ?? 2;
        const takeProfitPct = risk.takeProfitPct ?? 4;
        const quantity = (10000 * positionSizePct / 100) / currentPrice;
        const stopLossPrice = signal.action === 'BUY'
          ? currentPrice * (1 - stopLossPct / 100)
          : currentPrice * (1 + stopLossPct / 100);
        const takeProfitPrice = signal.action === 'BUY'
          ? currentPrice * (1 + takeProfitPct / 100)
          : currentPrice * (1 - takeProfitPct / 100);

        trade = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          pair: config.pair ?? 'BTCUSDT',
          side: signal.action,
          strategy: config.strategy ?? 'COMPOSITE',
          entryPrice: currentPrice,
          quantity,
          fee: quantity * currentPrice * 0.001,
          status: 'open',
          openedAt: Date.now(),
          isPaper: true,
          signalScore: signal.score,
          indicators: signal.indicators,
          stopLossPrice,
          takeProfitPrice,
        };
      }

      self.postMessage({ type: 'CYCLE_RESULT', result: { action: signal.action, score: signal.score, price: currentPrice, indicators: signal.indicators, trade, timestamp: Date.now() } });
      return;
    }

    // Live mode: call Vercel API (server holds Binance API keys)
    const response = await fetch('/api/bot/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Secret': config.botSecret ?? '',
      },
      body: JSON.stringify({
        pair: config.pair,
        timeframe: config.timeframe,
        strategy: config.strategy,
        strategyParams: config.strategyParams,
        riskParams: config.riskParams,
        paperTrading: false,
        openPositions: config.openPositions ?? 0,
        dailyPnlPct: config.dailyPnlPct ?? 0,
      }),
    });

    const result = await response.json();
    self.postMessage({ type: 'CYCLE_RESULT', result });
  } catch (err: any) {
    self.postMessage({ type: 'CYCLE_ERROR', error: err.message });
  }
}
