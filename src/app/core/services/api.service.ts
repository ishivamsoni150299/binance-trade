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

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  async getKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('interval', interval)
      .set('limit', String(limit));
    return firstValueFrom(this.http.get<Candle[]>('/api/market/klines', { params }));
  }

  async getTickersBySymbols(symbols: string[]): Promise<any[]> {
    const params = new HttpParams().set('symbols', JSON.stringify(symbols));
    return firstValueFrom(this.http.get<any[]>('/api/market/tickers', { params }));
  }

  async getMiniTickers(window: '1h' | '4h' | '24h'): Promise<any[]> {
    const params = new HttpParams()
      .set('window', window)
      .set('type', 'MINI');
    return firstValueFrom(this.http.get<any[]>('/api/market/tickers', { params }));
  }

  async getWalletBalances(): Promise<WalletResponse> {
    return firstValueFrom(this.http.get<WalletResponse>('/api/wallet/balances'));
  }
}
