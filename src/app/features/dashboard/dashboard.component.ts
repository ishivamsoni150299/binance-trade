import { Component, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BinanceWsService } from '../../core/services/binance-ws.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { TradeStoreService } from '../../core/services/trade-store.service';
import { ConfigService } from '../../core/services/config.service';
import { ApiService, WalletBalance, BacktestResult } from '../../core/services/api.service';
import { CredentialsService } from '../../core/services/credentials.service';
import { NotificationService } from '../../core/services/notification.service';
import { PriceAlertService, PriceAlert } from '../../core/services/price-alert.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StatCardComponent, RouterLink, DatePipe, FormsModule],
  template: `
    <div class="page">

      <!-- Page header -->
      <div class="page-header">
        <div class="ph-left">
          <h1>Dashboard</h1>
          <p class="ph-sub">{{ today | date:'EEEE, MMMM d, y' }}</p>
        </div>
        <div class="ph-right">
          <div class="conn-badge" [class.connected]="ws.connected()">
            <span class="conn-dot"></span>
            {{ ws.connected() ? 'Live' : 'Connecting...' }}
          </div>
          <span class="pair-chip">{{ config.pair() }}</span>
          <span class="tf-chip">{{ config.timeframe() }}</span>
          @if (config.config().scanEnabled) {
            <span class="scan-chip">Auto Pair</span>
          }
          <!-- Notification bell -->
          <button class="notif-bell" (click)="toggleNotifPanel()" [class.has-unread]="notif.unreadCount() > 0">
            <span class="bell-icon">N</span>
            @if (notif.unreadCount() > 0) {
              <span class="bell-badge">{{ notif.unreadCount() }}</span>
            }
          </button>
          <!-- Enable notifications button -->
          @if (notif.permission() === 'default') {
            <button class="btn-enable-notif" (click)="enableNotifications()">Enable Alerts</button>
          }
        </div>
      </div>

      <!-- Big price ticker -->
      @if (ws.ticker(); as t) {
        <div class="price-hero">
          <div class="hero-left">
            <span class="hero-pair">{{ config.pair() }}</span>
            <div class="hero-price-row">
              <span class="hero-price" [class.up]="t.priceChangePct >= 0" [class.dn]="t.priceChangePct < 0">
                \${{ t.price.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) }}
              </span>
              <span class="hero-change" [class.up]="t.priceChangePct >= 0" [class.dn]="t.priceChangePct < 0">
                {{ t.priceChangePct >= 0 ? 'UP' : 'DOWN' }} {{ t.priceChangePct.toFixed(2) }}%
              </span>
            </div>
          </div>
          <div class="hero-stats">
            <div class="hs-col">
              <span class="hs-label">24H High</span>
              <span class="hs-val up">\${{ t.high.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span>
            </div>
            <div class="hs-divider"></div>
            <div class="hs-col">
              <span class="hs-label">24H Low</span>
              <span class="hs-val dn">\${{ t.low.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span>
            </div>
            <div class="hs-divider"></div>
            <div class="hs-col">
              <span class="hs-label">Volume</span>
              <span class="hs-val">\${{ (t.volume * t.price / 1e6).toFixed(1) }}M</span>
            </div>
            <div class="hs-divider"></div>
            <div class="hs-col">
              <span class="hs-label">24H Change</span>
              <span class="hs-val" [class.up]="t.priceChangePct >= 0" [class.dn]="t.priceChangePct < 0">
                {{ t.priceChangePct >= 0 ? '+' : '-' }}\${{ Math.abs(t.price - t.price/(1+t.priceChangePct/100)).toFixed(2) }}
              </span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn-start" [class.running]="bot.status() === 'running'" (click)="toggleBot()">
              {{ bot.status() === 'running' ? 'Stop Bot' : 'Start Bot' }}
            </button>
            <a routerLink="/chart" class="btn-chart">Chart</a>
          </div>
        </div>
      } @else {
        <div class="price-hero loading-hero">
          <div class="hero-left">
            <span class="hero-pair">{{ config.pair() }}</span>
            <div class="skeleton" style="height:36px;width:200px;margin-top:6px;border-radius:6px"></div>
          </div>
        </div>
      }

      <!-- KPI row -->
      <div class="kpi-row">
        <app-stat-card label="Total P&L"
          [value]="'$' + tradeStore.stats().totalPnl.toFixed(2)"
          [isPositive]="tradeStore.stats().totalPnl > 0"
          [isNegative]="tradeStore.stats().totalPnl < 0"
          [trend]="tradeStore.stats().totalPnl"
          [sub]="tradeStore.stats().totalTrades + ' closed trades'" />
        <app-stat-card label="Today's P&L"
          [value]="'$' + tradeStore.dailyPnl().toFixed(2)"
          [isPositive]="tradeStore.dailyPnl() > 0"
          [isNegative]="tradeStore.dailyPnl() < 0"
          [trend]="tradeStore.dailyPnl()"
          sub="Since midnight" />
        <app-stat-card label="Win Rate"
          [value]="tradeStore.stats().winRate.toFixed(1) + '%'"
          [isPositive]="tradeStore.stats().winRate >= 55"
          [isNegative]="tradeStore.stats().winRate < 45 && tradeStore.stats().totalTrades > 0"
          [sub]="'Avg ' + tradeStore.stats().avgPnlPct.toFixed(2) + '% / trade'" />
        <app-stat-card label="Open Positions"
          [value]="tradeStore.openTrades().length.toString()"
          [sub]="'Bot: ' + bot.status() + (bot.cycleCount() > 0 ? ' - ' + bot.cycleCount() + ' cycles' : '')" />
        <app-stat-card label="Paper Balance"
          [value]="walletUSDT()"
          [isPositive]="walletIsPaper()"
          [sub]="walletIsPaper() ? 'Simulated - Updated ' + (walletUpdatedAt() | date:'HH:mm') : 'Live account'" />
      </div>

      <!-- Middle: Signal card + Bot activity + Wallet -->
      <div class="mid-grid">

        <!-- Signal panel -->
        <div class="panel signal-panel">
          <div class="panel-header">
            <span class="panel-title">Bot Signal</span>
            @if (bot.lastResult()) {
              <div class="panel-meta">
                <span class="panel-time">{{ bot.lastResult()!.timestamp | date:'HH:mm:ss' }}</span>
                @if (bot.lastResult()!.pair) {
                  <span class="panel-time">Pair: {{ bot.lastResult()!.pair }}</span>
                }
              </div>
            }
          </div>

          @if (bot.lastResult(); as r) {
            <div class="sig-body">
              <div class="sig-top">
                <div class="sig-action-block" [class]="'sig-' + r.action.toLowerCase()">
                  <span class="sig-icon">{{ r.action === 'BUY' ? '^' : r.action === 'SELL' ? 'v' : '-' }}</span>
                  <span class="sig-label">{{ r.action }}</span>
                </div>
                <div class="sig-score-block">
                  <div class="sib-top">
                    <span class="sib-label">Signal Strength</span>
                    <span class="sib-val" [class.up]="r.score > 0" [class.dn]="r.score < 0">
                      {{ (r.score * 100).toFixed(0) }}
                    </span>
                  </div>
                  <div class="sib-bar-bg">
                    <div class="sib-bar-fill" [class.up]="r.score >= 0" [class.dn]="r.score < 0"
                      [style.width.%]="Math.abs(r.score) * 100"></div>
                  </div>
                  <div class="sib-price">\${{ r.price ? r.price.toLocaleString('en-US',{minimumFractionDigits:2}) : '-' }}</div>
                </div>
              </div>

              @if (r.indicators) {
                <div class="ind-section">
                  @for (e of getIndicatorEntries(r.indicators); track e.key) {
                    <div class="ind-row">
                      <span class="ind-key">{{ e.key.toUpperCase() }}</span>
                      <div class="ind-track">
                        <div class="ind-fill" [class.up]="e.value > 0" [class.dn]="e.value < 0"
                          [style.width.%]="Math.abs(e.value) * 100"></div>
                      </div>
                      <span class="ind-num" [class.up]="e.value > 0" [class.dn]="e.value < 0">
                        {{ e.value > 0 ? '+' : '' }}{{ (e.value * 100).toFixed(0) }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="sig-empty">
              <div class="sig-empty-icon">Signal</div>
              <p>Waiting for signal...</p>
              <button class="btn-start-sm" (click)="toggleBot()">Start Bot</button>
            </div>
          }
        </div>

        <!-- Wallet panel -->
        <div class="panel wallet-panel">
          <div class="panel-header">
            <span class="panel-title">
              Wallet
              @if (walletIsPaper()) { <span class="mode-tag paper">PAPER</span> }
              @else { <span class="mode-tag live">LIVE</span> }
            </span>
            <div style="display:flex;align-items:center;gap:8px">
              @if (walletUpdatedAt() > 0) {
                <span class="panel-time">{{ walletUpdatedAt() | date:'HH:mm' }}</span>
              }
              <button class="refresh-btn" (click)="loadWallet(true)" [disabled]="walletLoading()">Refresh</button>
            </div>
          </div>

          @if (walletLoading()) {
            <div class="skeleton" style="height:18px;margin-bottom:8px;border-radius:4px"></div>
            <div class="skeleton" style="height:18px;width:70%;border-radius:4px"></div>
          } @else if (walletError()) {
            <div class="wallet-err">{{ walletError() }}</div>
          } @else {
            <div class="wallet-list">
              @for (b of walletBalances(); track b.asset) {
                <div class="wl-row">
                  <div class="wl-left">
                    <span class="wl-coin-badge">{{ b.asset.slice(0,3) }}</span>
                    <div class="wl-info">
                      <span class="wl-name">{{ b.asset }}</span>
                      @if (b.locked > 0) { <span class="wl-locked">{{ b.locked.toFixed(4) }} locked</span> }
                    </div>
                  </div>
                  <span class="wl-amount">{{ formatBalance(b) }}</span>
                </div>
              }
            </div>
            @if (totalUsd() > 0) {
              <div class="wallet-total">
                <span>Total Value</span>
                <span class="wt-val">\${{ totalUsd().toLocaleString('en-US',{minimumFractionDigits:2}) }}</span>
              </div>
            }
          }
        </div>

        <!-- Open positions panel -->
        <div class="panel positions-panel">
          <div class="panel-header">
            <span class="panel-title">Open Positions</span>
            <span class="panel-count">{{ tradeStore.openTrades().length }}</span>
          </div>

          @if (tradeStore.openTrades().length === 0) {
            <div class="pos-empty">
              <span class="pos-empty-icon">None</span>
              <p>No open positions</p>
            </div>
          } @else {
            <div class="pos-list">
              @for (t of tradeStore.openTrades(); track t.id) {
                <div class="pos-row">
                  <div class="pos-left">
                    <span class="pos-side" [class]="'side-' + t.side.toLowerCase()">{{ t.side }}</span>
                    <div>
                      <div class="pos-pair">{{ t.pair }}</div>
                      <div class="pos-entry">Entry \${{ t.entryPrice.toLocaleString('en-US',{minimumFractionDigits:2}) }}</div>
                    </div>
                  </div>
                  <div class="pos-right">
                    @if (ws.ticker()) {
                      <div class="pos-pnl" [class.up]="livePnl(t) > 0" [class.dn]="livePnl(t) < 0">
                        {{ livePnl(t) >= 0 ? '+' : '' }}\${{ livePnl(t).toFixed(2) }}
                      </div>
                      <div class="pos-pct" [class.up]="livePnl(t) > 0" [class.dn]="livePnl(t) < 0">
                        {{ livePnlPct(t) >= 0 ? '+' : '' }}{{ livePnlPct(t).toFixed(2) }}%
                      </div>
                    }
                    <span class="pos-tag" [class.paper]="t.isPaper">{{ t.isPaper ? 'PAPER' : 'LIVE' }}</span>
                  </div>
                </div>
              }
            </div>
          }
        </div>

      </div>

      <!-- Backtest panel -->
      <div class="panel backtest-panel">
        <div class="panel-header">
          <span class="panel-title">Backtest (Last {{ backtestDays() }} Days)</span>
          <div class="bt-controls">
            <button class="bt-btn" [class.active]="backtestDays() === 30" (click)="setBacktestDays(30)">30d</button>
            <button class="bt-btn" [class.active]="backtestDays() === 90" (click)="setBacktestDays(90)">90d</button>
            <button class="bt-run" (click)="runBacktest()" [disabled]="backtestLoading()">
              {{ backtestLoading() ? 'Running...' : 'Run' }}
            </button>
          </div>
        </div>

        @if (backtestLoading()) {
          <div class="skeleton" style="height:18px;margin-bottom:8px;border-radius:4px"></div>
          <div class="skeleton" style="height:18px;width:70%;border-radius:4px"></div>
        } @else if (backtestError()) {
          <div class="wallet-err">{{ backtestError() }}</div>
        } @else if (backtestResult()) {
          <div class="bt-grid">
            <div class="bt-item">
              <span class="bt-label">Trades</span>
              <span class="bt-val">{{ backtestResult()?.trades }}</span>
            </div>
            <div class="bt-item">
              <span class="bt-label">Win Rate</span>
              <span class="bt-val" [class.up]="(backtestResult()?.winRate ?? 0) >= 50" [class.dn]="(backtestResult()?.winRate ?? 0) < 50">
                {{ (backtestResult()?.winRate ?? 0).toFixed(1) }}%
              </span>
            </div>
            <div class="bt-item">
              <span class="bt-label">Total P&L</span>
              <span class="bt-val" [class.up]="(backtestResult()?.totalPnl ?? 0) >= 0" [class.dn]="(backtestResult()?.totalPnl ?? 0) < 0">
                {{ (backtestResult()?.totalPnl ?? 0) >= 0 ? '+' : '' }}\${{ (backtestResult()?.totalPnl ?? 0).toFixed(2) }}
              </span>
            </div>
            <div class="bt-item">
              <span class="bt-label">Return</span>
              <span class="bt-val" [class.up]="(backtestResult()?.totalPnlPct ?? 0) >= 0" [class.dn]="(backtestResult()?.totalPnlPct ?? 0) < 0">
                {{ (backtestResult()?.totalPnlPct ?? 0) >= 0 ? '+' : '' }}{{ (backtestResult()?.totalPnlPct ?? 0).toFixed(2) }}%
              </span>
            </div>
            <div class="bt-item">
              <span class="bt-label">Max Drawdown</span>
              <span class="bt-val dn">-\${{ (backtestResult()?.maxDrawdown ?? 0).toFixed(2) }}</span>
            </div>
            <div class="bt-item">
              <span class="bt-label">Candles</span>
              <span class="bt-val">{{ backtestResult()?.candles }}</span>
            </div>
          </div>
          @if (backtestResult()?.note) {
            <div class="bt-note">{{ backtestResult()?.note }}</div>
          }
        }
      </div>

      <!-- Notification panel + Price alerts + Portfolio -->
      <div class="bottom-grid">

        <!-- Notification inbox -->
        <div class="panel notif-panel">
          <div class="panel-header">
            <span class="panel-title">Notifications</span>
            <div style="display:flex;gap:6px;align-items:center">
              @if (notif.permission() === 'default') {
                <button class="btn-enable-notif" (click)="enableNotifications()">Enable Push</button>
              }
              @if (notif.permission() === 'granted') {
                <span class="push-on">Push ON</span>
              }
              @if (notif.inbox().length > 0) {
                <button class="refresh-btn" (click)="notif.markAllRead()">Clear</button>
              }
            </div>
          </div>
          @if (notif.inbox().length === 0) {
            <div class="notif-empty">No notifications yet. Notifications appear when bot trades or price alerts trigger.</div>
          } @else {
            <div class="notif-list">
              @for (n of notif.inbox().slice(0, 8); track n.id) {
                <div class="notif-row" [class.unread]="!n.read" [class]="'nt-' + n.type">
                  <div class="nr-icon">
                    @if (n.type === 'tp') { P }
                    @else if (n.type === 'sl') { S }
                    @else if (n.type === 'buy') { B }
                    @else if (n.type === 'sell') { V }
                    @else { A }
                  </div>
                  <div class="nr-body">
                    <div class="nr-title">{{ n.title }}</div>
                    <div class="nr-sub">{{ n.body }}</div>
                  </div>
                  <div class="nr-time">{{ n.ts | date:'HH:mm' }}</div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Price Alerts -->
        <div class="panel alerts-panel">
          <div class="panel-header">
            <span class="panel-title">Price Alerts</span>
            @if (priceAlerts.alerts().length > 0) {
              <button class="refresh-btn" (click)="priceAlerts.clearTriggered()">Clear Done</button>
            }
          </div>
          <!-- Add alert form -->
          <div class="alert-form">
            <select class="alert-dir" [value]="alertDirection()"
              (change)="alertDirection.set(($any($event.target)).value)">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <input type="number" class="alert-input" placeholder="Target price"
              [value]="alertPrice()"
              (input)="alertPrice.set(($any($event.target)).value)" />
            <button class="btn-add-alert" (click)="addAlert()">+ Add</button>
          </div>
          @if (priceAlerts.alerts().length === 0) {
            <div class="notif-empty">No alerts set. Set a price target above.</div>
          } @else {
            <div class="notif-list">
              @for (a of priceAlerts.alerts(); track a.id) {
                <div class="notif-row" [class.triggered]="a.triggered">
                  <div class="nr-icon" [class.up]="a.direction === 'above'" [class.dn]="a.direction === 'below'">
                    {{ a.direction === 'above' ? 'H' : 'L' }}
                  </div>
                  <div class="nr-body">
                    <div class="nr-title">{{ a.pair }} {{ a.direction }} \${{ a.targetPrice.toLocaleString() }}</div>
                    <div class="nr-sub">{{ a.triggered ? 'Triggered' : 'Watching...' }}</div>
                  </div>
                  <button class="nr-del" (click)="priceAlerts.remove(a.id)">x</button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Portfolio breakdown -->
        <div class="panel portfolio-panel">
          <div class="panel-header">
            <span class="panel-title">Portfolio</span>
            <span class="panel-time">{{ walletIsPaper() ? 'Paper' : 'Live' }}</span>
          </div>
          @if (walletBalances().length === 0) {
            <div class="notif-empty">No assets. Start bot or add API keys in Settings.</div>
          } @else {
            <div class="pie-wrap">
              <svg viewBox="0 0 100 100" class="pie-svg">
                @for (seg of pieSegments(); track seg.asset; let i = $index) {
                  <circle class="pie-seg"
                    [attr.stroke]="seg.color"
                    [attr.stroke-dasharray]="seg.dash + ' ' + (100 - seg.dash)"
                    [attr.stroke-dashoffset]="seg.offset"
                    r="15.9" cx="50" cy="50" fill="transparent" stroke-width="31.8" />
                }
              </svg>
              <div class="pie-total">
                <div class="pt-val">\${{ totalUsd().toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }}</div>
                <div class="pt-label">Total</div>
              </div>
            </div>
            <div class="pie-legend">
              @for (seg of pieSegments(); track seg.asset) {
                <div class="pl-row">
                  <span class="pl-dot" [style.background]="seg.color"></span>
                  <span class="pl-name">{{ seg.asset }}</span>
                  <span class="pl-pct">{{ seg.pct.toFixed(1) }}%</span>
                  <span class="pl-val">\${{ seg.usd.toFixed(2) }}</span>
                </div>
              }
            </div>
          }
        </div>

      </div>

      <!-- Bottom quick actions -->
      @if (config.config().simpleMode) {
        <div class="bottom-bar">
          <a routerLink="/bot" class="bb-btn">Bot Config</a>
          <a routerLink="/trades" class="bb-btn">Trade History</a>
          <a routerLink="/settings" class="bb-btn">Settings</a>
        </div>
      } @else {
        <div class="bottom-bar">
          <a routerLink="/chart" class="bb-btn">Live Chart</a>
          <a routerLink="/bot" class="bb-btn">Bot Config</a>
          <a routerLink="/trades" class="bb-btn">Trade History</a>
          <a routerLink="/settings" class="bb-btn">Settings</a>
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 1400px; animation: fadeIn 0.2s ease-out; }

    /* Header */
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
    h1 { font-size:22px; font-weight:700; margin:0 0 2px; }
    .ph-sub { font-size:12px; color:var(--text-muted); margin:0; }
    .ph-right { display:flex; align-items:center; gap:8px; margin-top:4px; }
    .conn-badge {
      display:flex; align-items:center; gap:5px;
      font-size:11px; font-weight:600; color:var(--text-muted);
      background:var(--bg-card); border:1px solid var(--border);
      padding:3px 10px; border-radius:20px;
    }
    .conn-badge.connected { color:var(--green); border-color:rgba(38,166,154,0.3); }
    .conn-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
    .conn-badge.connected .conn-dot { animation: pulse-green 2s infinite; }
    .pair-chip, .tf-chip {
      background:var(--bg-card); border:1px solid var(--border);
      padding:4px 10px; border-radius:6px; font-size:12px; color:var(--text-secondary); font-weight:600;
    }
    .scan-chip {
      background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.35);
      padding:4px 10px; border-radius:6px; font-size:11px; color:var(--blue); font-weight:700;
    }

    /* Price hero */
    .price-hero {
      background: linear-gradient(135deg, var(--bg-card) 0%, #1a2040 100%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .loading-hero { min-height: 80px; }
    .hero-left { flex-shrink: 0; }
    .hero-pair { font-size:11px; font-weight:700; color:var(--text-muted); letter-spacing:0.08em; }
    .hero-price-row { display:flex; align-items:baseline; gap:12px; margin-top:4px; }
    .hero-price { font-size:36px; font-weight:800; letter-spacing:-0.5px; }
    .hero-price.up { color:var(--green); }
    .hero-price.dn { color:var(--red); }
    .hero-change { font-size:16px; font-weight:700; }
    .hero-change.up { color:var(--green); }
    .hero-change.dn { color:var(--red); }
    .hero-stats { display:flex; align-items:center; gap:0; flex:1; }
    .hs-col { padding:0 20px; }
    .hs-divider { width:1px; height:32px; background:var(--border); }
    .hs-label { display:block; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-bottom:4px; }
    .hs-val { font-size:14px; font-weight:700; color:var(--text-primary); }
    .hs-val.up { color:var(--green); }
    .hs-val.dn { color:var(--red); }
    .hero-actions { display:flex; gap:10px; flex-shrink:0; flex-direction:column; }
    .btn-start {
      display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px;
      border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:700;
      background:var(--blue); color:white; transition:all 0.15s; white-space:nowrap;
    }
    .btn-start:hover { background:#2563eb; }
    .btn-start.running { background:var(--red); }
    .btn-start.running:hover { background:#dc2626; }
    .btn-chart {
      display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 18px;
      border-radius:8px; border:1px solid var(--border); font-size:13px; font-weight:600;
      background:var(--bg-hover); color:var(--text-primary); text-decoration:none; transition:all 0.15s;
    }
    .btn-chart:hover { background:var(--bg-primary); }

    /* KPI row */
    .kpi-row { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:16px; }

    /* Mid grid */
    .mid-grid { display:grid; grid-template-columns:1.2fr 0.9fr 0.9fr; gap:14px; margin-bottom:16px; }
    .panel {
      background:var(--bg-card); border:1px solid var(--border);
      border-radius:12px; padding:16px;
    }
    .panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .panel-meta { display:flex; align-items:center; gap:8px; }
    .panel-title { font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.07em; display:flex; align-items:center; gap:6px; }
    .panel-time { font-size:11px; color:var(--text-muted); }
    .panel-count { font-size:18px; font-weight:700; color:var(--text-primary); }
    .mode-tag { font-size:9px; padding:1px 5px; border-radius:3px; font-weight:700; }
    .mode-tag.paper { background:rgba(245,158,11,0.15); color:var(--yellow); }
    .mode-tag.live { background:rgba(239,83,80,0.1); color:var(--red); }
    .refresh-btn {
      height:24px; border-radius:5px; border:1px solid var(--border);
      background:var(--bg-hover); color:var(--text-secondary); cursor:pointer; font-size:12px;
      display:flex; align-items:center; justify-content:center; padding:0 10px;
    }
    .refresh-btn:hover { color:var(--text-primary); }
    .refresh-btn:disabled { opacity:0.4; cursor:not-allowed; }

    /* Backtest */
    .backtest-panel { margin-bottom: 16px; }
    .bt-controls { display:flex; align-items:center; gap:6px; }
    .bt-btn {
      padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 11px; font-weight: 700;
    }
    .bt-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .bt-run {
      padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 11px; font-weight: 700;
    }
    .bt-run:disabled { opacity: 0.5; cursor: not-allowed; }
    .bt-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
    .bt-item { background: var(--bg-hover); border-radius: 8px; padding: 10px 12px; }
    .bt-label { display:block; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; font-weight: 600; }
    .bt-val { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .bt-note { margin-top: 10px; font-size: 11px; color: var(--text-muted); }

    /* Signal */
    .sig-body { }
    .sig-top { display:flex; gap:14px; margin-bottom:16px; align-items:flex-start; }
    .sig-action-block {
      width:64px; height:64px; border-radius:12px; display:flex; flex-direction:column;
      align-items:center; justify-content:center; flex-shrink:0; gap:2px;
    }
    .sig-buy { background:rgba(38,166,154,0.12); border:1px solid rgba(38,166,154,0.3); }
    .sig-sell { background:rgba(239,83,80,0.12); border:1px solid rgba(239,83,80,0.3); }
    .sig-hold { background:rgba(148,163,184,0.08); border:1px solid var(--border); }
    .sig-icon { font-size:22px; line-height:1; }
    .sig-buy .sig-icon { color:var(--green); }
    .sig-sell .sig-icon { color:var(--red); }
    .sig-hold .sig-icon { color:var(--text-muted); }
    .sig-label { font-size:10px; font-weight:800; letter-spacing:0.05em; }
    .sig-buy .sig-label { color:var(--green); }
    .sig-sell .sig-label { color:var(--red); }
    .sig-hold .sig-label { color:var(--text-muted); }
    .sig-score-block { flex:1; }
    .sib-top { display:flex; justify-content:space-between; margin-bottom:6px; }
    .sib-label { font-size:11px; color:var(--text-muted); }
    .sib-val { font-size:20px; font-weight:800; }
    .sib-val.up { color:var(--green); }
    .sib-val.dn { color:var(--red); }
    .sib-bar-bg { height:5px; background:var(--bg-hover); border-radius:3px; overflow:hidden; margin-bottom:6px; }
    .sib-bar-fill { height:100%; border-radius:3px; transition:width 0.5s ease; }
    .sib-bar-fill.up { background:linear-gradient(90deg,var(--green),var(--green-bright)); }
    .sib-bar-fill.dn { background:linear-gradient(90deg,var(--red),var(--red-bright)); }
    .sib-price { font-size:12px; color:var(--text-muted); }
    .ind-section { border-top:1px solid var(--border); padding-top:12px; display:flex; flex-direction:column; gap:9px; }
    .ind-row { display:flex; align-items:center; gap:10px; }
    .ind-key { font-size:10px; font-weight:700; color:var(--text-muted); width:34px; }
    .ind-track { flex:1; height:4px; background:var(--bg-hover); border-radius:2px; overflow:hidden; }
    .ind-fill { height:100%; border-radius:2px; transition:width 0.4s; }
    .ind-fill.up { background:var(--green); }
    .ind-fill.dn { background:var(--red); }
    .ind-num { font-size:11px; font-weight:700; min-width:30px; text-align:right; }
    .ind-num.up { color:var(--green); }
    .ind-num.dn { color:var(--red); }
    .sig-empty { text-align:center; padding:24px 0; color:var(--text-muted); }
    .sig-empty-icon { font-size:14px; font-weight:700; display:block; margin-bottom:8px; }
    .sig-empty p { font-size:13px; margin:0 0 14px; }
    .btn-start-sm {
      padding:7px 16px; border-radius:7px; border:none; cursor:pointer;
      background:var(--blue); color:white; font-size:12px; font-weight:600;
    }

    /* Wallet */
    .wallet-err { font-size:12px; color:var(--red); background:rgba(239,83,80,0.08); border-radius:6px; padding:10px; }
    .wallet-list { display:flex; flex-direction:column; gap:0; }
    .wl-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:9px 0; border-bottom:1px solid var(--border);
    }
    .wl-row:last-child { border-bottom:none; }
    .wl-left { display:flex; align-items:center; gap:10px; }
    .wl-coin-badge {
      width:32px; height:32px; border-radius:8px;
      background:linear-gradient(135deg, var(--blue), var(--purple));
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:800; color:white; letter-spacing:-0.5px;
    }
    .wl-info { display:flex; flex-direction:column; gap:1px; }
    .wl-name { font-size:13px; font-weight:700; }
    .wl-locked { font-size:10px; color:var(--yellow); }
    .wl-amount { font-size:15px; font-weight:700; color:var(--text-primary); }
    .wallet-total {
      display:flex; justify-content:space-between; align-items:center;
      margin-top:12px; padding-top:10px; border-top:1px solid var(--border);
      font-size:12px; color:var(--text-secondary);
    }
    .wt-val { font-size:16px; font-weight:800; color:var(--text-primary); }

    /* Positions */
    .pos-empty { text-align:center; padding:24px 0; color:var(--text-muted); }
    .pos-empty-icon { font-size:12px; font-weight:700; display:block; margin-bottom:8px; }
    .pos-empty p { font-size:13px; margin:0; }
    .pos-list { display:flex; flex-direction:column; gap:8px; }
    .pos-row {
      display:flex; align-items:center; justify-content:space-between;
      background:var(--bg-hover); border-radius:8px; padding:10px 12px;
    }
    .pos-left { display:flex; align-items:center; gap:10px; }
    .pos-side { font-size:11px; font-weight:800; padding:3px 8px; border-radius:4px; }
    .side-buy { background:rgba(38,166,154,0.15); color:var(--green); }
    .side-sell { background:rgba(239,83,80,0.15); color:var(--red); }
    .pos-pair { font-size:13px; font-weight:700; }
    .pos-entry { font-size:11px; color:var(--text-muted); }
    .pos-right { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
    .pos-pnl { font-size:14px; font-weight:800; }
    .pos-pnl.up { color:var(--green); }
    .pos-pnl.dn { color:var(--red); }
    .pos-pct { font-size:11px; font-weight:600; }
    .pos-pct.up { color:var(--green); }
    .pos-pct.dn { color:var(--red); }
    .pos-tag { font-size:10px; padding:1px 5px; border-radius:3px; margin-top:2px; }
    .pos-tag.paper { background:rgba(245,158,11,0.1); color:var(--yellow); }

    /* Bottom bar */
    .bottom-bar {
      display:flex; gap:10px;
      background:var(--bg-card); border:1px solid var(--border);
      border-radius:12px; padding:12px 16px;
    }
    .bb-btn {
      flex:1; text-align:center; padding:10px; border-radius:8px;
      background:var(--bg-hover); border:1px solid var(--border);
      color:var(--text-secondary); text-decoration:none; font-size:13px; font-weight:600;
      transition:all 0.15s;
    }
    .bb-btn:hover { background:var(--bg-primary); color:var(--text-primary); border-color:var(--border-light); }

    .up { color:var(--green); }
    .dn { color:var(--red); }

    @media (max-width:1100px) {
      .kpi-row { grid-template-columns:repeat(3,1fr); }
      .mid-grid { grid-template-columns:1fr; }
      .bt-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width:700px) {
      .kpi-row { grid-template-columns:repeat(2,1fr); }
      .hero-stats { display:none; }
      .bt-grid { grid-template-columns: repeat(2, 1fr); }
      .bottom-grid { grid-template-columns: 1fr; }
    }

    /* ── Notification bell ─────────────────────────── */
    .notif-bell {
      position:relative; width:32px; height:32px; border-radius:8px;
      border:1px solid var(--border); background:var(--bg-hover);
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      font-size:12px; font-weight:700; color:var(--text-muted);
      transition: all 0.15s;
    }
    .notif-bell:hover { border-color:var(--blue); color:var(--blue); }
    .notif-bell.has-unread { border-color:var(--blue); background:rgba(59,130,246,0.1); color:var(--blue); }
    .bell-badge {
      position:absolute; top:-5px; right:-5px; background:var(--red);
      color:white; font-size:9px; font-weight:800; border-radius:10px;
      min-width:16px; height:16px; display:flex; align-items:center; justify-content:center;
      padding:0 3px;
    }
    .btn-enable-notif {
      padding:4px 10px; border-radius:6px; border:1px solid var(--blue);
      background:rgba(59,130,246,0.1); color:var(--blue); cursor:pointer;
      font-size:11px; font-weight:700;
    }

    /* ── Bottom grid (3 panels) ─────────────────────── */
    .bottom-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:16px; }

    /* ── Notification list ──────────────────────────── */
    .notif-empty { font-size:12px; color:var(--text-muted); text-align:center; padding:16px 0; }
    .push-on { font-size:11px; color:var(--green); font-weight:700; background:rgba(38,166,154,0.1); padding:2px 8px; border-radius:10px; }
    .notif-list { display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; }
    .notif-row {
      display:flex; align-items:center; gap:10px;
      background:var(--bg-primary); border:1px solid var(--border);
      border-radius:8px; padding:8px 10px; transition:all 0.15s;
    }
    .notif-row.unread { border-color:rgba(59,130,246,0.3); }
    .notif-row.triggered { opacity:0.5; }
    .nr-icon {
      width:26px; height:26px; border-radius:6px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:10px; font-weight:800;
    }
    .nt-tp .nr-icon, .notif-row .nr-icon.up { background:rgba(38,166,154,0.15); color:var(--green); }
    .nt-sl .nr-icon, .notif-row .nr-icon.dn { background:rgba(239,83,80,0.12); color:var(--red); }
    .nt-buy .nr-icon { background:rgba(59,130,246,0.15); color:var(--blue); }
    .nt-sell .nr-icon { background:rgba(245,158,11,0.12); color:var(--yellow); }
    .nt-alert .nr-icon, .nt-limit .nr-icon { background:rgba(139,92,246,0.12); color:#8b5cf6; }
    .nr-body { flex:1; min-width:0; }
    .nr-title { font-size:12px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .nr-sub { font-size:11px; color:var(--text-muted); }
    .nr-time { font-size:10px; color:var(--text-muted); flex-shrink:0; }
    .nr-del {
      background:none; border:none; color:var(--text-muted); cursor:pointer;
      font-size:14px; padding:2px 4px; border-radius:4px; flex-shrink:0;
    }
    .nr-del:hover { color:var(--red); background:rgba(239,83,80,0.1); }

    /* ── Price alert form ───────────────────────────── */
    .alert-form { display:flex; gap:6px; margin-bottom:10px; }
    .alert-dir {
      padding:6px 8px; border-radius:6px; border:1px solid var(--border);
      background:var(--bg-primary); color:var(--text-primary); font-size:12px;
      cursor:pointer; flex-shrink:0;
    }
    .alert-input {
      flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--border);
      background:var(--bg-primary); color:var(--text-primary); font-size:12px; outline:none;
    }
    .alert-input:focus { border-color:var(--blue); }
    .btn-add-alert {
      padding:6px 12px; border-radius:6px; border:none;
      background:var(--blue); color:white; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;
    }

    /* ── Portfolio pie ──────────────────────────────── */
    .pie-wrap { position:relative; width:120px; height:120px; margin:0 auto 12px; }
    .pie-svg { width:120px; height:120px; transform:rotate(-90deg); }
    .pie-seg { transition: stroke-dasharray 0.4s ease; }
    .pie-total {
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      text-align:center; pointer-events:none;
    }
    .pt-val { font-size:13px; font-weight:800; color:var(--text-primary); white-space:nowrap; }
    .pt-label { font-size:10px; color:var(--text-muted); }
    .pie-legend { display:flex; flex-direction:column; gap:5px; }
    .pl-row { display:flex; align-items:center; gap:7px; font-size:12px; }
    .pl-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .pl-name { flex:1; color:var(--text-secondary); }
    .pl-pct { color:var(--text-muted); font-size:11px; }
    .pl-val { font-weight:600; color:var(--text-primary); }
  `]
})
export class DashboardComponent implements OnInit {
  walletBalances = signal<WalletBalance[]>([]);
  walletLoading  = signal(false);
  walletError    = signal<string | null>(null);
  walletUpdatedAt = signal<number>(0);
  today = new Date();
  readonly Math = Math;

