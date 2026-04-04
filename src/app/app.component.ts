import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar.component';
import { BinanceWsService } from './core/services/binance-ws.service';
import { ConfigService } from './core/services/config.service';

interface TickerItem { symbol: string; price: string; changePct: number; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <div class="app-shell">
      <app-sidebar />
      <div class="main-wrap">
        <!-- Top market ticker strip -->
        <div class="market-strip">
          <div class="strip-track">
            @for (item of marketTickers(); track item.symbol) {
              <div class="strip-item">
                <span class="strip-sym">{{ item.symbol }}</span>
                <span class="strip-price">{{ item.price }}</span>
                <span class="strip-chg" [class.up]="item.changePct >= 0" [class.dn]="item.changePct < 0">
                  {{ item.changePct >= 0 ? '+' : '' }}{{ item.changePct.toFixed(2) }}%
                </span>
              </div>
              <span class="strip-sep">·</span>
            }
          </div>
        </div>
        <main class="main-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-shell { display: flex; height: 100vh; overflow: hidden; background: var(--bg-primary); }
    .main-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* Market strip */
    .market-strip {
      height: 36px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .strip-track {
      display: flex;
      align-items: center;
      gap: 0;
      animation: marquee 40s linear infinite;
      white-space: nowrap;
    }
    .strip-track:hover { animation-play-state: paused; }
    @keyframes marquee {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .strip-item { display: inline-flex; align-items: center; gap: 6px; padding: 0 16px; }
    .strip-sym { font-size: 11px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; }
    .strip-price { font-size: 12px; font-weight: 700; color: var(--text-primary); }
    .strip-chg { font-size: 11px; font-weight: 600; }
    .strip-chg.up { color: var(--green); }
    .strip-chg.dn { color: var(--red); }
    .strip-sep { color: var(--border); font-size: 14px; }

    .main-content { flex: 1; overflow-y: auto; overflow-x: hidden; }
  `]
})
export class AppComponent implements OnInit {
  marketTickers = signal<TickerItem[]>([
    { symbol: 'BTC/USDT', price: '...', changePct: 0 },
    { symbol: 'ETH/USDT', price: '...', changePct: 0 },
    { symbol: 'BNB/USDT', price: '...', changePct: 0 },
    { symbol: 'SOL/USDT', price: '...', changePct: 0 },
    { symbol: 'XRP/USDT', price: '...', changePct: 0 },
    { symbol: 'ADA/USDT', price: '...', changePct: 0 },
  ]);

  constructor(private ws: BinanceWsService, private config: ConfigService) {}

  ngOnInit(): void {
    this.ws.connect(this.config.pair(), this.config.timeframe());
    // Fetch prices for market strip from Binance public API
    this.loadMarketTickers();
    setInterval(() => this.loadMarketTickers(), 30000);
  }

  private async loadMarketTickers(): Promise<void> {
    const symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','DOTUSDT'];
    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const tickers: TickerItem[] = data.map((t: any) => ({
        symbol: t.symbol.replace('USDT', '/USDT'),
        price: parseFloat(t.lastPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: t.symbol === 'BTCUSDT' ? 2 : 4 }),
        changePct: parseFloat(t.priceChangePercent),
      }));
      // Duplicate for seamless marquee loop
      this.marketTickers.set([...tickers, ...tickers]);
    } catch { /* keep previous values */ }
  }
}
