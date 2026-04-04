import { Component, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BinanceWsService } from '../../core/services/binance-ws.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { TradeStoreService } from '../../core/services/trade-store.service';
import { ConfigService } from '../../core/services/config.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { RouterLink } from '@angular/router';

interface WalletBalance { asset: string; free: number; locked: number; total: number; }
interface WalletData { balances: WalletBalance[]; isPaper: boolean; updatedAt: number; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StatCardComponent, RouterLink, DatePipe],
  template: `
    <div class="page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <div class="subtitle">{{ today | date:'EEEE, MMMM d' }}</div>
        </div>
        <div class="header-right">
          <span class="pair-badge">{{ config.pair() }}</span>
          <span class="tf-badge">{{ config.timeframe() }}</span>
          @if (ws.connected()) {
            <span class="live-badge">● LIVE</span>
          } @else {
            <span class="offline-badge">○ Reconnecting</span>
          }
        </div>
      </div>

      <!-- Ticker bar -->
      @if (ws.ticker(); as t) {
        <div class="ticker-bar">
          <div class="ticker-left">
            <span class="ticker-price" [class.price-up]="t.priceChangePct >= 0" [class.price-down]="t.priceChangePct < 0">
              \${{ t.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}
            </span>
            <span class="ticker-change" [class.positive]="t.priceChangePct >= 0" [class.negative]="t.priceChangePct < 0">
              {{ t.priceChangePct >= 0 ? '▲' : '▼' }} {{ t.priceChangePct.toFixed(2) }}%
            </span>
          </div>
          <div class="ticker-stats">
            <div class="ts-item"><span class="ts-label">24H High</span><span class="ts-val positive">\${{ t.high.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span></div>
            <div class="ts-item"><span class="ts-label">24H Low</span><span class="ts-val negative">\${{ t.low.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span></div>
            <div class="ts-item"><span class="ts-label">Volume</span><span class="ts-val">{{ (t.volume/1000).toFixed(1) }}K</span></div>
          </div>
        </div>
      }

      <!-- KPI cards -->
      <div class="stats-grid">
        <app-stat-card
          label="Total P&L"
          [value]="'$' + tradeStore.stats().totalPnl.toFixed(2)"
          [isPositive]="tradeStore.stats().totalPnl > 0"
          [isNegative]="tradeStore.stats().totalPnl < 0"
          [trend]="tradeStore.stats().totalPnl"
          [sub]="tradeStore.stats().totalTrades + ' closed trades'"
        />
        <app-stat-card
          label="Today's P&L"
          [value]="'$' + tradeStore.dailyPnl().toFixed(2)"
          [isPositive]="tradeStore.dailyPnl() > 0"
          [isNegative]="tradeStore.dailyPnl() < 0"
          [trend]="tradeStore.dailyPnl()"
          sub="Since midnight"
        />
        <app-stat-card
          label="Win Rate"
          [value]="tradeStore.stats().winRate.toFixed(1) + '%'"
          [isPositive]="tradeStore.stats().winRate >= 55"
          [isNegative]="tradeStore.stats().winRate < 45 && tradeStore.stats().totalTrades > 0"
          [sub]="'Avg ' + tradeStore.stats().avgPnlPct.toFixed(2) + '% / trade'"
        />
        <app-stat-card
          label="Open Positions"
          [value]="tradeStore.openTrades().length.toString()"
          [sub]="'Bot: ' + bot.status() + (bot.cycleCount() > 0 ? ' · ' + bot.cycleCount() + ' cycles' : '')"
        />
      </div>

      <!-- Wallet + Signal row -->
      <div class="mid-row">

        <!-- Wallet -->
        <div class="wallet-section card">
          <div class="card-header">
            <div class="card-title">
              Wallet
              @if (walletIsPaper()) { <span class="mode-pill paper">PAPER</span> }
              @else { <span class="mode-pill live">LIVE</span> }
            </div>
            <div class="card-actions">
              @if (walletUpdatedAt() > 0) {
                <span class="updated-at">Updated {{ walletUpdatedAt() | date:'HH:mm' }}</span>
              }
              <button class="icon-btn" (click)="loadWallet()" [disabled]="walletLoading()" title="Refresh">↻</button>
            </div>
          </div>

          @if (walletLoading()) {
            <div class="wallet-loading">
              <div class="skeleton" style="height:20px;margin-bottom:8px"></div>
              <div class="skeleton" style="height:20px;width:60%"></div>
            </div>
          } @else if (walletError()) {
            <div class="inline-error">⚠ {{ walletError() }}</div>
          } @else if (walletBalances().length > 0) {
            <div class="wallet-balances">
              @for (b of walletBalances(); track b.asset) {
                <div class="balance-row">
                  <div class="asset-info">
                    <span class="asset-icon">{{ assetIcon(b.asset) }}</span>
                    <span class="asset-name">{{ b.asset }}</span>
                  </div>
                  <div class="asset-amounts">
                    <span class="asset-total">{{ b.total % 1 === 0 ? b.total.toLocaleString() : b.total.toFixed(b.asset === 'USDT' || b.asset === 'BUSD' ? 2 : 6) }}</span>
                    @if (b.locked > 0) {
                      <span class="asset-locked">{{ b.locked.toFixed(4) }} locked</span>
                    }
                  </div>
                </div>
              }
            </div>
            @if (totalUsdValue() > 0) {
              <div class="total-value">
                Total ≈ <strong>\${{ totalUsdValue().toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}</strong>
              </div>
            }
          } @else {
            <div class="wallet-empty">No assets found. Bot will update on next run.</div>
          }
        </div>

        <!-- Last Signal -->
        <div class="signal-section card">
          <div class="card-header">
            <div class="card-title">Last Signal</div>
            @if (bot.lastResult()) {
              <span class="signal-time">{{ bot.lastResult()!.timestamp | date:'HH:mm:ss' }}</span>
            }
          </div>

          @if (bot.lastResult(); as r) {
            <div class="signal-main">
              <div class="signal-action-wrap">
                <span class="signal-action" [class]="'action-' + r.action.toLowerCase()">{{ r.action }}</span>
                <span class="signal-score-label">Score</span>
                <div class="score-bar-wrap">
                  <div class="score-bar" [style.width.%]="Math.abs(r.score) * 100"
                    [class.bar-buy]="r.score > 0" [class.bar-sell]="r.score < 0"></div>
                </div>
                <span class="score-num" [class.positive]="r.score > 0" [class.negative]="r.score < 0">
                  {{ (r.score * 100).toFixed(0) }}
                </span>
              </div>
              <div class="signal-price">\${{ r.price?.toLocaleString('en-US',{minimumFractionDigits:2}) }}</div>
            </div>
            @if (r.indicators) {
              <div class="indicators-grid">
                @for (entry of getIndicatorEntries(r.indicators); track entry.key) {
                  <div class="ind-item">
                    <span class="ind-name">{{ entry.key.toUpperCase() }}</span>
                    <div class="ind-bar-wrap">
                      <div class="ind-bar" [style.width.%]="Math.abs(entry.value) * 100"
                        [class.bar-pos]="entry.value > 0" [class.bar-neg]="entry.value < 0"></div>
                    </div>
                    <span class="ind-val" [class.positive]="entry.value > 0" [class.negative]="entry.value < 0">
                      {{ (entry.value * 100).toFixed(0) }}
                    </span>
                  </div>
                }
              </div>
            }
          } @else {
            <div class="no-signal">
              <div class="no-signal-icon">📡</div>
              <p>No signal yet. Start the bot to begin analysis.</p>
            </div>
          }
        </div>
      </div>

      <!-- Quick actions -->
      <div class="quick-actions">
        <button class="btn btn-primary" [class.btn-stop]="bot.status() === 'running'" (click)="toggleBot()">
          {{ bot.status() === 'running' ? '⏹ Stop Bot' : '▶ Start Bot' }}
        </button>
        <a routerLink="/chart" class="btn btn-ghost">📈 Live Chart</a>
        <a routerLink="/bot" class="btn btn-ghost">⚙ Configure</a>
        <a routerLink="/trades" class="btn btn-ghost">📋 Trade History</a>
      </div>

      <!-- Open positions -->
      @if (tradeStore.openTrades().length) {
        <div class="section">
          <div class="section-title">Open Positions</div>
          <div class="positions-list">
            @for (trade of tradeStore.openTrades(); track trade.id) {
              <div class="position-row">
                <span class="side-badge" [class]="'side-' + trade.side.toLowerCase()">{{ trade.side }}</span>
                <span class="pos-pair">{{ trade.pair }}</span>
                <div class="pos-prices">
                  <span class="pos-entry">\${{ trade.entryPrice.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span>
                  <span class="pos-arrow">→</span>
                  @if (ws.ticker()) {
                    <span class="pos-current">\${{ ws.ticker()!.price.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span>
                  }
                </div>
                @if (ws.ticker()) {
                  <span class="pos-pnl" [class.positive]="livePnl(trade) > 0" [class.negative]="livePnl(trade) < 0">
                    {{ livePnl(trade) >= 0 ? '+' : '' }}\${{ livePnl(trade).toFixed(2) }}
                  </span>
                }
                <span class="pos-mode" [class.paper]="trade.isPaper">{{ trade.isPaper ? 'PAPER' : 'LIVE' }}</span>
              </div>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1200px; animation: fadeIn 0.25s ease-out; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 2px; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .header-right { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .pair-badge, .tf-badge {
      background: var(--bg-card); border: 1px solid var(--border);
      padding: 4px 10px; border-radius: 6px; font-size: 12px; color: var(--text-secondary); font-weight: 600;
    }
    .live-badge { font-size: 11px; color: var(--green); font-weight: 600; }
    .offline-badge { font-size: 11px; color: var(--text-muted); }

    /* Ticker */
    .ticker-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 20px; margin-bottom: 20px;
    }
    .ticker-left { display: flex; align-items: baseline; gap: 12px; }
    .ticker-price { font-size: 28px; font-weight: 700; }
    .price-up { color: var(--green); }
    .price-down { color: var(--red); }
    .ticker-change { font-size: 14px; font-weight: 600; }
    .ticker-stats { display: flex; gap: 28px; }
    .ts-item { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .ts-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .ts-val { font-size: 13px; font-weight: 600; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }

    /* KPI grid */
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }

    /* Mid row */
    .mid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px;
    }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .card-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .card-actions { display: flex; align-items: center; gap: 8px; }
    .updated-at { font-size: 11px; color: var(--text-muted); }
    .icon-btn {
      background: var(--bg-hover); border: 1px solid var(--border); color: var(--text-secondary);
      width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .icon-btn:hover { color: var(--text-primary); }
    .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .mode-pill {
      font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 700; letter-spacing: 0.04em;
    }
    .mode-pill.paper { background: rgba(245,158,11,0.15); color: var(--yellow); }
    .mode-pill.live { background: rgba(239,83,80,0.12); color: var(--red); }

    /* Wallet */
    .wallet-loading { padding: 8px 0; }
    .balance-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 0; border-bottom: 1px solid var(--border);
    }
    .balance-row:last-child { border-bottom: none; }
    .asset-info { display: flex; align-items: center; gap: 8px; }
    .asset-icon { font-size: 18px; }
    .asset-name { font-size: 13px; font-weight: 600; }
    .asset-amounts { text-align: right; }
    .asset-total { font-size: 15px; font-weight: 700; display: block; }
    .asset-locked { font-size: 11px; color: var(--yellow); }
    .total-value {
      margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);
      font-size: 12px; color: var(--text-secondary); text-align: right;
    }
    .total-value strong { color: var(--text-primary); font-size: 15px; }
    .wallet-empty { font-size: 13px; color: var(--text-muted); padding: 16px 0; text-align: center; }
    .inline-error { font-size: 12px; color: var(--red); background: rgba(239,83,80,0.08); border-radius: 6px; padding: 10px; }

    /* Signal */
    .signal-main { margin-bottom: 14px; }
    .signal-action-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .signal-action { font-size: 14px; font-weight: 700; padding: 4px 12px; border-radius: 5px; }
    .action-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .action-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .action-hold { background: rgba(148,163,184,0.1); color: var(--text-secondary); }
    .signal-score-label { font-size: 11px; color: var(--text-muted); }
    .score-bar-wrap { flex: 1; height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden; }
    .score-bar { height: 100%; border-radius: 2px; transition: width 0.4s; }
    .bar-buy { background: var(--green); }
    .bar-sell { background: var(--red); }
    .score-num { font-size: 13px; font-weight: 700; min-width: 28px; text-align: right; }
    .signal-price { font-size: 12px; color: var(--text-muted); }
    .signal-time { font-size: 11px; color: var(--text-muted); }
    .indicators-grid { display: flex; flex-direction: column; gap: 7px; }
    .ind-item { display: flex; align-items: center; gap: 8px; }
    .ind-name { font-size: 10px; color: var(--text-muted); width: 36px; font-weight: 600; }
    .ind-bar-wrap { flex: 1; height: 3px; background: var(--bg-hover); border-radius: 2px; overflow: hidden; }
    .ind-bar { height: 100%; border-radius: 2px; transition: width 0.4s; }
    .bar-pos { background: var(--green); }
    .bar-neg { background: var(--red); }
    .ind-val { font-size: 11px; font-weight: 600; min-width: 28px; text-align: right; }
    .no-signal { text-align: center; padding: 24px 0; color: var(--text-muted); }
    .no-signal-icon { font-size: 32px; margin-bottom: 8px; }
    .no-signal p { font-size: 12px; margin: 0; }

    /* Quick actions */
    .quick-actions { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
    .btn {
      padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 13px; font-weight: 600; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s;
    }
    .btn-primary { background: var(--blue); color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-stop { background: var(--red); }
    .btn-stop:hover { background: #dc2626; }
    .btn-ghost {
      background: var(--bg-card); color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); }

    /* Open positions */
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .positions-list { display: flex; flex-direction: column; gap: 8px; }
    .position-row {
      display: flex; align-items: center; gap: 14px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px 16px;
    }
    .side-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
    .side-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .side-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .pos-pair { font-weight: 600; font-size: 14px; }
    .pos-prices { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
    .pos-current { color: var(--text-primary); }
    .pos-arrow { color: var(--text-muted); }
    .pos-pnl { font-size: 14px; font-weight: 700; margin-left: auto; }
    .pos-mode { font-size: 10px; padding: 2px 6px; border-radius: 3px; }
    .pos-mode.paper { background: rgba(245,158,11,0.1); color: var(--yellow); }

    @media (max-width: 900px) {
      .stats-grid { grid-template-columns: repeat(2,1fr); }
      .mid-row { grid-template-columns: 1fr; }
      .ticker-stats { display: none; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  walletBalances = signal<WalletBalance[]>([]);
  walletLoading = signal(false);
  walletError = signal<string | null>(null);
  walletUpdatedAt = signal<number>(0);
  walletIsPaper = signal(false);
  today = new Date();

  readonly totalUsdValue = computed(() => {
    const price = this.ws.ticker()?.price ?? 0;
    return this.walletBalances().reduce((sum, b) => {
      if (b.asset === 'USDT' || b.asset === 'BUSD' || b.asset === 'USDC') return sum + b.total;
      if ((b.asset === 'BTC' || b.asset === 'BTCUSDT') && price > 0) return sum + b.total * price;
      return sum;
    }, 0);
  });

  readonly Math = Math;

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
      const url = 'https://raw.githubusercontent.com/ishivamsoni150299/binance-trade/main/wallet.json';
      const data = await firstValueFrom(this.http.get<WalletData>(url));
      if (!data.balances?.length) {
        this.walletError.set('Bot hasn\'t run yet — trigger it manually in GitHub Actions.');
      } else {
        this.walletBalances.set(data.balances);
        this.walletUpdatedAt.set(data.updatedAt);
        this.walletIsPaper.set(data.isPaper ?? false);
      }
    } catch {
      this.walletError.set('Could not load wallet. Bot will update it on next run.');
    } finally {
      this.walletLoading.set(false);
    }
  }

  assetIcon(asset: string): string {
    const icons: Record<string, string> = {
      BTC: '₿', ETH: 'Ξ', USDT: '$', BUSD: '$', USDC: '$',
      BNB: '⬡', SOL: '◎', XRP: '✕', ADA: '₳', DOT: '●',
    };
    return icons[asset] ?? '◎';
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