  backtestDays = signal<30 | 90>(30);
  backtestLoading = signal(false);
  backtestError = signal<string | null>(null);
  backtestResult = signal<BacktestResult | null>(null);

  readonly walletIsPaper = computed(() => !this.creds.isLive());

  readonly walletUSDT = computed(() => {
    const usdt = this.walletBalances().find(b => b.asset === 'USDT' || b.asset === 'BUSD');
    return usdt ? '$' + usdt.total.toLocaleString('en-US',{minimumFractionDigits:2}) : '$0.00';
  });

  readonly totalUsd = computed(() => {
    const price = this.ws.ticker()?.price ?? 0;
    return this.walletBalances().reduce((sum, b) => {
      if (['USDT','BUSD','USDC'].includes(b.asset)) return sum + b.total;
      if (b.asset === 'BTC' && price > 0) return sum + b.total * price;
      return sum;
    }, 0);
  });

  showNotifPanel = signal(false);

  constructor(
    readonly ws: BinanceWsService,
    readonly bot: BotSchedulerService,
    readonly tradeStore: TradeStoreService,
    readonly config: ConfigService,
    private api: ApiService,
    private creds: CredentialsService,
    readonly notif: NotificationService,
    readonly priceAlerts: PriceAlertService,
  ) {}

  toggleNotifPanel(): void {
    this.showNotifPanel.update(v => !v);
    if (this.showNotifPanel()) this.notif.markAllRead();
  }

