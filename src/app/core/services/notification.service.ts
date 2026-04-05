import { Injectable, signal } from '@angular/core';

export type NotifType = 'buy' | 'sell' | 'tp' | 'sl' | 'alert' | 'limit' | 'error';

export interface AppNotif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permission = signal<NotificationPermission>('default');
  readonly inbox = signal<AppNotif[]>([]);
  readonly unreadCount = signal<number>(0);

  constructor() {
    if ('Notification' in window) {
      this.permission.set(Notification.permission);
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    this.permission.set(result);
    return result === 'granted';
  }

  send(type: NotifType, title: string, body: string): void {
    const notif: AppNotif = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type, title, body,
      ts: Date.now(),
      read: false,
    };

    // Add to in-app inbox
    this.inbox.update(prev => [notif, ...prev].slice(0, 50));
    this.unreadCount.update(n => n + 1);

    // Browser push notification
    if (this.permission() === 'granted') {
      try {
        const icon = type === 'tp' ? '✅' : type === 'sl' ? '🛑' : type === 'buy' ? '📈' : type === 'sell' ? '📉' : '🔔';
        new Notification(`${icon} ${title}`, {
          body,
          icon: '/favicon.ico',
          tag: type,
          requireInteraction: type === 'sl' || type === 'limit',
        });
      } catch {}
    }
  }

  markAllRead(): void {
    this.inbox.update(prev => prev.map(n => ({ ...n, read: true })));
    this.unreadCount.set(0);
  }

  // Helpers
  tradePlaced(side: 'BUY' | 'SELL', pair: string, price: number, isPaper: boolean): void {
    const tag = isPaper ? '[PAPER] ' : '[LIVE] ';
    this.send(
      side === 'BUY' ? 'buy' : 'sell',
      `${tag}${side} ${pair}`,
      `Entry at $${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    );
  }

  takeProfitHit(pair: string, pnl: number, isPaper: boolean): void {
    const tag = isPaper ? '[PAPER] ' : '[LIVE] ';
    this.send('tp', `${tag}Take Profit Hit — ${pair}`,
      `Profit: +$${pnl.toFixed(2)}`);
  }

  stopLossHit(pair: string, pnl: number, isPaper: boolean): void {
    const tag = isPaper ? '[PAPER] ' : '[LIVE] ';
    this.send('sl', `${tag}Stop Loss Hit — ${pair}`,
      `Loss: $${pnl.toFixed(2)}`);
  }

  dailyLimitReached(lossUsd: number): void {
    this.send('limit', 'Daily Loss Limit Reached',
      `Bot paused. Loss today: $${Math.abs(lossUsd).toFixed(2)}`);
  }

  priceAlert(pair: string, price: number, direction: 'above' | 'below', target: number): void {
    this.send('alert', `Price Alert — ${pair}`,
      `${pair} is ${direction} $${target.toLocaleString()} (current: $${price.toLocaleString()})`);
  }
}
