import { Injectable, signal, OnDestroy } from '@angular/core';
import { Candle, Timeframe } from '../models/types';

export interface Ticker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  high: number;
  low: number;
  volume: number;
}

export interface OrderBookEntry { price: number; qty: number; }
export interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[]; }

const WS_BASE = 'wss://stream.binance.com:9443/stream';

@Injectable({ providedIn: 'root' })
export class BinanceWsService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private currentSymbol = '';
  private currentInterval = '';
  private lastTickerTs = 0;
  private lastDepthTs = 0;

  readonly ticker = signal<Ticker | null>(null);
  readonly orderBook = signal<OrderBook>({ bids: [], asks: [] });
  readonly latestCandle = signal<Candle | null>(null);
  readonly candles = signal<Candle[]>([]);
  readonly connected = signal<boolean>(false);

  connect(symbol: string, interval: Timeframe): void {
    this.currentSymbol = symbol.toLowerCase();
    this.currentInterval = interval;
    this.disconnect();
    this.openWs();
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected.set(false);
  }

  private openWs(): void {
    const sym = this.currentSymbol;
    const iv = this.currentInterval;
    const streams = [
      `${sym}@ticker`,
      `${sym}@depth10@1000ms`,
      `${sym}@kline_${iv}`
    ].join('/');

    this.ws = new WebSocket(`${WS_BASE}?streams=${streams}`);

    this.ws.onopen = () => {
      this.connected.set(true);
      this.reconnectDelay = 2000;
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleMessage(msg.stream, msg.data);
      } catch {}
    };

    this.ws.onerror = () => this.ws?.close();

    this.ws.onclose = () => {
      this.connected.set(false);
      this.reconnectTimer = setTimeout(() => this.openWs(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    };
  }

  private handleMessage(stream: string, data: any): void {
    if (!stream) return;

    if (stream.endsWith('@ticker')) {
      const now = Date.now();
      if (now - this.lastTickerTs < 1000) return;
      this.lastTickerTs = now;
      this.ticker.set({
        symbol: data.s,
        price: parseFloat(data.c),
        priceChange: parseFloat(data.p),
        priceChangePct: parseFloat(data.P),
        high: parseFloat(data.h),
        low: parseFloat(data.l),
        volume: parseFloat(data.v),
      });
    } else if (stream.includes('@depth')) {
      const now = Date.now();
      if (now - this.lastDepthTs < 1000) return;
      this.lastDepthTs = now;
      this.orderBook.set({
        bids: (data.bids || []).map((b: string[]) => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
        asks: (data.asks || []).map((a: string[]) => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
      });
    } else if (stream.includes('@kline_')) {
      const k = data.k;
      const candle: Candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
      };
      this.latestCandle.set(candle);
      if (k.x) {
        // Candle closed - add to history
        this.candles.update(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.time === candle.time) {
            updated[updated.length - 1] = candle;
          } else {
            updated.push(candle);
            if (updated.length > 500) updated.shift();
          }
          return updated;
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
