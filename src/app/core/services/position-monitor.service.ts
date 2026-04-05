import { Injectable, effect } from '@angular/core';
import { BinanceWsService } from './binance-ws.service';
import { TradeStoreService } from './trade-store.service';
import { NotificationService } from './notification.service';
import { Trade } from '../models/types';

@Injectable({ providedIn: 'root' })
export class PositionMonitorService {
  constructor(
    private ws: BinanceWsService,
    private tradeStore: TradeStoreService,
    private notif: NotificationService,
  ) {
    effect(() => {
      const ticker = this.ws.ticker();
      if (!ticker) return;
      const openTrades = this.tradeStore.openTrades();
      if (!openTrades.length) return;

      for (const trade of openTrades) {
        if (trade.pair !== ticker.symbol) continue;
        const result = this.checkExit(trade, ticker.price);
        if (result) {
          void this.tradeStore.closeTrade(trade.id, result.exitPrice).then(() => {
            const pnl = (result.exitPrice - trade.entryPrice) * trade.quantity * (trade.side === 'BUY' ? 1 : -1) - trade.fee;
            if (result.type === 'tp') {
              this.notif.takeProfitHit(trade.pair, pnl, trade.isPaper);
            } else {
              this.notif.stopLossHit(trade.pair, pnl, trade.isPaper);
            }
          });
        }
      }
    });
  }

  private checkExit(trade: Trade, price: number): { exitPrice: number; type: 'tp' | 'sl' } | null {
    const stop = trade.stopLossPrice;
    const take = trade.takeProfitPrice;
    if (!stop || !take) return null;

    if (trade.side === 'BUY') {
      if (price <= stop) return { exitPrice: stop, type: 'sl' };
      if (price >= take) return { exitPrice: take, type: 'tp' };
    } else {
      if (price >= stop) return { exitPrice: stop, type: 'sl' };
      if (price <= take) return { exitPrice: take, type: 'tp' };
    }
    return null;
  }
}