  async enableNotifications(): Promise<void> {
    await this.notif.requestPermission();
  }

  // Price alert form
  alertPrice = signal('');
  alertDirection = signal<'above' | 'below'>('above');

  addAlert(): void {
    const price = parseFloat(this.alertPrice());
    if (!price || price <= 0) return;
    this.priceAlerts.add(this.config.pair(), price, this.alertDirection());
    this.alertPrice.set('');
  }

  private readonly PIE_COLORS = ['#3b82f6','#26a69a','#f59e0b','#ef5350','#8b5cf6','#10b981'];

  readonly pieSegments = computed(() => {
    const balances = this.walletBalances();
    const btcPrice = this.ws.ticker()?.price ?? 0;
    const items = balances.map(b => {
      let usd = 0;
      if (['USDT','BUSD','USDC'].includes(b.asset)) usd = b.total;
      else if (b.asset === 'BTC' && btcPrice > 0) usd = b.total * btcPrice;
      else usd = b.total; // rough fallback
      return { asset: b.asset, usd };
    }).filter(b => b.usd > 0);

    const total = items.reduce((s, b) => s + b.usd, 0) || 1;
    const circumference = 100; // SVG trick: r=15.9 → circumference ≈ 100
    let offset = 25; // start at top

    return items.map((b, i) => {
      const pct = (b.usd / total) * 100;
      const dash = (pct / 100) * circumference;
      const seg = { asset: b.asset, usd: b.usd, pct, dash, offset, color: this.PIE_COLORS[i % this.PIE_COLORS.length] };
      offset = offset - dash; // SVG offset goes counter-clockwise
      return seg;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.tradeStore.init();
    await this.loadWallet();
    void this.runBacktest();
  }

  async loadWallet(force = false): Promise<void> {
    this.walletLoading.set(true);
    this.walletError.set(null);
    try {
      if (!this.creds.isLive()) {
        // Paper mode — show $10,000 simulated
        this.walletBalances.set([{ asset: 'USDT', free: 10000, locked: 0, total: 10000 }]);
        this.walletUpdatedAt.set(Date.now());
        return;
      }
      // Live mode — read wallet.json written by GitHub Actions bot (Vercel/browser both blocked by Binance 451)
      const res = await fetch(
        'https://raw.githubusercontent.com/ishivamsoni150299/binance-trade/main/wallet.json?t=' + Date.now(),
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error('Could not load wallet from GitHub');
      const data = await res.json();
      const balances: WalletBalance[] = (data.balances ?? [])
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free ?? b.total ?? 0),
          locked: parseFloat(b.locked ?? 0),
          total: parseFloat(b.total ?? b.free ?? 0),
        }))
        .sort((a: WalletBalance, b: WalletBalance) => b.total - a.total);
      this.walletBalances.set(balances);
      this.walletUpdatedAt.set(data.updatedAt ?? Date.now());
    } catch (e: any) {
      this.walletError.set(this.creds.hasKeys() ? `Could not load balance: ${e.message}` : 'Add API keys in Settings to see live balance.');
    } finally {
      this.walletLoading.set(false);
    }
  }

