import { Injectable, signal, OnDestroy, effect } from '@angular/core';
import { ConfigService } from './config.service';
import { TradeStoreService } from './trade-store.service';
import { NotificationService } from './notification.service';
import { Trade } from '../models/types';

export interface CycleResult {
  action: string;
  score: number;
  price: number;
  indicators: Record<string, number>;
  pair?: string;
  trade?: Trade;
  reason?: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class BotSchedulerService implements OnDestroy {
  private worker: Worker | null = null;

  readonly status = signal<'stopped' | 'running' | 'error'>('stopped');
  readonly lastResult = signal<CycleResult | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly cycleCount = signal<number>(0);

  constructor(
    private config: ConfigService,
    private tradeStore: TradeStoreService,
    private notif: NotificationService,
  ) {
    effect(() => {
      const cfg = this.config.config();
      const intervalMs = Math.max(5, cfg.botIntervalSec || 30) * 1000;
      if (this.status() !== 'running' || !this.worker) return;
      this.worker.postMessage({
        type: 'UPDATE_CONFIG',
        payload: {
          config: this.buildConfigPayload(),
          intervalMs,
        },
      });
    });
  }

  start(): void {
    if (this.status() === 'running') return;
    if (typeof Worker === 'undefined') {
      this.status.set('error');
      this.lastError.set('Web Workers not supported in this browser');
      return;
    }

    this.worker = new Worker(new URL('../workers/bot.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (evt) => this.handleWorkerMessage(evt.data);
    this.worker.onerror = (err) => {
      this.lastError.set(err.message);
      this.status.set('error');
    };

    const cfg = this.config.config();
    const intervalMs = Math.max(5, cfg.botIntervalSec || 30) * 1000;
    this.worker.postMessage({
      type: 'START',
      payload: {
        config: this.buildConfigPayload(),
        intervalMs,
      },
    });

    this.status.set('running');
    this.lastError.set(null);
  }

  stop(): void {
    this.worker?.postMessage({ type: 'STOP' });
    this.worker?.terminate();
    this.worker = null;
    this.status.set('stopped');
  }

  private async handleWorkerMessage(msg: { type: string; result?: CycleResult; error?: string }): Promise<void> {
    if (msg.type === 'CYCLE_RESULT' && msg.result) {
      this.lastResult.set(msg.result);
      this.cycleCount.update(n => n + 1);

      if (msg.result.trade) {
        const trade = msg.result.trade as Trade;
        await this.tradeStore.addTrade(trade);
        this.notif.tradePlaced(trade.side, trade.pair, trade.entryPrice, trade.isPaper);
      }
      if (msg.result.action === 'BLOCKED' && msg.result.reason?.includes('Daily loss')) {
        this.notif.dailyLimitReached(this.tradeStore.dailyPnl());
      }
    } else if (msg.type === 'CYCLE_ERROR') {
      this.lastError.set(msg.error ?? 'Unknown error');
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private buildConfigPayload() {
    const cfg = this.config.config();
    return {
      ...cfg,
      trustedOnly: cfg.trustedOnly,
      trustedPairs: cfg.trustedPairs,
      scanEnabled: cfg.scanEnabled,
      openPositions: this.tradeStore.openTrades().length,
      dailyPnlPct: this.tradeStore.dailyPnlPct(),
      maxDrawdownPct: this.tradeStore.maxDrawdownPct(),
      lastClosedAt: this.tradeStore.lastClosedAt(),
    };
  }
}
