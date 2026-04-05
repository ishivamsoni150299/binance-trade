import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKlines, getAvailableBalance, placeOrder, getOpenOrders, getTickersBySymbols } from '../_lib/binance-client';
import { checkRisk } from '../_lib/risk-manager';
import { getStrategySignal } from '../_lib/strategy';
import { TRUSTED_PAIRS } from '../_lib/trusted';

const BOT_SECRET = process.env['BOT_SECRET'] ?? '';

function verifySecret(req: VercelRequest): boolean {
  if (!BOT_SECRET) return true; // No secret set - allow all (dev mode)
  return req.headers['x-bot-secret'] === BOT_SECRET ||
    req.headers['authorization'] === `Bearer ${BOT_SECRET}`;
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
      trustedOnly = true,
      trustedPairs = TRUSTED_PAIRS,
      scanEnabled = true,
    } = config;

    const rawTrusted = Array.isArray(trustedPairs)
      ? trustedPairs
      : typeof trustedPairs === 'string'
        ? trustedPairs.split(',').map(s => s.trim()).filter(Boolean)
        : TRUSTED_PAIRS;

    if (trustedOnly && !rawTrusted.includes(pair) && !scanEnabled) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: 'Pair not in trusted list',
        score: 0,
        price: 0,
        indicators: {},
        pair,
        timestamp: Date.now(),
      });
    }

    let selectedPair = pair;
    if (scanEnabled) {
      const candidates = trustedOnly ? rawTrusted : rawTrusted.length ? rawTrusted : [pair];
      const best = await pickBestPair(candidates);
      if (best) selectedPair = best;
    }

    // 1. Fetch candle history from Binance
    const rawKlines = await getKlines(selectedPair, timeframe, 200);
    const closes = rawKlines.map((k: number[]) => parseFloat(k[4].toString()));

    if (closes.length < 30) {
      return res.status(200).json({ action: 'HOLD', reason: 'Insufficient data', closes: closes.length, pair: selectedPair });
    }

    // 2. Run strategy (selected in UI)
    const signal = getStrategySignal(strategy, closes, strategyParams);
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
      {
        positionSizePct: riskParams.positionSizePct ?? 5,
        stopLossPct: riskParams.stopLossPct ?? 2,
        takeProfitPct: riskParams.takeProfitPct ?? 4,
        maxDailyLossPct: riskParams.maxDailyLossPct ?? 5,
        maxOpenPositions: riskParams.maxOpenPositions ?? 1,
        dynamicPositionSizing: riskParams.dynamicPositionSizing ?? false,
        minPositionSizePct: riskParams.minPositionSizePct ?? 1,
        maxPositionSizePct: riskParams.maxPositionSizePct ?? 10,
        volatilityTargetPct: riskParams.volatilityTargetPct ?? 2,
      },
      currentPrice,
      availableBalance,
      openPositions,
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
    console.error('Bot run error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error', timestamp: Date.now() });
  }
}

async function pickBestPair(symbols: string[]): Promise<string | null> {
  if (!symbols.length) return null;
  try {
    const tickers = await getTickersBySymbols(symbols);
    if (!Array.isArray(tickers) || tickers.length === 0) return symbols[0];
    let maxMomentum = 0;
    let maxVolume = 0;
    for (const t of tickers) {
      const momentum = Math.abs(parseFloat(t.priceChangePercent ?? '0'));
      const volume = parseFloat(t.quoteVolume ?? '0');
      if (momentum > maxMomentum) maxMomentum = momentum;
      if (volume > maxVolume) maxVolume = volume;
    }
    let best = symbols[0];
    let bestScore = -1;
    for (const t of tickers) {
      const momentum = Math.abs(parseFloat(t.priceChangePercent ?? '0'));
      const volume = parseFloat(t.quoteVolume ?? '0');
      const momentumScore = maxMomentum > 0 ? momentum / maxMomentum : 0;
      const volumeScore = maxVolume > 0 ? volume / maxVolume : 0;
      const score = momentumScore * 0.6 + volumeScore * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = t.symbol ?? best;
      }
    }
    return best;
  } catch {
    return symbols[0] ?? null;
  }
}
