import { Injectable, signal, effect } from '@angular/core';
import { BinanceWsService } from './binance-ws.service';
import { NotificationService } from './notification.service';

export interface PriceAlert {
  id: string;
  pair: string;
  targetPrice: number;
  direction: 'above' | 'below';
  triggered: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'btrade_alerts';

@Injectable({ providedIn: 'root' })
export class PriceAlertService {
  readonly alerts = signal<PriceAlert[]>(this.load());

  constructor(
    private ws: BinanceWsService,
    private notif: NotificationService,
  ) {
    effect(() => {
      const ticker = this.ws.ticker();
      if (!ticker) return;
      const price = ticker.price;
      const pair = ticker.symbol;

      let changed = false;
      const updated = this.alerts().map(a => {
        if (a.triggered || a.pair !== pair) return a;
        const hit = (a.direction === 'above' && price >= a.targetPrice) ||
                    (a.direction === 'below' && price <= a.targetPrice);
        if (hit) {
          this.notif.priceAlert(pair, price, a.direction, a.targetPrice);
          changed = true;
          return { ...a, triggered: true };
        }
        return a;
      });

      if (changed) {
        this.alerts.set(updated);
        this.save(updated);
      }
    });
  }

  add(pair: string, targetPrice: number, direction: 'above' | 'below'): void {
    const alert: PriceAlert = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pair, targetPrice, direction,
      triggered: false,
      createdAt: Date.now(),
    };
    const updated = [alert, ...this.alerts()];
    this.alerts.set(updated);
    this.save(updated);
  }

  remove(id: string): void {
    const updated = this.alerts().filter(a => a.id !== id);
    this.alerts.set(updated);
    this.save(updated);
  }

  clearTriggered(): void {
    const updated = this.alerts().filter(a => !a.triggered);
    this.alerts.set(updated);
    this.save(updated);
  }

  private load(): PriceAlert[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch { return []; }
  }

  private save(alerts: PriceAlert[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  }
}
