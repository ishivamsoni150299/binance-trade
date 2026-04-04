import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';

interface NavItem { path: string; label: string; icon: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TitleCasePipe],
  template: `
    <nav class="sidebar">
      <div class="logo">
        <span class="logo-icon">◆</span>
        <span class="logo-text">BTrader</span>
      </div>

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

      <div class="bot-status-indicator" [class]="'status-' + bot.status()">
        <span class="status-dot"></span>
        <span class="status-label">Bot: {{ bot.status() | titlecase }}</span>
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
      padding: 20px 0;
      flex-shrink: 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .logo-icon { font-size: 22px; color: var(--blue); }
    .logo-text { font-size: 18px; font-weight: 700; color: var(--text-primary); }
    .nav-list { list-style: none; padding: 0; margin: 0; flex: 1; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
    .nav-item.active {
      color: var(--blue);
      background: rgba(59,130,246,0.08);
      border-left-color: var(--blue);
    }
    .nav-icon { font-size: 16px; width: 20px; text-align: center; }
    .bot-status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      margin-top: auto;
      font-size: 12px;
      color: var(--text-muted);
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .status-running .status-dot { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .status-error .status-dot { background: var(--red); }
    .status-running .status-label { color: var(--green); }
  `]
})
export class SidebarComponent {
  navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: '▦' },
    { path: '/chart', label: 'Live Chart', icon: '📈' },
    { path: '/bot', label: 'Bot Config', icon: '⚡' },
    { path: '/trades', label: 'Trade History', icon: '📋' },
    { path: '/settings', label: 'Settings', icon: '⚙' },
  ];

  constructor(readonly bot: BotSchedulerService) {}
}
