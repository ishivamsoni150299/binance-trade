import { Injectable, effect } from '@angular/core';
import { BinanceWsService } from './binance-ws.service';
import { TradeStoreService } from './trade-store.service';
import { Trade } from '../models/types';

@Injectable({ providedIn: 'root' })
export class PositionMonitorService {
  constructor(
    private ws: BinanceWsService,
    private tradeStore: TradeStoreService,
  ) {
    effect(() => {
      const ticker = this.ws.ticker();
      if (!ticker) return;
      const openTrades = this.tradeStore.openTrades();
      if (!openTrades.length) return;

      for (const trade of openTrades) {
        if (trade.pair !== ticker.symbol) continue;
        const exit = this.checkExit(trade, ticker.price);
        if (exit) {
          void this.tradeStore.closeTrade(trade.id, exit);
        }
      }
    });
  }

  private checkExit(trade: Trade, price: number): number | null {
    const stop = trade.stopLossPrice;
    const take = trade.takeProfitPrice;
    if (!stop || !take) return null;

    if (trade.side === 'BUY') {
      if (price <= stop) return stop;
      if (price >= take) return take;
    } else {
      if (price >= stop) return stop;
      if (price <= take) return take;
    }
    return null;
  }
}
