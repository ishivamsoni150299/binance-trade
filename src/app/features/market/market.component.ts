import { Component, OnInit, signal, computed } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

interface CoinTicker {
  symbol: string;
  name: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  changePct: number;
}

type Interval = '1h' | '4h' | '24h';

// Blocklist for leverage/fiat tokens
const BLOCK = ['UP','DOWN','BULL','BEAR','3L','3S','2L','2S'];
const TOP_COINS = [
  'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','DOT','MATIC','LINK',
  'AVAX','UNI','ATOM','LTC','ETC','BCH','TRX','XLM','ALGO','FIL',
  'VET','SAND','MANA','AXS','NEAR','FTM','ONE','EGLD','ICP','THETA',
  'APE','GMT','GALA','ENJ','CHZ','FLOW','ROSE','ZIL','SLP','PEOPLE',
  'OP','ARB','APT','INJ','SUI','SEI','TIA','PYTH','JUP','WIF',
];

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1>Market Overview</h1>
          <p class="subtitle">Top gainers & losers across all USDT pairs</p>
        </div>
        <div class="header-right">
          @if (lastUpdated()) { <span class="last-update">Updated {{ lastUpdated() }}</span> }
          <button class="refresh-btn" (click)="load()" [disabled]="loading()">
            <span [class.spin]="loading()">↻</span>
            {{ loading() ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Interval selector -->
      <div class="interval-bar">
        <div class="interval-label">Time Window:</div>
        @for (iv of intervals; track iv.value) {
          <button class="iv-btn" [class.active]="interval() === iv.value" (click)="setInterval(iv.value)">
            {{ iv.label }}
          </button>
        }
        <div class="iv-hint">Showing top {{ topN }} coins ranked by % change</div>
      </div>

      @if (loading() && tickers().length === 0) {
        <!-- Skeleton loading -->
        <div class="skeleton-grid">
          @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
            <div class="skeleton" style="height:62px;border-radius:10px"></div>
          }
        </div>
      } @else if (error()) {
        <div class="error-box">⚠ {{ error() }}</div>
      } @else {
        <div class="market-layout">

          <!-- Gainers -->
          <div class="market-col">
            <div class="col-header gainers-header">
              <span class="ch-icon">🚀</span>
              <span class="ch-title">Top Gainers</span>
              <span class="ch-count">{{ gainers().length }}</span>
            </div>
            <div class="coins-list">
              @for (coin of gainers(); track coin.symbol; let i = $index) {
                <div class="coin-row" (click)="selectPair(coin.symbol)">
                  <div class="cr-rank">{{ i + 1 }}</div>
                  <div class="cr-info">
                    <span class="cr-symbol">{{ coin.name }}</span>
                    <span class="cr-pair">{{ coin.symbol }}</span>
                  </div>
                  <div class="cr-price-col">
                    <span class="cr-price">\${{ formatPrice(coin.lastPrice) }}</span>
                    <span class="cr-vol">Vol \${{ formatVol(coin.quoteVolume) }}</span>
                  </div>
                  <div class="cr-change positive">
                    <span class="cr-pct">+{{ coin.changePct.toFixed(2) }}%</span>
                    <span class="cr-bar-wrap">
                      <span class="cr-bar green-bar" [style.width.%]="barWidth(coin.changePct)"></span>
                    </span>
                  </div>
                </div>
              }
              @if (gainers().length === 0 && !loading()) {
                <div class="empty-col">No gainers data</div>
              }
            </div>
          </div>

          <!-- Losers -->
          <div class="market-col">
            <div class="col-header losers-header">
              <span class="ch-icon">📉</span>
              <span class="ch-title">Top Losers</span>
              <span class="ch-count">{{ losers().length }}</span>
            </div>
            <div class="coins-list">
              @for (coin of losers(); track coin.symbol; let i = $index) {
                <div class="coin-row" (click)="selectPair(coin.symbol)">
                  <div class="cr-rank">{{ i + 1 }}</div>
                  <div class="cr-info">
                    <span class="cr-symbol">{{ coin.name }}</span>
                    <span class="cr-pair">{{ coin.symbol }}</span>
                  </div>
                  <div class="cr-price-col">
                    <span class="cr-price">\${{ formatPrice(coin.lastPrice) }}</span>
                    <span class="cr-vol">Vol \${{ formatVol(coin.quoteVolume) }}</span>
                  </div>
                  <div class="cr-change negative">
                    <span class="cr-pct">{{ coin.changePct.toFixed(2) }}%</span>
                    <span class="cr-bar-wrap">
                      <span class="cr-bar red-bar" [style.width.%]="barWidth(Math.abs(coin.changePct))"></span>
                    </span>
                  </div>
                </div>
              }
              @if (losers().length === 0 && !loading()) {
                <div class="empty-col">No losers data</div>
              }
            </div>
          </div>

        </div>

        <!-- Market stats summary -->
        @if (tickers().length > 0) {
          <div class="market-summary">
            <div class="ms-item">
              <span class="ms-label">Total Pairs Tracked</span>
              <span class="ms-val">{{ tickers().length }}</span>
            </div>
            <div class="ms-divider"></div>
            <div class="ms-item">
              <span class="ms-label">Gainers</span>
              <span class="ms-val positive">{{ gainerCount() }}</span>
            </div>
            <div class="ms-divider"></div>
            <div class="ms-item">
              <span class="ms-label">Losers</span>
              <span class="ms-val negative">{{ loserCount() }}</span>
            </div>
            <div class="ms-divider"></div>
            <div class="ms-item">
              <span class="ms-label">Market Mood</span>
              <span class="ms-val" [class.positive]="gainerCount() > loserCount()" [class.negative]="gainerCount() < loserCount()">
                {{ gainerCount() > loserCount() ? '🟢 Bullish' : gainerCount() < loserCount() ? '🔴 Bearish' : '⚪ Neutral' }}
              </span>
            </div>
            <div class="ms-divider"></div>
            <div class="ms-item">
              <span class="ms-label">Best Performer</span>
              <span class="ms-val positive">{{ gainers()[0]?.name ?? '—' }} {{ gainers()[0] ? '+' + gainers()[0].changePct.toFixed(2) + '%' : '' }}</span>
            </div>
            <div class="ms-divider"></div>
            <div class="ms-item">
              <span class="ms-label">Worst Performer</span>
              <span class="ms-val negative">{{ losers()[0]?.name ?? '—' }} {{ losers()[0] ? losers()[0].changePct.toFixed(2) + '%' : '' }}</span>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1200px; animation: fadeIn 0.2s ease-out; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
    h1 { font-size:22px; font-weight:800; margin:0 0 2px; }
    .subtitle { font-size:12px; color:var(--text-muted); margin:0; }
    .header-right { display:flex; align-items:center; gap:10px; }
    .last-update { font-size:11px; color:var(--text-muted); }
    .refresh-btn {
      display:flex; align-items:center; gap:6px; padding:7px 14px;
      border-radius:7px; border:1px solid var(--border); background:var(--bg-card);
      color:var(--text-secondary); cursor:pointer; font-size:12px; font-weight:600;
    }
    .refresh-btn:hover { color:var(--text-primary); background:var(--bg-hover); }
    .refresh-btn:disabled { opacity:0.5; cursor:not-allowed; }
    .spin { display:inline-block; animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* Interval bar */
    .interval-bar {
      display:flex; align-items:center; gap:6px; margin-bottom:18px;
      background:var(--bg-card); border:1px solid var(--border);
      border-radius:10px; padding:10px 14px;
    }
    .interval-label { font-size:11px; color:var(--text-muted); font-weight:600; margin-right:4px; text-transform:uppercase; letter-spacing:0.06em; }
    .iv-btn {
      padding:5px 14px; border-radius:6px; border:1px solid var(--border);
      background:var(--bg-hover); color:var(--text-secondary); cursor:pointer;
      font-size:12px; font-weight:700; transition:all 0.15s;
    }
    .iv-btn.active { background:var(--blue); color:white; border-color:var(--blue); }
    .iv-btn:hover:not(.active) { color:var(--text-primary); }
    .iv-hint { margin-left:auto; font-size:11px; color:var(--text-muted); }

    /* Layout */
    .market-layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
    .market-col { }
    .col-header {
      display:flex; align-items:center; gap:8px;
      padding:12px 16px; border-radius:10px 10px 0 0; border:1px solid var(--border); border-bottom:none;
    }
    .gainers-header { background:rgba(38,166,154,0.06); }
    .losers-header { background:rgba(239,83,80,0.06); }
    .ch-icon { font-size:16px; }
    .ch-title { font-size:13px; font-weight:700; flex:1; }
    .ch-count {
      font-size:11px; font-weight:700; padding:2px 7px; border-radius:10px;
      background:var(--bg-hover); color:var(--text-muted);
    }

    /* Coin list */
    .coins-list {
      border:1px solid var(--border); border-radius:0 0 10px 10px; overflow:hidden;
    }
    .coin-row {
      display:flex; align-items:center; gap:10px;
      padding:10px 14px; border-bottom:1px solid var(--border);
      cursor:pointer; transition:background 0.12s;
    }
    .coin-row:last-child { border-bottom:none; }
    .coin-row:hover { background:var(--bg-hover); }
    .cr-rank { font-size:11px; color:var(--text-muted); font-weight:700; width:18px; text-align:center; flex-shrink:0; }
    .cr-info { flex:1; min-width:0; }
    .cr-symbol { display:block; font-size:13px; font-weight:700; }
    .cr-pair { display:block; font-size:10px; color:var(--text-muted); }
    .cr-price-col { text-align:right; flex-shrink:0; }
    .cr-price { display:block; font-size:13px; font-weight:600; }
    .cr-vol { display:block; font-size:10px; color:var(--text-muted); }
    .cr-change { display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:80px; flex-shrink:0; }
    .cr-pct { font-size:13px; font-weight:800; }
    .cr-bar-wrap { width:60px; height:3px; background:var(--bg-hover); border-radius:2px; overflow:hidden; }
    .cr-bar { display:block; height:100%; border-radius:2px; }
    .green-bar { background:var(--green); }
    .red-bar { background:var(--red); }
    .positive { color:var(--green); }
    .negative { color:var(--red); }

    /* Skeleton */
    .skeleton-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:16px; }

    /* Error */
    .error-box {
      background:rgba(239,83,80,0.08); border:1px solid rgba(239,83,80,0.3);
      border-radius:10px; padding:16px; color:var(--red); font-size:13px;
    }

    /* Empty */
    .empty-col { padding:24px; text-align:center; color:var(--text-muted); font-size:13px; }

    /* Summary bar */
    .market-summary {
      display:flex; align-items:center;
      background:var(--bg-card); border:1px solid var(--border);
      border-radius:10px; overflow:hidden;
    }
    .ms-item { flex:1; padding:14px 12px; text-align:center; }
    .ms-divider { width:1px; height:40px; background:var(--border); flex-shrink:0; }
    .ms-label { display:block; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; font-weight:600; }
    .ms-val { font-size:14px; font-weight:700; }

    @media (max-width:768px) {
      .market-layout { grid-template-columns:1fr; }
      .market-summary { flex-wrap:wrap; }
      .iv-hint { display:none; }
    }
  `]
})
export class MarketComponent implements OnInit {
  tickers     = signal<CoinTicker[]>([]);
  loading     = signal(false);
  error       = signal<string | null>(null);
  interval    = signal<Interval>('24h');
  lastUpdated = signal<string>('');
  topN        = 15;
  readonly Math = Math;

  intervals = [
    { value: '1h'  as Interval, label: '1 Hour'  },
    { value: '4h'  as Interval, label: '4 Hours' },
    { value: '24h' as Interval, label: '24 Hours'},
  ];

  readonly gainers = computed(() =>
    [...this.tickers()].filter(t => t.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, this.topN)
  );

  readonly losers = computed(() =>
    [...this.tickers()].filter(t => t.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, this.topN)
  );

  readonly gainerCount = computed(() => this.tickers().filter(t => t.changePct > 0).length);
  readonly loserCount  = computed(() => this.tickers().filter(t => t.changePct < 0).length);

  constructor(private config: ConfigService) {}

  ngOnInit(): void { this.load(); }

  setInterval(iv: Interval): void {
    this.interval.set(iv);
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const iv = this.interval();
      let url: string;
      if (iv === '24h') {
        url = 'https://api.binance.com/api/v3/ticker/24hr?type=MINI';
      } else {
        url = `https://api.binance.com/api/v3/ticker?windowSize=${iv}&type=MINI`;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const raw = await res.json();

      if (!Array.isArray(raw)) throw new Error('Bad response from Binance');

      const coins: CoinTicker[] = (raw as any[])
        .filter(t =>
          t.symbol.endsWith('USDT') &&
          !BLOCK.some(b => t.symbol.includes(b))
        )
        .map(t => {
          const lastPrice  = parseFloat(t.lastPrice);
          const openPrice  = parseFloat(t.openPrice);
          const changePct  = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : parseFloat(t.priceChangePercent ?? '0');
          return {
            symbol:      t.symbol,
            name:        t.symbol.replace('USDT', ''),
            lastPrice,
            openPrice,
            highPrice:   parseFloat(t.highPrice),
            lowPrice:    parseFloat(t.lowPrice),
            volume:      parseFloat(t.volume),
            quoteVolume: parseFloat(t.quoteVolume),
            changePct,
          };
        })
        .filter(t => t.quoteVolume > 100000); // filter out tiny coins

      this.tickers.set(coins);
      const now = new Date();
      this.lastUpdated.set(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to fetch market data');
    } finally {
      this.loading.set(false);
    }
  }

  selectPair(symbol: string): void {
    this.config.update({ pair: symbol });
    window.location.href = '/chart';
  }

  formatPrice(p: number): string {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  }

  formatVol(v: number): string {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  }

  barWidth(pct: number): number {
    const maxPct = this.gainers()[0]?.changePct ?? 1;
    return Math.min((pct / Math.max(maxPct, 1)) * 100, 100);
  }
}
