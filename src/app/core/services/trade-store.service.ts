import { Injectable, signal, computed } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { Trade, PortfolioSnapshot } from '../models/types';

const DB_NAME = 'btrade_db';
const STORE_TRADES = 'trades';

@Injectable({ providedIn: 'root' })
export class TradeStoreService {
  private db: IDBPDatabase | null = null;
  private readonly _trades = signal<Trade[]>([]);
  private readonly _loading = signal<boolean>(true);

  readonly trades = this._trades.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly openTrades = computed(() => this._trades().filter(t => t.status === 'open'));
  readonly closedTrades = computed(() => this._trades().filter(t => t.status === 'closed'));

  readonly stats = computed(() => {
    const closed = this.closedTrades();
    if (!closed.length) return { winRate: 0, totalPnl: 0, totalTrades: 0, avgPnlPct: 0 };
    const wins = closed.filter(t => (t.pnl ?? 0) > 0);
    const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const avgPnlPct = closed.reduce((s, t) => s + (t.pnlPct ?? 0), 0) / closed.length;
    return {
      winRate: (wins.length / closed.length) * 100,
      totalPnl,
      totalTrades: closed.length,
      avgPnlPct,
    };
  });

  readonly totalPnl = computed(() => {
    const closed = this.closedTrades();
    return closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  });

  readonly equity = computed(() => {
    const base = 10000;
    return base + this.totalPnl();
  });

  readonly dailyPnl = computed(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayMs = startOfDay.getTime();
    return this._trades()
      .filter(t => t.status === 'closed' && (t.closedAt ?? 0) >= dayMs)
      .reduce((s, t) => s + (t.pnl ?? 0), 0);
  });

  readonly dailyPnlPct = computed(() => {
    const base = 10000; // Paper baseline
    const pnl = this.dailyPnl();
    return base > 0 ? (pnl / base) * 100 : 0;
  });

  readonly maxDrawdownPct = computed(() => {
    const base = 10000;
    const closed = this.closedTrades()
      .filter(t => typeof t.closedAt === 'number')
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
    let equity = base;
    let peak = base;
    let maxDd = 0;
    for (const t of closed) {
      equity += (t.pnl ?? 0);
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  });

  readonly lastClosedAt = computed(() => {
    const closed = this.closedTrades();
    if (!closed.length) return 0;
    return closed.reduce((m, t) => Math.max(m, t.closedAt ?? 0), 0);
  });

  async init(): Promise<void> {
    this.db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_TRADES)) {
          const store = db.createObjectStore(STORE_TRADES, { keyPath: 'id' });
          store.createIndex('status', 'status');
          store.createIndex('openedAt', 'openedAt');
        }
      },
    });
    await this.refresh();
    this._loading.set(false);
  }

  async addTrade(trade: Trade): Promise<void> {
    await this.db?.put(STORE_TRADES, trade);
    this._trades.update(prev => [trade, ...prev]);
  }

  async updateTrade(id: string, patch: Partial<Trade>): Promise<void> {
    const existing = await this.db?.get(STORE_TRADES, id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    await this.db?.put(STORE_TRADES, updated);
    this._trades.update(prev => prev.map(t => t.id === id ? updated : t));
  }

  async closeTrade(id: string, exitPrice: number): Promise<void> {
    const trade = this._trades().find(t => t.id === id);
    if (!trade) return;
    const pnl = (exitPrice - trade.entryPrice) * trade.quantity * (trade.side === 'BUY' ? 1 : -1) - trade.fee;
    const pnlPct = (pnl / (trade.entryPrice * trade.quantity)) * 100;
    await this.updateTrade(id, {
      exitPrice,
      pnl,
      pnlPct,
      status: 'closed',
      closedAt: Date.now(),
    });
  }

  exportCsv(): void {
    const trades = this._trades();
    const headers = ['id', 'pair', 'side', 'strategy', 'entryPrice', 'exitPrice', 'quantity', 'pnl', 'pnlPct', 'status', 'openedAt', 'closedAt', 'isPaper'];
    const rows = trades.map(t => headers.map(h => (t as any)[h] ?? '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async refresh(): Promise<void> {
    const all = await this.db?.getAll(STORE_TRADES) ?? [];
    this._trades.set(all.sort((a, b) => b.openedAt - a.openedAt));
  }
}
