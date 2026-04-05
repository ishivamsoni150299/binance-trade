import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKlines, getAvailableBalance, placeOrder, getOpenOrders, getTickersBySymbols } from '../_lib/binance-client';
import { checkRisk } from '../_lib/risk-manager';
import { getStrategySignal } from '../_lib/strategy';
import { TRUSTED_PAIRS } from '../_lib/trusted';

const BOT_SECRET = process.env['BOT_SECRET'] ?? '';
const LIVE_TRADING_ENABLED = process.env['LIVE_TRADING_ENABLED'] === 'true';
const BOT_KILL_SWITCH = process.env['BOT_KILL_SWITCH'] === 'true';
const ERROR_WEBHOOK_URL = process.env['ERROR_WEBHOOK_URL'] ?? '';
const BINANCE_API_KEY = process.env['BINANCE_API_KEY'] ?? '';
const BINANCE_API_SECRET = process.env['BINANCE_API_SECRET'] ?? '';

function verifySecret(req: VercelRequest): boolean {
  if (!BOT_SECRET) return true; // No secret set - allow all (dev mode)
  return req.headers['x-bot-secret'] === BOT_SECRET ||
    req.headers['authorization'] === `Bearer ${BOT_SECRET}`;
}

function inNoTradeWindow(startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  const h = new Date().getUTCHours();
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

function toNumber(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function reportError(err: any, context: Record<string, any> = {}): void {
  try {
    console.error('Bot error:', err, context);
    if (!ERROR_WEBHOOK_URL) return;
    fetch(ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err?.message ?? err), context, ts: Date.now() }),
    }).catch(() => {});
  } catch {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Bot-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifySecret(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const config = req.body ?? {};
    const {
      pair = 'BTCUSDT',
      timeframe = '1h',
      strategy = 'COMPOSITE',
      strategyParams = {},
      riskParams = {},
      paperTrading = true,
      openPositions = 0,
      dailyPnlPct = 0,
      maxDrawdownPct = 0,
      lastClosedAt = 0,
      trustedOnly = true,
      trustedPairs = TRUSTED_PAIRS,
      scanEnabled = true,
      scanTopN = 3,
      scanMinQuoteVolume = 10_000_000,
      scanRotationSec = 60,
    } = config;

    const safeTimeframes = new Set(['1m','5m','15m','30m','1h','4h','1d']);
    const safeStrategies = new Set(['RSI','MACD','BOLLINGER','EMA','COMPOSITE']);
    const safeTimeframe = safeTimeframes.has(String(timeframe)) ? String(timeframe) : '1h';
    const safeStrategy = safeStrategies.has(String(strategy)) ? String(strategy) : 'COMPOSITE';

    const safeRisk = {
      positionSizePct: clamp(toNumber(riskParams.positionSizePct, 5), 0.1, 20),
      stopLossPct: clamp(toNumber(riskParams.stopLossPct, 2), 0.1, 20),
      takeProfitPct: clamp(toNumber(riskParams.takeProfitPct, 4), 0.1, 50),
      maxDailyLossPct: clamp(toNumber(riskParams.maxDailyLossPct, 5), 1, 50),
      maxOpenPositions: clamp(Math.floor(toNumber(riskParams.maxOpenPositions, 1)), 1, 10),
      dynamicPositionSizing: riskParams.dynamicPositionSizing ?? false,
      minPositionSizePct: clamp(toNumber(riskParams.minPositionSizePct, 1), 0.1, 10),
      maxPositionSizePct: clamp(toNumber(riskParams.maxPositionSizePct, 10), 0.5, 20),
      volatilityTargetPct: clamp(toNumber(riskParams.volatilityTargetPct, 2), 0.2, 10),
      maxDrawdownPct: clamp(toNumber(riskParams.maxDrawdownPct, 12), 5, 80),
      cooldownSec: clamp(toNumber(riskParams.cooldownSec, 90), 0, 3600),
      noTradeStartHour: clamp(Math.floor(toNumber(riskParams.noTradeStartHour, 0)), 0, 23),
      noTradeEndHour: clamp(Math.floor(toNumber(riskParams.noTradeEndHour, 0)), 0, 23),
    };

    const liveRequested = paperTrading === false;
    if (liveRequested) {
      if (BOT_KILL_SWITCH) {
        return res.status(200).json({ action: 'BLOCKED', reason: 'Kill switch enabled', timestamp: Date.now() });
      }
      if (!LIVE_TRADING_ENABLED) {
        return res.status(200).json({ action: 'BLOCKED', reason: 'Live trading disabled', timestamp: Date.now() });
      }
      if (!BOT_SECRET || !verifySecret(req)) {
        return res.status(200).json({ action: 'BLOCKED', reason: 'Bot secret required', timestamp: Date.now() });
      }
      if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
        return res.status(200).json({ action: 'BLOCKED', reason: 'Binance API keys missing', timestamp: Date.now() });
      }
    }

    const rawTrusted = Array.isArray(trustedPairs)
      ? trustedPairs
      : typeof trustedPairs === 'string'
        ? trustedPairs.split(',').map(s => s.trim()).filter(Boolean)
        : TRUSTED_PAIRS;
    const safeScanTopN = clamp(Math.floor(toNumber(scanTopN, 3)), 1, 10);
    const safeScanMinQuoteVolume = clamp(toNumber(scanMinQuoteVolume, 10_000_000), 1_000_000, 1_000_000_000);
    const safeScanRotationSec = clamp(Math.floor(toNumber(scanRotationSec, 60)), 0, 600);
    const safeScanEnabled = !!scanEnabled;

    const now = Date.now();
    if (safeRisk.maxDrawdownPct && maxDrawdownPct >= safeRisk.maxDrawdownPct) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: 'Max drawdown reached',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      });
    }

    if (safeRisk.cooldownSec && lastClosedAt && (now - lastClosedAt) < safeRisk.cooldownSec * 1000) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: 'Trade cooldown',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      });
    }

    if (inNoTradeWindow(safeRisk.noTradeStartHour, safeRisk.noTradeEndHour)) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: 'No-trade window',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      });
    }

    if (trustedOnly && !rawTrusted.includes(pair) && !safeScanEnabled) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: 'Pair not in trusted list',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: now,
      });
    }

    let selectedPair = pair;
    let signal = null as ReturnType<typeof getStrategySignal> | null;

    if (safeScanEnabled) {
      const candidates = trustedOnly ? rawTrusted : rawTrusted.length ? rawTrusted : [pair];
      const tickers = await getTickersBySymbols(candidates);
      const lists = buildScanLists(tickers, safeScanMinQuoteVolume, safeScanTopN, safeScanRotationSec);
      const best = await pickPairBySignal(lists, safeTimeframe, safeStrategy, strategyParams);
      if (best) {
        selectedPair = best.pair;
        signal = best.signal;
      } else if (lists.long.length) {
        selectedPair = lists.long[0].symbol;
      }
    }

    // 1. Fetch candle history from Binance
    const rawKlines = await getKlines(selectedPair, safeTimeframe, 200);
    const closes = rawKlines.map((k: number[]) => parseFloat(k[4].toString()));

    if (closes.length < 30) {
      return res.status(200).json({ action: 'HOLD', reason: 'Insufficient data', closes: closes.length, pair: selectedPair });
    }

    // 2. Run strategy (selected in UI)
    if (!signal) {
      signal = getStrategySignal(safeStrategy as any, closes, strategyParams);
    }
    const indicators = signal.indicators;

    const currentPrice = closes[closes.length - 1];

    if (signal.action === 'HOLD') {
      return res.status(200).json({
        action: 'HOLD',
        reason: signal.filterReason,
        score: signal.score,
        price: currentPrice,
        indicators,
        pair: selectedPair,
        timestamp: Date.now(),
      });
    }

    // 4. Risk check
    let availableBalance = 10000; // Paper trading default
    if (!paperTrading) {
      availableBalance = await getAvailableBalance('USDT');
    }

    const risk = checkRisk(
      safeRisk,
      currentPrice,
      availableBalance,
      clamp(Math.floor(toNumber(openPositions, 0)), 0, 50),
      dailyPnlPct,
      signal.action,
      signal.score,
      signal.volatilityPct,
    );

    if (!risk.allowed) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: risk.reason,
        score: signal.score,
        price: currentPrice,
        indicators,
        pair: selectedPair,
        timestamp: Date.now(),
      });
    }

    const stopLossPrice = risk.stopLossPrice ?? currentPrice;
    const takeProfitPrice = risk.takeProfitPrice ?? currentPrice;

    // 5. Execute trade
    let trade: any = null;
    const tradeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (paperTrading) {
      trade = {
        id: tradeId,
        pair: selectedPair,
        side: signal.action,
        strategy,
        entryPrice: currentPrice,
        quantity: risk.positionSize,
        fee: (risk.positionSize! * currentPrice) * 0.001,
        status: 'open',
        openedAt: Date.now(),
        isPaper: true,
        signalScore: signal.score,
        indicators: signal.indicators,
        stopLossPrice,
        takeProfitPrice,
      };
    } else {
      const openOrders = await getOpenOrders(selectedPair);
      if (Array.isArray(openOrders) && openOrders.length > 0) {
        return res.status(200).json({
          action: 'BLOCKED',
          reason: 'Open orders exist',
          score: signal.score,
          price: currentPrice,
          indicators,
          pair: selectedPair,
          timestamp: Date.now(),
        });
      }
      const order = await placeOrder(selectedPair, signal.action, risk.positionSize!);
      trade = {
        id: tradeId,
        pair: selectedPair,
        side: signal.action,
        strategy,
        entryPrice: parseFloat(order.fills?.[0]?.price ?? currentPrice),
        quantity: parseFloat(order.executedQty),
        fee: order.fills?.reduce((s: number, f: any) => s + parseFloat(f.commission), 0) ?? 0,
        status: 'open',
        openedAt: Date.now(),
        isPaper: false,
        signalScore: signal.score,
        indicators: signal.indicators,
        binanceOrderId: order.orderId,
        stopLossPrice,
        takeProfitPrice,
      };
    }

    return res.status(200).json({
      action: signal.action,
      score: signal.score,
      price: currentPrice,
      indicators,
      pair: selectedPair,
      trade,
      timestamp: Date.now(),
    });

  } catch (err: any) {
    reportError(err, { route: 'bot/run' });
    return res.status(500).json({ error: err.message ?? 'Internal error', timestamp: Date.now() });
  }
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
): Promise<{ pair: string; signal: ReturnType<typeof getStrategySignal> } | null> {
  const seen = new Set<string>();
  const candidates = [...lists.long, ...lists.short].filter(c => {
    if (seen.has(c.symbol)) return false;
    seen.add(c.symbol);
    return true;
  });
  if (!candidates.length) return null;

  let best: { pair: string; signal: ReturnType<typeof getStrategySignal>; score: number } | null = null;
  for (const c of candidates) {
    const raw = await getKlines(c.symbol, timeframe, 200);
    const closes = raw.map((k: number[]) => parseFloat(k[4].toString()));
    if (closes.length < 30) continue;
    const signal = getStrategySignal(strategy as any, closes, strategyParams);
    if (signal.action === 'HOLD') continue;
    const momentumScore = signal.action === 'BUY' ? c.longScore : c.shortScore;
    const score = Math.abs(signal.score) * 0.7 + momentumScore * 0.3;
    if (!best || score > best.score) best = { pair: c.symbol, signal, score };
  }
  return best ? { pair: best.pair, signal: best.signal } : null;
}
