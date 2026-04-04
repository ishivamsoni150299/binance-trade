import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TradeStoreService } from '../../core/services/trade-store.service';
import { Trade } from '../../core/models/types';

@Component({
  selector: 'app-trade-history',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Trade History</h1>
        <div class="header-actions">
          <button class="btn btn-outline" (click)="tradeStore.exportCsv()">⬇ Export CSV</button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat">
          <span class="stat-label">Total Trades</span>
          <span class="stat-val">{{ tradeStore.stats().totalTrades }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Win Rate</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().winRate > 50">{{ tradeStore.stats().winRate.toFixed(1) }}%</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total P&L</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().totalPnl > 0" [class.negative]="tradeStore.stats().totalPnl < 0">
            \${{ tradeStore.stats().totalPnl.toFixed(2) }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Avg P&L %</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().avgPnlPct > 0" [class.negative]="tradeStore.stats().avgPnlPct < 0">
            {{ tradeStore.stats().avgPnlPct.toFixed(2) }}%
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Open Positions</span>
          <span class="stat-val">{{ tradeStore.openTrades().length }}</span>
        </div>
      </div>

      <!-- Equity curve (simple bars) -->
      @if (equityCurve().length > 1) {
        <div class="equity-section">
          <h2>Equity Curve</h2>
          <div class="equity-chart">
            @for (point of equityCurve(); track $index) {
              <div class="equity-bar" [style.height.%]="point.height" [class.positive]="point.value >= 0" [class.negative]="point.value < 0"
                [title]="'$' + point.cumulative.toFixed(2)"></div>
            }
          </div>
        </div>
      }

      <!-- Filter -->
      <div class="filter-row">
        <button class="filter-btn" [class.active]="filter() === 'all'" (click)="filter.set('all')">All</button>
        <button class="filter-btn" [class.active]="filter() === 'open'" (click)="filter.set('open')">Open</button>
        <button class="filter-btn" [class.active]="filter() === 'closed'" (click)="filter.set('closed')">Closed</button>
        <button class="filter-btn" [class.active]="filter() === 'paper'" (click)="filter.set('paper')">Paper</button>
        <button class="filter-btn" [class.active]="filter() === 'live'" (click)="filter.set('live')">Live</button>
      </div>

      <!-- Trade table -->
      @if (tradeStore.loading()) {
        <div class="loading">Loading trades...</div>
      } @else if (filteredTrades().length === 0) {
        <div class="empty">
          <span class="empty-icon">📊</span>
          <p>No trades yet. Start the bot in paper mode to begin.</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="trades-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Side</th>
                <th>Strategy</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Qty</th>
                <th>P&L</th>
                <th>P&L %</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              @for (t of filteredTrades(); track t.id) {
                <tr [class]="t.status">
                  <td class="td-pair">{{ t.pair }}</td>
                  <td>
                    <span class="badge" [class]="'side-' + t.side.toLowerCase()">{{ t.side }}</span>
                  </td>
                  <td class="td-strategy">{{ t.strategy }}</td>
                  <td>\${{ t.entryPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) }}</td>
                  <td>{{ t.exitPrice ? '$' + t.exitPrice.toLocaleString('en-US', {minimumFractionDigits: 2}) : '—' }}</td>
                  <td>{{ t.quantity.toFixed(5) }}</td>
                  <td [class.positive]="(t.pnl ?? 0) > 0" [class.negative]="(t.pnl ?? 0) < 0">
                    {{ t.pnl != null ? (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) : '—' }}
                  </td>
                  <td [class.positive]="(t.pnlPct ?? 0) > 0" [class.negative]="(t.pnlPct ?? 0) < 0">
                    {{ t.pnlPct != null ? (t.pnlPct >= 0 ? '+' : '') + t.pnlPct.toFixed(2) + '%' : '—' }}
                  </td>
                  <td>
                    <span class="badge" [class]="'status-' + t.status">{{ t.status }}</span>
                  </td>
                  <td>
                    <span class="badge" [class]="t.isPaper ? 'mode-paper' : 'mode-live'">{{ t.isPaper ? 'PAPER' : 'LIVE' }}</span>
                  </td>
                  <td class="td-date">{{ t.openedAt | date:'MM/dd HH:mm' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 24px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0; }
    .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-outline { background: var(--bg-card); color: var(--text-secondary); }
    .btn-outline:hover { background: var(--bg-hover); }
    .stats-row {
      display: flex; gap: 0; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; margin-bottom: 20px; overflow: hidden;
    }
    .stat { flex: 1; padding: 16px; border-right: 1px solid var(--border); text-align: center; }
    .stat:last-child { border-right: none; }
    .stat-label { display: block; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .stat-val { font-size: 20px; font-weight: 700; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .equity-section { margin-bottom: 20px; }
    .equity-section h2 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary); }
    .equity-chart {
      height: 80px; display: flex; align-items: flex-end; gap: 2px;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 8px;
    }
    .equity-bar { flex: 1; border-radius: 2px; min-height: 2px; transition: height 0.3s; }
    .equity-bar.positive { background: var(--green); }
    .equity-bar.negative { background: var(--red); }
    .filter-row { display: flex; gap: 6px; margin-bottom: 16px; }
    .filter-btn {
      padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 12px;
    }
    .filter-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .loading, .empty { text-align: center; padding: 60px; color: var(--text-muted); }
    .empty-icon { font-size: 48px; display: block; margin-bottom: 12px; }
    .table-wrapper { overflow-x: auto; }
    .trades-table {
      width: 100%; border-collapse: collapse;
      background: var(--bg-card); border-radius: 10px; overflow: hidden;
    }
    th {
      padding: 10px 14px; text-align: left; font-size: 11px; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }
    td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg-hover); }
    .td-pair { font-weight: 600; }
    .td-strategy { color: var(--text-secondary); font-size: 12px; }
    .td-date { color: var(--text-muted); font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 700; }
    .side-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .side-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .status-open { background: rgba(59,130,246,0.1); color: var(--blue); }
    .status-closed { background: rgba(100,116,139,0.1); color: var(--text-muted); }
    .mode-paper { background: rgba(245,158,11,0.1); color: var(--yellow); }
    .mode-live { background: rgba(239,83,80,0.1); color: var(--red); }
  `]
})
export class TradeHistoryComponent implements OnInit {
  filter = signal<string>('all');

  readonly filteredTrades = computed(() => {
    const f = this.filter();
    const trades = this.tradeStore.trades();
    if (f === 'all') return trades;
    if (f === 'open') return trades.filter(t => t.status === 'open');
    if (f === 'closed') return trades.filter(t => t.status === 'closed');
    if (f === 'paper') return trades.filter(t => t.isPaper);
    if (f === 'live') return trades.filter(t => !t.isPaper);
    return trades;
  });

  readonly equityCurve = computed(() => {
    const closed = this.tradeStore.closedTrades().slice().reverse();
    if (closed.length < 2) return [];
    const pnls = closed.map(t => t.pnl ?? 0);
    const max = Math.max(...pnls.map(Math.abs), 0.01);
    let cum = 0;
    return pnls.map(pnl => {
      cum += pnl;
      return { value: pnl, height: (Math.abs(pnl) / max) * 100, cumulative: cum };
    });
  });

  constructor(readonly tradeStore: TradeStoreService) {}

  async ngOnInit(): Promise<void> {
    await this.tradeStore.init();
  }
}
