import { Component, OnInit, OnDestroy, computed, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BinanceWsService } from '../../core/services/binance-ws.service';
import { ConfigService } from '../../core/services/config.service';
import { ChartComponent } from './chart.component';
import { Candle } from '../../core/models/types';

@Component({
  selector: 'app-trading-view',
  standalone: true,
  imports: [ChartComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="pair-info">
          <h1>{{ config.pair() }}</h1>
          @if (ws.ticker(); as t) {
            <span class="price" [class.up]="t.priceChangePct >= 0" [class.down]="t.priceChangePct < 0">
              \${{ t.price.toLocaleString('en-US', {minimumFractionDigits: 2}) }}
            </span>
            <span class="change" [class.positive]="t.priceChangePct >= 0" [class.negative]="t.priceChangePct < 0">
              {{ t.priceChangePct >= 0 ? '+' : '' }}{{ t.priceChangePct.toFixed(2) }}%
            </span>
          }
        </div>
        <div class="timeframe-selector">
          @for (tf of timeframes; track tf) {
            <button class="tf-btn" [class.active]="config.timeframe() === tf" (click)="changeTimeframe(tf)">{{ tf }}</button>
          }
        </div>
      </div>

      <div class="chart-layout">
        <!-- Main chart -->
        <div class="main-chart">
          <app-chart
            [candles]="candles()"
            [latestCandle]="ws.latestCandle()"
          />
        </div>

        <!-- Order book sidebar -->
        <div class="orderbook">
          <div class="ob-header">Order Book</div>
          <div class="ob-asks">
            @for (ask of ws.orderBook().asks.slice(0, 10); track ask.price) {
              <div class="ob-row ask">
                <span class="ob-price">{{ ask.price.toLocaleString('en-US', {minimumFractionDigits: 2}) }}</span>
                <span class="ob-qty">{{ ask.qty.toFixed(4) }}</span>
              </div>
            }
          </div>
          <div class="ob-spread">
            @if (ws.ticker()) {
              <span class="spread-price">\${{ ws.ticker()!.price.toLocaleString('en-US', {minimumFractionDigits: 2}) }}</span>
            }
          </div>
          <div class="ob-bids">
            @for (bid of ws.orderBook().bids.slice(0, 10); track bid.price) {
              <div class="ob-row bid">
                <span class="ob-price">{{ bid.price.toLocaleString('en-US', {minimumFractionDigits: 2}) }}</span>
                <span class="ob-qty">{{ bid.qty.toFixed(4) }}</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Connection status -->
      <div class="status-bar">
        <span [class]="ws.connected() ? 'conn-ok' : 'conn-err'">
          {{ ws.connected() ? '● Live' : '○ Reconnecting...' }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; height: 100%; display: flex; flex-direction: column; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .pair-info { display: flex; align-items: baseline; gap: 12px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0; }
    .price { font-size: 22px; font-weight: 700; }
    .up { color: var(--green); }
    .down { color: var(--red); }
    .change { font-size: 14px; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .timeframe-selector { display: flex; gap: 4px; }
    .tf-btn {
      padding: 4px 10px; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 12px;
      transition: all 0.15s;
    }
    .tf-btn:hover, .tf-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .chart-layout { display: flex; gap: 12px; flex: 1; min-height: 0; }
    .main-chart { flex: 1; height: 500px; }
    .orderbook {
      width: 200px; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 8px; overflow: hidden; flex-shrink: 0; display: flex; flex-direction: column;
    }
    .ob-header { padding: 10px 12px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--border); }
    .ob-asks, .ob-bids { flex: 1; overflow: hidden; }
    .ob-row { display: flex; justify-content: space-between; padding: 3px 12px; font-size: 12px; }
    .ob-row.ask .ob-price { color: var(--red); }
    .ob-row.bid .ob-price { color: var(--green); }
    .ob-qty { color: var(--text-secondary); }
    .ob-spread {
      padding: 8px 12px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
      text-align: center;
    }
    .spread-price { font-weight: 700; font-size: 14px; }
    .status-bar { margin-top: 8px; font-size: 12px; }
    .conn-ok { color: var(--green); }
    .conn-err { color: var(--red); }
  `]
})
export class TradingViewComponent implements OnInit, OnDestroy {
  timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
  readonly candles = signal<Candle[]>([]);

  constructor(
    readonly ws: BinanceWsService,
    readonly config: ConfigService,
    private http: HttpClient,
  ) {}

  async ngOnInit(): Promise<void> {
    this.ws.connect(this.config.pair(), this.config.timeframe());
    await this.loadCandles();
  }

  async loadCandles(): Promise<void> {
    // Call Binance REST directly from browser — public endpoint, CORS allowed
    const hosts = ['https://api.binance.com', 'https://api1.binance.com', 'https://api2.binance.com'];
    for (const host of hosts) {
      try {
        const url = `${host}/api/v3/klines?symbol=${this.config.pair()}&interval=${this.config.timeframe()}&limit=200`;
        const raw = await firstValueFrom(this.http.get<any[][]>(url));
        const candles: Candle[] = raw.map(k => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]),  close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.candles.set(candles);
        return;
      } catch { continue; }
    }
    console.error('Failed to load candles from all Binance hosts');
  }

  async changeTimeframe(tf: string): Promise<void> {
    this.config.update({ timeframe: tf as any });
    this.ws.connect(this.config.pair(), this.config.timeframe());
    await this.loadCandles();
  }

  ngOnDestroy(): void {}
}
