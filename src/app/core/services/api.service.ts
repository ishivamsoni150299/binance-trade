import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Candle } from '../models/types';

export interface WalletBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface WalletResponse {
  balances: WalletBalance[];
  timestamp?: number;
  updatedAt?: number;
}

export interface BacktestRequest {
  symbol: string;
  interval: string;
  days: number;
  strategy: string;
  strategyParams: Record<string, number>;
  riskParams: Record<string, number>;
}

export interface BacktestResult {
  symbol: string;
  interval: string;
  days: number;
  trades: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  finalBalance: number;
  candles: number;
  error?: string;
  note?: string;
}

// Binance public API hosts — called directly from the browser (not blocked unlike Vercel/AWS)
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

async function binanceFetch(path: string): Promise<any> {
  let lastErr: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.msg ?? `HTTP ${res.status}`);
      return data;
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('All Binance hosts failed');
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // Public market data — called directly from the browser (bypasses Vercel/AWS block)
  async getKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
    const raw = await binanceFetch(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    return (raw as any[]).map((k: any[]) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  async getTickersBySymbols(symbols: string[]): Promise<any[]> {
    return binanceFetch(
      `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    );
  }

  async getMiniTickers(window: '1h' | '4h' | '24h'): Promise<any[]> {
    const path = window === '24h'
      ? `/api/v3/ticker/24hr?type=MINI`
      : `/api/v3/ticker?windowSize=${window}&type=MINI`;
    return binanceFetch(path);
  }

  // Signed / bot actions — must go through Vercel proxy (server holds API keys)
  async getWalletBalances(): Promise<WalletResponse> {
    return firstValueFrom(this.http.get<WalletResponse>('/api/wallet/balances'));
  }

  // Backtest — runs entirely in browser (fetches Binance data directly, computes locally)
  async runBacktest(payload: BacktestRequest): Promise<BacktestResult> {
    const { symbol, interval, days, strategy, strategyParams, riskParams } = payload;

    // Fetch enough candles to cover the requested days
    const limit = Math.min(1000, Math.ceil(days * this.candlesPerDay(interval)) + 50);
    const raw = await binanceFetch(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);

    if (!Array.isArray(raw) || raw.length < 30) {
      return { symbol, interval, days, trades: 0, wins: 0, winRate: 0, totalPnl: 0, totalPnlPct: 0, maxDrawdown: 0, maxDrawdownPct: 0, finalBalance: 10000, candles: raw?.length ?? 0, error: 'Insufficient data' };
    }

    const candles = (raw as any[][]).map(k => ({ close: parseFloat(k[4]), high: parseFloat(k[2]), low: parseFloat(k[3]) }));
    const closes = candles.map(c => c.close);

    const startBalance = 10000;
    const positionSizePct = riskParams?.['positionSizePct'] ?? 5;
    const stopLossPct = riskParams?.['stopLossPct'] ?? 2;
    const takeProfitPct = riskParams?.['takeProfitPct'] ?? 4;

    let balance = startBalance;
    let peak = balance;
    let maxDrawdown = 0;
    let trades = 0, wins = 0;
    let inPosition = false;
    let entryPrice = 0, side = '';
    let stopPrice = 0, tpPrice = 0;
    const warmup = 35; // enough for MACD slow(26) + signal(9)

    for (let i = warmup; i < candles.length; i++) {
      const slice = closes.slice(0, i + 1);
      const price = candles[i].close;
      const high = candles[i].high;
      const low = candles[i].low;

      if (inPosition) {
        let exitPrice: number | null = null;
        if (side === 'BUY') {
          if (low <= stopPrice) exitPrice = stopPrice;
          else if (high >= tpPrice) exitPrice = tpPrice;
        } else {
          if (high >= stopPrice) exitPrice = stopPrice;
          else if (low <= tpPrice) exitPrice = tpPrice;
        }
        if (exitPrice !== null) {
          const pnlPct = side === 'BUY' ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice;
          const pnl = balance * (positionSizePct / 100) * pnlPct;
          balance += pnl - balance * (positionSizePct / 100) * 0.001;
          if (pnl > 0) wins++;
          trades++;
          inPosition = false;
          if (balance > peak) peak = balance;
          const dd = (peak - balance) / peak * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }
        continue;
      }

      const sig = this.computeSignal(strategy, slice, strategyParams);
      if (sig.action === 'BUY' || sig.action === 'SELL') {
        inPosition = true;
        side = sig.action;
        entryPrice = price;
        stopPrice = sig.action === 'BUY' ? price * (1 - stopLossPct / 100) : price * (1 + stopLossPct / 100);
        tpPrice = sig.action === 'BUY' ? price * (1 + takeProfitPct / 100) : price * (1 - takeProfitPct / 100);
      }
    }

    const totalPnl = balance - startBalance;
    const totalPnlPct = (totalPnl / startBalance) * 100;

    return {
      symbol, interval, days,
      trades, wins,
      winRate: trades > 0 ? (wins / trades) * 100 : 0,
      totalPnl, totalPnlPct,
      maxDrawdown: (maxDrawdown / 100) * startBalance,
      maxDrawdownPct: maxDrawdown,
      finalBalance: balance,
      candles: candles.length,
      note: trades === 0 ? 'No trades triggered — thresholds may be too strict' : undefined,
    };
  }

  private candlesPerDay(interval: string): number {
    const map: Record<string, number> = { '1m': 1440, '5m': 288, '15m': 96, '30m': 48, '1h': 24, '4h': 6, '1d': 1 };
    return map[interval] ?? 24;
  }

  private computeSignal(strategy: string, closes: number[], params: any): { action: 'BUY' | 'SELL' | 'HOLD'; score: number } {
    const p = params ?? {};
    const rsi = this.rsiScore(closes, p.rsiPeriod ?? 14, p.rsiOversold ?? 30, p.rsiOverbought ?? 70);
    const macd = this.macdScore(closes, p.macdFast ?? 12, p.macdSlow ?? 26, p.macdSignal ?? 9);
    const bb = this.bollingerScore(closes, p.bbPeriod ?? 20, p.bbMultiplier ?? 2);
    const ema = this.emaScore(closes, p.emaFast ?? 9, p.emaSlow ?? 21);
    const buyTh = p.buyThreshold ?? 0.5;
    const sellTh = p.sellThreshold ?? -0.5;

    let score: number;
    if (strategy === 'RSI') score = rsi;
    else if (strategy === 'MACD') score = macd;
    else if (strategy === 'BOLLINGER') score = bb;
    else if (strategy === 'EMA') score = ema;
    else score = rsi * (p.rsiWeight ?? 0.25) + macd * (p.macdWeight ?? 0.30) + bb * (p.bbWeight ?? 0.25) + ema * (p.emaWeight ?? 0.20);

    const action: 'BUY' | 'SELL' | 'HOLD' = score >= buyTh ? 'BUY' : score <= sellTh ? 'SELL' : 'HOLD';
    return { action, score };
  }

  private calcEma(vals: number[], period: number): number[] {
    if (vals.length < period) return [];
    const k = 2 / (period + 1);
    let ema = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const out = [ema];
    for (let i = period; i < vals.length; i++) { ema = vals[i] * k + ema * (1 - k); out.push(ema); }
    return out;
  }

  private rsiScore(closes: number[], period = 14, oversold = 30, overbought = 70): number {
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

  private macdScore(closes: number[], fast = 12, slow = 26, signal = 9): number {
    const f = this.calcEma(closes, fast), s = this.calcEma(closes, slow);
    if (!f.length || !s.length) return 0;
    const macdVals = s.map((sv, i) => f[i + (f.length - s.length)] - sv);
    const sig = this.calcEma(macdVals, signal);
    if (!sig.length) return 0;
    const hist = macdVals[macdVals.length - 1] - sig[sig.length - 1];
    return Math.max(-1, Math.min(1, (hist / (Math.abs(macdVals[macdVals.length - 1]) + 0.0001)) * 10));
  }

  private bollingerScore(closes: number[], period = 20, mult = 2): number {
    if (closes.length < period) return 0;
    const slice = closes.slice(-period);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
    const upper = mid + mult * std, lower = mid - mult * std;
    const cur = closes[closes.length - 1];
    const b = upper === lower ? 0.5 : (cur - lower) / (upper - lower);
    if (b <= 0) return 1; if (b >= 1) return -1;
    return b < 0.2 ? 0.7 : b > 0.8 ? -0.7 : (0.5 - b) * 2;
  }

  private emaScore(closes: number[], fast = 9, slow = 21): number {
    const f = this.calcEma(closes, fast), s = this.calcEma(closes, slow);
    if (f.length < 2 || s.length < 2) return 0;
    if (f[f.length - 2] <= s[s.length - 2] && f[f.length - 1] > s[s.length - 1]) return 1;
    if (f[f.length - 2] >= s[s.length - 2] && f[f.length - 1] < s[s.length - 1]) return -1;
    return Math.max(-0.5, Math.min(0.5, ((f[f.length - 1] - s[s.length - 1]) / s[s.length - 1]) * 50));
  }
}
