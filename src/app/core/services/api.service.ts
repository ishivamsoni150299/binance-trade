import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  trustedOnly?: boolean;
  trustedPairs?: string[];
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

// Binance public API hosts - called directly from the browser (not blocked unlike Vercel/AWS)
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
  private cache = new Map<string, { ts: number; data: any }>();

  constructor(private http: HttpClient) {}

  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, force = false): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (!force && hit && (now - hit.ts) < ttlMs) {
      return hit.data as T;
    }
    const data = await fn();
    this.cache.set(key, { ts: now, data });
    return data;
  }

  // Public market data - called directly from the browser (bypasses Vercel/AWS block)
  async getKlines(symbol: string, interval: string, limit = 200, force = false): Promise<Candle[]> {
    const key = `klines:${symbol}:${interval}:${limit}`;
    const raw = await this.cached(
      key,
      5000,
      () => binanceFetch(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
      force
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

  async getTickersBySymbols(symbols: string[], force = false): Promise<any[]> {
    const key = `tickers:${symbols.join(',')}`;
    return this.cached(
      key,
      10000,
      () => binanceFetch(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`),
      force
    );
  }

  async getMiniTickers(window: '1h' | '4h' | '24h', force = false): Promise<any[]> {
    const key = `mini:${window}`;
    const path = window === '24h'
      ? `/api/v3/ticker/24hr?type=MINI`
      : `/api/v3/ticker?windowSize=${window}&type=MINI`;
    return this.cached(key, 10000, () => binanceFetch(path), force);
  }

  // Signed / bot actions - must go through Vercel proxy (server holds API keys)
  async getWalletBalances(force = false): Promise<WalletResponse> {
    return this.cached(
      'wallet',
      15000,
      () => firstValueFrom(this.http.get<WalletResponse>('/api/wallet/balances')),
      force
    );
  }

  // Backtest - runs on server for consistent strategy logic
  async runBacktest(payload: BacktestRequest): Promise<BacktestResult> {
    return firstValueFrom(this.http.post<BacktestResult>('/api/market/backtest', payload));
  }
}
