import { Injectable, signal, computed, effect } from '@angular/core';
import { CredentialsService } from './credentials.service';

export interface RealBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class BinanceProxyService {
  readonly balances   = signal<RealBalance[]>([]);
  readonly loading    = signal(false);
  readonly error      = signal<string | null>(null);
  readonly lastFetch  = signal(0);
  readonly connected  = computed(() => this.balances().length > 0 && !this.error());

  private pollTimer: any = null;

  constructor(private creds: CredentialsService) {
    // Auto-fetch when worker URL becomes available
    effect(() => {
      if (this.creds.hasWorker()) {
        void this.fetchBalance();
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
  }

  /** Fetch real account balance through Cloudflare Worker */
  async fetchBalance(): Promise<void> {
    const url = this.creds.proxyUrl('/api/v3/account');
    if (!url) { this.error.set('Worker URL not configured'); return; }

    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!res.ok || data.code) {
        throw new Error(data.msg ?? data.error ?? `API error ${res.status}`);
      }

      const balances: RealBalance[] = (data.balances ?? [])
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => ({
          asset: b.asset,
          free:   parseFloat(b.free),
          locked: parseFloat(b.locked),
          total:  parseFloat(b.free) + parseFloat(b.locked),
        }))
        .sort((a: RealBalance, b: RealBalance) => b.total - a.total);

      this.balances.set(balances);
      this.lastFetch.set(Date.now());
    } catch (e: any) {
      this.error.set(e.message ?? 'Failed to fetch balance');
    } finally {
      this.loading.set(false);
    }
  }

  /** Get USDT balance as a number */
  usdtBalance(): number {
    const b = this.balances().find(b => b.asset === 'USDT' || b.asset === 'BUSD');
    return b?.total ?? 0;
  }

  /** Place a market order */
  async placeOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<any> {
    const url = this.creds.proxyUrl('/api/v3/order');
    if (!url) throw new Error('Worker URL not configured');

    const body = new URLSearchParams({
      symbol, side, type: 'MARKET',
      quantity: quantity.toFixed(5),
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok || data.code) throw new Error(data.msg ?? `Order failed ${res.status}`);
    return data;
  }

  /** Get open orders for a symbol */
  async getOpenOrders(symbol: string): Promise<any[]> {
    const url = this.creds.proxyUrl(`/api/v3/openOrders?symbol=${symbol}`);
    if (!url) return [];
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /** Poll balance every 30s while worker is configured */
  startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.fetchBalance(), 30_000);
  }

  stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}
