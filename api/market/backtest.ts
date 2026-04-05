import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKlinesRange } from '../_lib/binance-client';
import { getStrategySignal, StrategyParams, StrategyType } from '../_lib/strategy';
import { TRUSTED_PAIRS } from '../_lib/trusted';

type RiskParams = {
  positionSizePct?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
};

function intervalToMs(interval: string): number {
  switch (interval) {
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '30m': return 1_800_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
    default: return 3_600_000;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.method === 'POST' ? req.body ?? {} : req.query ?? {};
    const symbol = (body.symbol ?? 'BTCUSDT') as string;
    const interval = (body.interval ?? '1h') as string;
    const days = Math.max(1, Math.min(365, Number(body.days ?? 30)));
    const strategy = (body.strategy ?? 'COMPOSITE') as StrategyType;
    const strategyParams = (body.strategyParams ?? {}) as StrategyParams;
    const riskParams = (body.riskParams ?? {}) as RiskParams;
    const trustedOnly = String(body.trustedOnly ?? 'true') === 'true';
    const rawTrusted = body.trustedPairs ?? TRUSTED_PAIRS;
    const trustedPairs = Array.isArray(rawTrusted)
      ? rawTrusted
      : typeof rawTrusted === 'string'
        ? rawTrusted.split(',').map(s => s.trim()).filter(Boolean)
        : TRUSTED_PAIRS;

    if (trustedOnly && !trustedPairs.includes(symbol)) {
      return res.status(200).json({ error: 'Pair not in trusted list' });
    }

    const now = Date.now();
    const startTime = now - days * 86_400_000;
    const rawAll = await getKlinesRange(symbol, interval, startTime, now, 1000);
    if (!rawAll.length) return res.status(200).json({ error: 'No data for range' });
    const maxCandles = 5000;
    const sliced = rawAll.length > maxCandles ? rawAll.slice(rawAll.length - maxCandles) : rawAll;

    const candles = sliced.map((k: number[]) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    const startBalance = 10000;
    let balance = startBalance;
    let peak = balance;
    let maxDrawdown = 0;
    let trades = 0;
    let wins = 0;
    let totalPnl = 0;
    let position: {
      side: 'BUY' | 'SELL';
      entry: number;
      qty: number;
      stop: number;
      take: number;
    } | null = null;

    const minBars = Math.max(30, Math.floor(60_000 / intervalToMs(interval)));
    const stopLossPct = riskParams.stopLossPct ?? 2;
    const takeProfitPct = riskParams.takeProfitPct ?? 4;
    const positionSizePct = riskParams.positionSizePct ?? 5;

    for (let i = minBars; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const closes = slice.map(c => c.close);
      const signal = getStrategySignal(strategy, closes, strategyParams);
      const bar = candles[i];
      const price = bar.close;

      if (position) {
        let exitPrice: number | null = null;
        if (position.side === 'BUY') {
          if (bar.low <= position.stop) exitPrice = position.stop;
          else if (bar.high >= position.take) exitPrice = position.take;
          else if (signal.action === 'SELL') exitPrice = price;
        } else {
          if (bar.high >= position.stop) exitPrice = position.stop;
          else if (bar.low <= position.take) exitPrice = position.take;
          else if (signal.action === 'BUY') exitPrice = price;
        }

        if (exitPrice != null) {
          const gross = (exitPrice - position.entry) * position.qty * (position.side === 'BUY' ? 1 : -1);
          const fee = (position.entry * position.qty + exitPrice * position.qty) * 0.001;
          const pnl = gross - fee;
          balance += pnl;
          totalPnl += pnl;
          trades += 1;
          if (pnl > 0) wins += 1;
          peak = Math.max(peak, balance);
          maxDrawdown = Math.max(maxDrawdown, peak - balance);
          position = null;
        }
      }

      if (!position && (signal.action === 'BUY' || signal.action === 'SELL')) {
        const riskAmount = balance * (positionSizePct / 100);
        const qty = riskAmount / price;
        const stop = signal.action === 'BUY'
          ? price * (1 - stopLossPct / 100)
          : price * (1 + stopLossPct / 100);
        const take = signal.action === 'BUY'
          ? price * (1 + takeProfitPct / 100)
          : price * (1 - takeProfitPct / 100);
        position = { side: signal.action, entry: price, qty, stop, take };
      }
    }

    const winRate = trades ? (wins / trades) * 100 : 0;
    const totalPnlPct = ((balance - startBalance) / startBalance) * 100;
    const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

    return res.status(200).json({
      symbol,
      interval,
      days,
      trades,
      wins,
      winRate,
      totalPnl,
      totalPnlPct,
      maxDrawdown,
      maxDrawdownPct,
      finalBalance: balance,
      candles: candles.length,
      note: rawAll.length > maxCandles ? `Capped to last ${maxCandles} candles` : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Backtest failed' });
  }
}
