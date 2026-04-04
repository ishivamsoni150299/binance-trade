import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKlines, getAvailableBalance, placeOrder, getOpenOrders } from '../_lib/binance-client';
import { compositeStrategy } from '../_lib/composite-strategy';
import { checkRisk } from '../_lib/risk-manager';
import { rsiScore } from '../_lib/indicators/rsi';
import { macdScore } from '../_lib/indicators/macd';
import { bollingerScore } from '../_lib/indicators/bollinger';
import { emaScore } from '../_lib/indicators/ema';

const BOT_SECRET = process.env['BOT_SECRET'] ?? '';

function verifySecret(req: VercelRequest): boolean {
  if (!BOT_SECRET) return true; // No secret set — allow all (dev mode)
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
      strategyParams = {},
      riskParams = {},
      paperTrading = true,
      openPositions = 0,
      dailyPnlPct = 0,
    } = config;

    // 1. Fetch candle history from Binance
    const rawKlines = await getKlines(pair, timeframe, 200);
    const closes = rawKlines.map((k: number[]) => parseFloat(k[4].toString()));

    if (closes.length < 30) {
      return res.status(200).json({ action: 'HOLD', reason: 'Insufficient data', closes: closes.length });
    }

    // 2. Run composite strategy
    const signal = compositeStrategy(closes, strategyParams);

    // 3. Individual indicator values for UI display
    const indicators = {
      rsi: rsiScore(closes, strategyParams.rsiPeriod ?? 14, strategyParams.rsiOversold ?? 30, strategyParams.rsiOverbought ?? 70),
      macd: macdScore(closes, strategyParams.macdFast ?? 12, strategyParams.macdSlow ?? 26, strategyParams.macdSignal ?? 9),
      bollinger: bollingerScore(closes, strategyParams.bbPeriod ?? 20, strategyParams.bbMultiplier ?? 2),
      ema: emaScore(closes, strategyParams.emaFast ?? 9, strategyParams.emaSlow ?? 21),
    };

    const currentPrice = closes[closes.length - 1];

    if (signal.action === 'HOLD') {
      return res.status(200).json({ action: 'HOLD', score: signal.score, price: currentPrice, indicators, timestamp: Date.now() });
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
      },
      currentPrice,
      availableBalance,
      openPositions,
      dailyPnlPct,
    );

    if (!risk.allowed) {
      return res.status(200).json({
        action: 'BLOCKED',
        reason: risk.reason,
        score: signal.score,
        price: currentPrice,
        indicators,
        timestamp: Date.now(),
      });
    }

    // 5. Execute trade
    let trade: any = null;
    const tradeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (paperTrading) {
      trade = {
        id: tradeId,
        pair,
        side: signal.action,
        strategy: 'COMPOSITE',
        entryPrice: currentPrice,
        quantity: risk.positionSize,
        fee: (risk.positionSize! * currentPrice) * 0.001,
        status: 'open',
        openedAt: Date.now(),
        isPaper: true,
        signalScore: signal.score,
        indicators: signal.indicators,
        stopLossPrice: risk.stopLossPrice,
        takeProfitPrice: risk.takeProfitPrice,
      };
    } else {
      const order = await placeOrder(pair, signal.action, risk.positionSize!);
      trade = {
        id: tradeId,
        pair,
        side: signal.action,
        strategy: 'COMPOSITE',
        entryPrice: parseFloat(order.fills?.[0]?.price ?? currentPrice),
        quantity: parseFloat(order.executedQty),
        fee: order.fills?.reduce((s: number, f: any) => s + parseFloat(f.commission), 0) ?? 0,
        status: 'open',
        openedAt: Date.now(),
        isPaper: false,
        signalScore: signal.score,
        indicators: signal.indicators,
        binanceOrderId: order.orderId,
        stopLossPrice: risk.stopLossPrice,
        takeProfitPrice: risk.takeProfitPrice,
      };
    }

    return res.status(200).json({
      action: signal.action,
      score: signal.score,
      price: currentPrice,
      indicators,
      trade,
      timestamp: Date.now(),
    });

  } catch (err: any) {
    console.error('Bot run error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error', timestamp: Date.now() });
  }
}
