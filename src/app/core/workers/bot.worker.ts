/// <reference lib="webworker" />

let intervalId: ReturnType<typeof setInterval> | null = null;
let config: any = null;
let tickerCache: { key: string; ts: number; data: any[] } | null = null;

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

// Binance public data - called directly from browser (not blocked)
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

async function fetchTickersBySymbols(symbols: string[]): Promise<any[]> {
  let lastErr: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(
        `${host}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      if (Array.isArray(data)) return data;
      throw new Error(data?.msg ?? 'Non-array response');
    } catch (e: any) { lastErr = e; }
  }
  throw lastErr ?? new Error('All Binance hosts failed');
}

async function getTickersCached(symbols: string[]): Promise<any[]> {
  const key = symbols.join(',');
  const now = Date.now();
  if (tickerCache && tickerCache.key === key && (now - tickerCache.ts) < 60000) {
    return tickerCache.data;
  }
  const data = await fetchTickersBySymbols(symbols);
  tickerCache = { key, ts: now, data };
  return data;
}

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

// Indicator math (mirrors api/_lib/indicators/)
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
  const f = calcEma(closes, fast);
  const s = calcEma(closes, slow);
  if (!f.length || !s.length) return 0;
  const fNow = f[f.length - 1];
  const sNow = s[s.length - 1];
  return sNow === 0 ? 0 : ((fNow - sNow) / sNow) * 100;
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
  const base = computeScore(strategy, closes, p);
  const indicators = base.indicators;
  const buyTh = p.buyThreshold ?? 0.5;
  const sellTh = p.sellThreshold ?? -0.5;
  const volatilityPct = calcVolatilityPct(closes, p.volatilityLookback ?? 20);
  const trendPct = calcTrendPct(closes, p.trendEmaFast ?? 20, p.trendEmaSlow ?? 50);
  const confirmBars = Math.max(1, Math.min(5, p.confirmBars ?? 1));

  if (confirmBars <= 1) {
    const action: 'BUY' | 'SELL' | 'HOLD' = base.score >= buyTh ? 'BUY' : base.score <= sellTh ? 'SELL' : 'HOLD';
    const filtered = applyFilters(action, volatilityPct, trendPct, p);
    return { action: filtered.action, score: base.score, indicators, volatilityPct, trendPct, filterReason: filtered.reason };
  }

  const scores: number[] = [];
  for (let i = confirmBars - 1; i >= 0; i--) {
    const slice = closes.slice(0, closes.length - i);
    if (slice.length < 30) continue;
    scores.push(computeScore(strategy, slice, p).score);
  }
  const avgScore = scores.length ? (scores.reduce((s, v) => s + v, 0) / scores.length) : base.score;
  const buyHits = scores.filter(s => s >= buyTh).length;
  const sellHits = scores.filter(s => s <= sellTh).length;
  const minHits = Math.ceil(confirmBars * 0.6);

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (buyHits >= minHits) action = 'BUY';
  else if (sellHits >= minHits) action = 'SELL';
  else action = avgScore >= buyTh ? 'BUY' : avgScore <= sellTh ? 'SELL' : 'HOLD';

  const filtered = applyFilters(action, volatilityPct, trendPct, p);
  return { action: filtered.action, score: avgScore, indicators, volatilityPct, trendPct, filterReason: filtered.reason };
}

function applyFilters(
  action: 'BUY' | 'SELL' | 'HOLD',
  volatilityPct: number,
  trendPct: number,
  params: any,
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

function computePositionSizePct(risk: any, signalScore: number, volatilityPct: number): number {
  const base = risk.positionSizePct ?? 5;
  if (!risk.dynamicPositionSizing) return base;
  const strength = Math.min(1, Math.abs(signalScore));
  const volTarget = risk.volatilityTargetPct ?? 2;
  const minPct = risk.minPositionSizePct ?? Math.min(1, base);
  const maxPct = risk.maxPositionSizePct ?? base;

  let volFactor = 1;
  if (volatilityPct && volatilityPct > 0) {
    volFactor = volTarget / volatilityPct;
  }
  volFactor = Math.max(0.5, Math.min(1.5, volFactor));

  let sizePct = base * strength * volFactor;
  sizePct = Math.max(minPct, Math.min(maxPct, sizePct));
  return sizePct;
}

function computeScore(strategy: string, closes: number[], p: any) {
  const rsi = rsiScore(closes, p.rsiPeriod ?? 14, p.rsiOversold ?? 30, p.rsiOverbought ?? 70);
  const macd = macdScore(closes, p.macdFast ?? 12, p.macdSlow ?? 26, p.macdSignal ?? 9);
  const bollinger = bollingerScore(closes, p.bbPeriod ?? 20, p.bbMultiplier ?? 2);
  const ema = emaScore(closes, p.emaFast ?? 9, p.emaSlow ?? 21);
  const indicators = { rsi, macd, bollinger, ema };

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
  return { score, indicators };
}

function inNoTradeWindow(startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  const now = new Date();
  const h = now.getHours();
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

type ScanCandidate = {
  symbol: string;
  longScore: number;
  shortScore: number;
};

function rotate<T>(list: T[], rotationSec: number): T[] {
  if (!rotationSec || list.length === 0) return list;
  const idx = Math.floor(Date.now() / (rotationSec * 1000)) % list.length;
  return list.slice(idx).concat(list.slice(0, idx));
}

function buildScanLists(tickers: any[], minQuoteVolume: number, topN: number, rotationSec: number) {
  if (!Array.isArray(tickers) || tickers.length === 0) return { long: [] as ScanCandidate[], short: [] as ScanCandidate[] };
  const filtered = tickers.filter(t => parseFloat(t.quoteVolume ?? '0') >= minQuoteVolume);
  if (!filtered.length) return { long: [] as ScanCandidate[], short: [] as ScanCandidate[] };

  let maxPos = 0;
  let maxNeg = 0;
  let maxVol = 0;
  for (const t of filtered) {
    const chg = parseFloat(t.priceChangePercent ?? '0');
    const vol = parseFloat(t.quoteVolume ?? '0');
    if (chg > maxPos) maxPos = chg;
    if (chg < 0 && Math.abs(chg) > maxNeg) maxNeg = Math.abs(chg);
    if (vol > maxVol) maxVol = vol;
  }

  const candidates: ScanCandidate[] = filtered.map(t => {
    const symbol = t.symbol;
    const chg = parseFloat(t.priceChangePercent ?? '0');
    const vol = parseFloat(t.quoteVolume ?? '0');
    const volScore = maxVol > 0 ? vol / maxVol : 0;
    const longMomentum = chg > 0 && maxPos > 0 ? chg / maxPos : 0;
    const shortMomentum = chg < 0 && maxNeg > 0 ? Math.abs(chg) / maxNeg : 0;
    const longScore = longMomentum * 0.6 + volScore * 0.4;
    const shortScore = shortMomentum * 0.6 + volScore * 0.4;
    return { symbol, longScore, shortScore };
  });

  const long = rotate(
    [...candidates].sort((a, b) => b.longScore - a.longScore).slice(0, Math.max(1, topN)),
    rotationSec
  );
  const short = rotate(
    [...candidates].sort((a, b) => b.shortScore - a.shortScore).slice(0, Math.max(1, topN)),
    rotationSec
  );
  return { long, short };
}

async function pickPairBySignal(
  lists: { long: ScanCandidate[]; short: ScanCandidate[] },
  timeframe: string,
  strategy: string,
  strategyParams: any,
): Promise<{ pair: string; signal: any } | null> {
  const seen = new Set<string>();
  const candidates = [...lists.long, ...lists.short].filter(c => {
    if (seen.has(c.symbol)) return false;
    seen.add(c.symbol);
    return true;
  });
  if (!candidates.length) return null;

  let best: { pair: string; signal: any; score: number } | null = null;
  for (const c of candidates) {
    const raw = await fetchKlines(c.symbol, timeframe, 200);
    const closes = raw.map((k: any[]) => parseFloat(k[4]));
    if (closes.length < 30) continue;
    const signal = computeSignal(strategy, closes, strategyParams);
    if (signal.action === 'HOLD') continue;
    const momentumScore = signal.action === 'BUY' ? c.longScore : c.shortScore;
    const score = Math.abs(signal.score) * 0.7 + momentumScore * 0.3;
    if (!best || score > best.score) best = { pair: c.symbol, signal, score };
  }
  return best ? { pair: best.pair, signal: best.signal } : null;
}

// Main bot cycle
async function runBotCycle(): Promise<void> {
  if (!config) return;

  const isPaper = config.riskParams?.paperTrading !== false;
  const pair = config.pair ?? 'BTCUSDT';
  const trustedOnly = config.trustedOnly === true;
  const trustedPairs = Array.isArray(config.trustedPairs) ? config.trustedPairs : [];
  const scanEnabled = config.scanEnabled === true;
  const scanTopN = config.scanTopN ?? 3;
  const scanMinQuoteVolume = config.scanMinQuoteVolume ?? 10_000_000;
  const scanRotationSec = config.scanRotationSec ?? 60;
  const risk = config.riskParams ?? {};
  const now = Date.now();

  if (risk.maxDrawdownPct && (config.maxDrawdownPct ?? 0) >= risk.maxDrawdownPct) {
    self.postMessage({
      type: 'CYCLE_RESULT',
      result: {
        action: 'BLOCKED',
        reason: 'Max drawdown reached',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      },
    });
    return;
  }

  if (risk.cooldownSec && config.lastClosedAt && (now - config.lastClosedAt) < risk.cooldownSec * 1000) {
    self.postMessage({
      type: 'CYCLE_RESULT',
      result: {
        action: 'BLOCKED',
        reason: 'Trade cooldown',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      },
    });
    return;
  }

  if (inNoTradeWindow(risk.noTradeStartHour ?? 0, risk.noTradeEndHour ?? 0)) {
    self.postMessage({
      type: 'CYCLE_RESULT',
      result: {
        action: 'BLOCKED',
        reason: 'No-trade window',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      },
    });
    return;
  }

  if (trustedOnly && !trustedPairs.includes(pair) && !scanEnabled) {
    self.postMessage({
      type: 'CYCLE_RESULT',
      result: {
        action: 'BLOCKED',
        reason: 'Pair not in trusted list',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: Date.now(),
      },
    });
    return;
  }

  try {
    self.postMessage({ type: 'CYCLE_START', timestamp: Date.now() });

    // Paper mode: run entirely in browser - no Vercel/server needed
    if (isPaper) {
      let selectedPair = pair;
      let signal: any = null;
      if (scanEnabled) {
        const candidates = trustedOnly ? trustedPairs : (trustedPairs.length ? trustedPairs : [pair]);
        const tickers = await getTickersCached(candidates);
        const lists = buildScanLists(tickers, scanMinQuoteVolume, scanTopN, scanRotationSec);
        const best = await pickPairBySignal(lists, config.timeframe ?? '1h', config.strategy ?? 'COMPOSITE', config.strategyParams);
        if (best) {
          selectedPair = best.pair;
          signal = best.signal;
        } else if (lists.long.length) {
          selectedPair = lists.long[0].symbol;
        }
      }

      const rawKlines = await fetchKlines(selectedPair, config.timeframe ?? '1h', 200);
      const closes = rawKlines.map((k: any[]) => parseFloat(k[4]));
      const currentPrice = closes[closes.length - 1];
      if (!signal) signal = computeSignal(config.strategy ?? 'COMPOSITE', closes, config.strategyParams);
      const maxOpenPositions = risk.maxOpenPositions ?? 1;
      const maxDailyLossPct = risk.maxDailyLossPct ?? 5;

      if ((config.openPositions ?? 0) >= maxOpenPositions && signal.action !== 'HOLD') {
        self.postMessage({ type: 'CYCLE_RESULT', result: { action: 'BLOCKED', reason: 'Max open positions reached', score: signal.score, price: currentPrice, indicators: signal.indicators, pair: selectedPair, timestamp: Date.now() } });
        return;
      }
      if ((config.dailyPnlPct ?? 0) <= -maxDailyLossPct) {
        self.postMessage({ type: 'CYCLE_RESULT', result: { action: 'BLOCKED', reason: 'Daily loss limit reached', score: signal.score, price: currentPrice, indicators: signal.indicators, pair: selectedPair, timestamp: Date.now() } });
        return;
      }

      let trade = null;
      if (signal.action !== 'HOLD') {
        const positionSizePct = computePositionSizePct(risk, signal.score, signal.volatilityPct);
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
          pair: selectedPair,
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

      self.postMessage({ type: 'CYCLE_RESULT', result: { action: signal.action, score: signal.score, price: currentPrice, indicators: signal.indicators, pair: selectedPair, trade, reason: signal.filterReason, timestamp: Date.now() } });
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
        pair,
        timeframe: config.timeframe,
        strategy: config.strategy,
        strategyParams: config.strategyParams,
        riskParams: config.riskParams,
        paperTrading: false,
        openPositions: config.openPositions ?? 0,
        dailyPnlPct: config.dailyPnlPct ?? 0,
        maxDrawdownPct: config.maxDrawdownPct ?? 0,
        lastClosedAt: config.lastClosedAt ?? 0,
        trustedOnly: config.trustedOnly ?? true,
        trustedPairs: config.trustedPairs ?? [],
        scanEnabled: config.scanEnabled ?? true,
        scanTopN: config.scanTopN ?? 3,
        scanMinQuoteVolume: config.scanMinQuoteVolume ?? 10_000_000,
        scanRotationSec: config.scanRotationSec ?? 60,
      }),
    });

    const result = await response.json();
    self.postMessage({ type: 'CYCLE_RESULT', result });
  } catch (err: any) {
    self.postMessage({ type: 'CYCLE_ERROR', error: err.message });
  }
}
