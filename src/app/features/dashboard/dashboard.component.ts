import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BinanceWsService } from '../../core/services/binance-ws.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { TradeStoreService } from '../../core/services/trade-store.service';
import { ConfigService } from '../../core/services/config.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RouterLink } from '@angular/router';

interface WalletBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StatCardComponent, RouterLink, DatePipe],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Dashboard</h1>
        <div class="header-right">
          <span class="pair-badge">{{ config.pair() }}/USDT</span>
          <span class="timeframe-badge">{{ config.timeframe() }}</span>
        </div>
      </div>

      <!-- Ticker bar -->
      @if (ws.ticker(); as t) {
        <div class="ticker-bar">
          <span class="ticker-price" [class.price-up]="t.priceChangePct >= 0" [class.price-down]="t.priceChangePct < 0">
            \${{ t.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}
          </span>
          <span class="ticker-change" [class.positive]="t.priceChangePct >= 0" [class.negative]="t.priceChangePct < 0">
            {{ t.priceChangePct >= 0 ? '▲' : '▼' }} {{ t.priceChangePct.toFixed(2) }}%
          </span>
          <span class="ticker-info">H: \${{ t.high.toLocaleString() }}</span>
          <span class="ticker-info">L: \${{ t.low.toLocaleString() }}</span>
          <span class="ticker-info">Vol: {{ (t.volume / 1000).toFixed(1) }}K</span>
        </div>
      }

      <!-- Stat cards -->
      <div class="stats-grid">
        <app-stat-card
          icon="💰"
          label="Total P&L"
          [value]="'$' + tradeStore.stats().totalPnl.toFixed(2)"
          [isPositive]="tradeStore.stats().totalPnl > 0"
          [isNegative]="tradeStore.stats().totalPnl < 0"
          [sub]="tradeStore.stats().totalTrades + ' closed trades'"
        />
        <app-stat-card
          icon="📅"
          label="Daily P&L"
          [value]="'$' + tradeStore.dailyPnl().toFixed(2)"
          [isPositive]="tradeStore.dailyPnl() > 0"
          [isNegative]="tradeStore.dailyPnl() < 0"
          sub="Today"
        />
        <app-stat-card
          icon="🎯"
          label="Win Rate"
          [value]="tradeStore.stats().winRate.toFixed(1) + '%'"
          [isPositive]="tradeStore.stats().winRate > 50"
          [isNegative]="tradeStore.stats().winRate < 50 && tradeStore.stats().totalTrades > 0"
          [sub]="'Avg ' + tradeStore.stats().avgPnlPct.toFixed(2) + '% per trade'"
        />
        <app-stat-card
          icon="⚡"
          label="Open Trades"
          [value]="tradeStore.openTrades().length.toString()"
          [sub]="'Bot: ' + bot.status()"
        />
      </div>

      <!-- Wallet Balances -->
      <div class="section">
        <div class="section-header">
          <h2>Wallet Balances</h2>
          <div class="wallet-meta">
            @if (walletUpdatedAt() > 0) {
              <span class="wallet-updated">Updated {{ walletUpdatedAt() | date:'HH:mm' }}</span>
            }
            <button class="refresh-btn" (click)="loadWallet()" [disabled]="walletLoading()">
              {{ walletLoading() ? 'Loading...' : '↻ Refresh' }}
            </button>
          </div>
        </div>

        @if (walletError()) {
          <div class="wallet-error">
            ⚠ {{ walletError() }}
            @if (walletError()?.includes('not set')) {
              <span class="wallet-hint"> — Add BINANCE_API_KEY to Vercel environment variables.</span>
            }
          </div>
        }

        @if (walletBalances().length > 0) {
          <div class="wallet-grid">
            @for (b of walletBalances(); track b.asset) {
              <div class="wallet-card">
                <div class="wallet-asset">{{ b.asset }}</div>
                <div class="wallet-total">{{ b.total.toFixed(b.asset === 'USDT' || b.asset === 'BUSD' ? 2 : 6) }}</div>
                @if (b.locked > 0) {
                  <div class="wallet-locked">{{ b.locked.toFixed(6) }} locked</div>
                }
              </div>
            }
          </div>
        } @else if (!walletLoading() && !walletError()) {
          <div class="wallet-empty">No assets found in your Binance account.</div>
        }
      </div>

      <!-- Bot last signal -->
      @if (bot.lastResult(); as r) {
        <div class="signal-card">
          <div class="signal-header">
            <span class="signal-title">Last Signal</span>
            <span class="signal-time">{{ r.timestamp | date:'HH:mm:ss' }}</span>
          </div>
          <div class="signal-body">
            <span class="signal-action" [class]="'action-' + r.action.toLowerCase()">{{ r.action }}</span>
            <span class="signal-score">Score: {{ (r.score * 100).toFixed(0) }}</span>
            <span class="signal-price">&#64; \${{ r.price?.toLocaleString() }}</span>
          </div>
          @if (r.indicators) {
            <div class="indicators-row">
              @for (entry of getIndicatorEntries(r.indicators); track entry.key) {
                <div class="indicator-pill" [class.positive]="entry.value > 0" [class.negative]="entry.value < 0">
                  <span class="ind-name">{{ entry.key.toUpperCase() }}</span>
                  <span class="ind-value">{{ (entry.value * 100).toFixed(0) }}</span>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Quick actions -->
      <div class="quick-actions">
        <button class="btn btn-primary" (click)="toggleBot()">
          {{ bot.status() === 'running' ? '⏹ Stop Bot' : '▶ Start Bot' }}
        </button>
        <a routerLink="/chart" class="btn btn-secondary">📈 View Chart</a>
        <a routerLink="/bot" class="btn btn-secondary">⚙ Configure Bot</a>
      </div>

      <!-- Open trades -->
      @if (tradeStore.openTrades().length) {
        <div class="section">
          <h2>Open Positions</h2>
          <div class="trades-list">
            @for (trade of tradeStore.openTrades(); track trade.id) {
              <div class="trade-row">
                <span class="trade-side" [class]="'side-' + trade.side.toLowerCase()">{{ trade.side }}</span>
                <span class="trade-pair">{{ trade.pair }}</span>
                <span class="trade-entry">\${{ trade.entryPrice.toLocaleString() }}</span>
                @if (ws.ticker()) {
                  <span class="trade-live-pnl" [class.positive]="livePnl(trade) > 0" [class.negative]="livePnl(trade) < 0">
                    {{ livePnl(trade) >= 0 ? '+' : '' }}\${{ livePnl(trade).toFixed(2) }}
                  </span>
                }
                <span class="trade-paper" [class.paper]="trade.isPaper">{{ trade.isPaper ? 'PAPER' : 'LIVE' }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1200px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0; }
    .header-right { display: flex; gap: 8px; }
    .pair-badge, .timeframe-badge {
      background: var(--bg-card); border: 1px solid var(--border);
      padding: 4px 10px; border-radius: 20px; font-size: 12px; color: var(--text-secondary);
    }
    .ticker-bar {
      display: flex; align-items: center; gap: 20px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;
    }
    .ticker-price { font-size: 20px; font-weight: 700; }
    .price-up { color: var(--green); }
    .price-down { color: var(--red); }
    .ticker-change { font-weight: 600; }
    .ticker-info { color: var(--text-secondary); font-size: 13px; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
    .section { margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section h2, .section-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
    .wallet-meta { display: flex; align-items: center; gap: 10px; }
    .wallet-updated { font-size: 11px; color: var(--text-muted); }
    .refresh-btn {
      background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary);
      padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    }
    .refresh-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
    .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .wallet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .wallet-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 8px; padding: 14px 16px;
    }
    .wallet-asset { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; letter-spacing: 0.5px; }
    .wallet-total { font-size: 18px; font-weight: 700; color: var(--text-primary); }
    .wallet-locked { font-size: 11px; color: var(--yellow); margin-top: 4px; }
    .wallet-error { background: rgba(239,83,80,0.1); border: 1px solid rgba(239,83,80,0.3); color: var(--red); border-radius: 8px; padding: 12px 16px; font-size: 13px; }
    .wallet-hint { color: var(--text-secondary); }
    .wallet-empty { color: var(--text-muted); font-size: 13px; padding: 16px 0; }
    .signal-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px; margin-bottom: 20px;
    }
    .signal-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .signal-title { font-weight: 600; }
    .signal-time { color: var(--text-muted); font-size: 12px; }
    .signal-body { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
    .signal-action { font-size: 16px; font-weight: 700; padding: 4px 12px; border-radius: 4px; }
    .action-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .action-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .action-hold { background: rgba(148,163,184,0.1); color: var(--text-secondary); }
    .action-blocked { background: rgba(245,158,11,0.1); color: var(--yellow); }
    .signal-score, .signal-price { color: var(--text-secondary); font-size: 14px; }
    .indicators-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .indicator-pill {
      display: flex; gap: 6px; align-items: center;
      background: var(--bg-hover); border-radius: 4px; padding: 4px 8px; font-size: 12px;
    }
    .indicator-pill.positive { border-left: 2px solid var(--green); }
    .indicator-pill.negative { border-left: 2px solid var(--red); }
    .ind-name { color: var(--text-muted); }
    .ind-value { color: var(--text-primary); font-weight: 600; }
    .quick-actions { display: flex; gap: 12px; margin-bottom: 24px; }
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
    .btn-primary { background: var(--blue); color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--bg-hover); }
    .trades-list { display: flex; flex-direction: column; gap: 8px; }
    .trade-row {
      display: flex; align-items: center; gap: 16px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 16px;
    }
    .trade-side { font-weight: 700; padding: 2px 8px; border-radius: 3px; font-size: 12px; }
    .side-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .side-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .trade-pair { font-weight: 600; }
    .trade-entry, .trade-live-pnl { font-size: 13px; }
    .trade-paper { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: rgba(245,158,11,0.1); color: var(--yellow); }
    @media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class DashboardComponent implements OnInit {
  walletBalances = signal<WalletBalance[]>([]);
  walletLoading = signal(false);
  walletError = signal<string | null>(null);
  walletUpdatedAt = signal<number>(0);

  constructor(
    readonly ws: BinanceWsService,
    readonly bot: BotSchedulerService,
    readonly tradeStore: TradeStoreService,
    readonly config: ConfigService,
    private http: HttpClient,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.tradeStore.init();
    this.ws.connect(this.config.pair(), this.config.timeframe());
    await this.loadWallet();
  }

  async loadWallet(): Promise<void> {
    this.walletLoading.set(true);
    this.walletError.set(null);
    try {
      // wallet.json is committed by GitHub Actions every 5 min — no Vercel/Binance CORS issue
      const url = 'https://raw.githubusercontent.com/ishivamsoni150299/binance-trade/main/wallet.json';
      const data = await firstValueFrom(
        this.http.get<{ balances: WalletBalance[]; updatedAt: number }>(url)
      );
      if (!data.balances?.length) {
        this.walletError.set('No assets yet — GitHub Actions will populate this within 5 minutes after the bot runs.');
      } else {
        this.walletBalances.set(data.balances);
        this.walletUpdatedAt.set(data.updatedAt);
      }
    } catch (e: any) {
      this.walletError.set('Could not load wallet snapshot. The bot will update it on next run.');
    } finally {
      this.walletLoading.set(false);
    }
  }

  toggleBot(): void {
    if (this.bot.status() === 'running') this.bot.stop();
    else this.bot.start();
  }

  livePnl(trade: any): number {
    const price = this.ws.ticker()?.price ?? trade.entryPrice;
    return (price - trade.entryPrice) * trade.quantity * (trade.side === 'BUY' ? 1 : -1);
  }

  getIndicatorEntries(obj: Record<string, number>) {
    return Object.entries(obj).map(([key, value]) => ({ key, value }));
  }
}
