import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { BinanceWsService } from '../../core/services/binance-ws.service';
import { ConfigService } from '../../core/services/config.service';

interface NavItem { path: string; label: string; icon: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TitleCasePipe],
  template: `
    <nav class="sidebar">
      <!-- Logo -->
      <div class="logo">
        <div class="logo-icon-wrap">
          <span class="logo-icon">BT</span>
        </div>
        <div>
          <div class="logo-text">BTrader</div>
          <div class="logo-sub">Auto Trading Bot</div>
        </div>
      </div>

      <!-- Nav -->
      <ul class="nav-list">
        @for (item of navItems; track item.path) {
          <li>
            <a [routerLink]="item.path" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>

      <!-- Live Price -->
      @if (ws.ticker(); as t) {
        <div class="live-price-box">
          <div class="lp-pair">{{ config.pair() }}</div>
          <div class="lp-price" [class.price-up]="t.priceChangePct >= 0" [class.price-down]="t.priceChangePct < 0">
            \${{ t.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}
          </div>
          <div class="lp-change" [class.positive]="t.priceChangePct >= 0" [class.negative]="t.priceChangePct < 0">
            {{ t.priceChangePct >= 0 ? 'UP' : 'DOWN' }} {{ t.priceChangePct.toFixed(2) }}%
          </div>
        </div>
      }

      <!-- Bot status -->
      <div class="bot-status-indicator" [class]="'status-' + bot.status()">
        <span class="status-dot"></span>
        <div class="status-info">
          <span class="status-label">Bot: {{ bot.status() | titlecase }}</span>
          @if (bot.cycleCount() > 0) {
            <span class="cycle-count">{{ bot.cycleCount() }} cycles</span>
          }
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .sidebar {
      width: 220px;
      min-height: 100vh;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 0;
      flex-shrink: 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 16px 18px;
      border-bottom: 1px solid var(--border);
    }
    .logo-icon-wrap {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, var(--blue), var(--purple));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .logo-icon { font-size: 12px; color: white; font-weight: 700; letter-spacing: 0.06em; }
    .logo-text { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
    .logo-sub { font-size: 10px; color: var(--text-muted); letter-spacing: 0.05em; }
    .nav-list { list-style: none; padding: 10px 8px 0; margin: 0; flex: 1; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      border-radius: 8px;
      margin-bottom: 2px;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
    .nav-item.active {
      color: var(--blue);
      background: rgba(59, 130, 246, 0.1);
      font-weight: 600;
    }
    .nav-icon { font-size: 12px; width: 20px; text-align: center; font-weight: 700; color: var(--text-muted); }
    .live-price-box {
      margin: 8px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
    }
    .lp-pair { font-size: 10px; color: var(--text-muted); letter-spacing: 0.08em; margin-bottom: 4px; }
    .lp-price { font-size: 17px; font-weight: 700; line-height: 1.2; }
    .lp-change { font-size: 12px; font-weight: 600; margin-top: 2px; }
    .price-up { color: var(--green); }
    .price-down { color: var(--red); }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .bot-status-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
    }
    .status-info { display: flex; flex-direction: column; gap: 1px; }
    .status-label { font-size: 12px; }
    .cycle-count { font-size: 10px; color: var(--text-muted); }
    .status-running .status-dot {
      background: var(--green);
      animation: pulse-green 2s infinite;
    }
    .status-error .status-dot { background: var(--red); }
    .status-running .status-label { color: var(--green); }
    .status-error .status-label { color: var(--red); }
  `]
})
export class SidebarComponent {
  get navItems(): NavItem[] {
    const simple = this.config.config().simpleMode;
    if (simple) {
      return [
        { path: '/dashboard', label: 'Dashboard',     icon: 'D' },
        { path: '/bot',       label: 'Bot Config',    icon: 'B' },
        { path: '/trades',    label: 'Trade History', icon: 'T' },
      ];
    }
    return [
      { path: '/dashboard', label: 'Dashboard',     icon: 'D' },
      { path: '/chart',     label: 'Live Chart',    icon: 'C' },
      { path: '/market',    label: 'Gainers/Losers',icon: 'M' },
      { path: '/bot',       label: 'Bot Config',    icon: 'B' },
      { path: '/trades',    label: 'Trade History', icon: 'T' },
      { path: '/guide',     label: 'How It Works',  icon: 'G' },
      { path: '/settings',  label: 'Settings',      icon: 'S' },
    ];
  }

  constructor(
    readonly bot: BotSchedulerService,
    readonly ws: BinanceWsService,
    readonly config: ConfigService,
  ) {}
}