  formatBalance(b: WalletBalance): string {
    if (['USDT','BUSD','USDC'].includes(b.asset)) return '$' + b.total.toLocaleString('en-US',{minimumFractionDigits:2});
    return b.total.toFixed(6);
  }

  toggleBot(): void {
    if (this.bot.status() === 'running') this.bot.stop();
    else this.bot.start();
  }

  livePnl(trade: any): number {
    const price = this.ws.ticker()?.price ?? trade.entryPrice;
    return (price - trade.entryPrice) * trade.quantity * (trade.side === 'BUY' ? 1 : -1);
  }

  livePnlPct(trade: any): number {
    return (this.livePnl(trade) / (trade.entryPrice * trade.quantity)) * 100;
  }

  getIndicatorEntries(obj: Record<string, number>) {
    return Object.entries(obj).map(([key, value]) => ({ key, value }));
  }

  setBacktestDays(days: 30 | 90): void {
    this.backtestDays.set(days);
  }

  async runBacktest(): Promise<void> {
    this.backtestLoading.set(true);
    this.backtestError.set(null);
    try {
      const cfg = this.config.config();
      const result = await this.api.runBacktest({
        symbol: cfg.pair,
        interval: cfg.timeframe,
        days: this.backtestDays(),
        strategy: cfg.strategy,
        strategyParams: cfg.strategyParams as any,
        riskParams: cfg.riskParams as any,
        trustedOnly: cfg.trustedOnly,
        trustedPairs: cfg.trustedPairs,
      });
      if (result.error) this.backtestError.set(result.error);
      else this.backtestResult.set(result);
    } catch {
      this.backtestError.set('Backtest failed. Try again.');
    } finally {
      this.backtestLoading.set(false);
    }
  }
}
