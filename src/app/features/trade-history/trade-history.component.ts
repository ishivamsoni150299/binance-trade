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
        <div>
          <h1>Trade History</h1>
          <div class="subtitle">{{ tradeStore.stats().totalTrades }} total trades</div>
        </div>
        <button class="btn btn-outline" (click)="tradeStore.exportCsv()">⬇ Export CSV</button>
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-label">Total Trades</span>
          <span class="stat-val">{{ tradeStore.stats().totalTrades }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Win Rate</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().winRate >= 50" [class.negative]="tradeStore.stats().winRate < 50 && tradeStore.stats().totalTrades > 0">
            {{ tradeStore.stats().winRate.toFixed(1) }}%
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Total P&L</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().totalPnl > 0" [class.negative]="tradeStore.stats().totalPnl < 0">
            {{ tradeStore.stats().totalPnl >= 0 ? '+' : '' }}\${{ tradeStore.stats().totalPnl.toFixed(2) }}
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Avg P&L %</span>
          <span class="stat-val" [class.positive]="tradeStore.stats().avgPnlPct > 0" [class.negative]="tradeStore.stats().avgPnlPct < 0">
            {{ tradeStore.stats().avgPnlPct >= 0 ? '+' : '' }}{{ tradeStore.stats().avgPnlPct.toFixed(2) }}%
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Profit Factor</span>
          <span class="stat-val" [class.positive]="profitFactor() >= 1.5" [class.negative]="profitFactor() < 1">
            {{ profitFactor() === Infinity ? '∞' : profitFactor().toFixed(2) }}
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Max Drawdown</span>
          <span class="stat-val negative">\${{ maxDrawdown().toFixed(2) }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Open</span>
          <span class="stat-val">{{ tradeStore.openTrades().length }}</span>
        </div>
      </div>

      <!-- Equity curve SVG -->
      @if (equityCurve().length > 1) {
        <div class="equity-section">
          <div class="equity-header">
            <span class="equity-title">Equity Curve</span>
            <span class="equity-final" [class.positive]="equityCurve()[equityCurve().length-1].cumulative >= 0"
              [class.negative]="equityCurve()[equityCurve().length-1].cumulative < 0">
              \${{ equityCurve()[equityCurve().length-1].cumulative.toFixed(2) }}
            </span>
          </div>
          <div class="equity-chart">
            <svg [attr.viewBox]="'0 0 ' + equityWidth + ' ' + equityHeight" preserveAspectRatio="none" class="equity-svg">
              <!-- Zero line -->
              <line x1="0" [attr.y1]="zeroY()" [attr.x2]="equityWidth" [attr.y2]="zeroY()"
                stroke="rgba(148,163,184,0.2)" stroke-width="1" stroke-dasharray="4,4"/>
              <!-- Fill area -->
              <path [attr.d]="equityAreaPath()" fill="rgba(59,130,246,0.08)"/>
              <!-- Line -->
              <polyline [attr.points]="equityPoints()" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linejoin="round"/>
              <!-- Last dot -->
              @if (equityCurve().length > 0) {
                <circle [attr.cx]="lastDotX()" [attr.cy]="lastDotY()"
                  r="3" [attr.fill]="equityCurve()[equityCurve().length-1].cumulative >= 0 ? 'var(--green)' : 'var(--red)'"/>
              }
            </svg>
          </div>
        </div>
      }

      <!-- Filter + Table -->
      <div class="table-section">
        <div class="filter-row">
          @for (f of filters; track f.value) {
            <button class="filter-btn" [class.active]="filter() === f.value" (click)="filter.set(f.value)">
              {{ f.label }}
              @if (filterCount(f.value) > 0) {
                <span class="filter-count">{{ filterCount(f.value) }}</span>
              }
            </button>
          }
        </div>

        @if (tradeStore.loading()) {
          <div class="loading-state">
            @for (i of [1,2,3]; track i) {
              <div class="skeleton" style="height:44px;border-radius:6px;margin-bottom:4px"></div>
            }
          </div>
        } @else if (filteredTrades().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <p>No trades yet.</p>
            <span>Start the bot in paper mode to begin trading.</span>
          </div>
        } @else {
          <div class="table-wrapper">
            <table class="trades-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Side</th>
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
                  <tr>
                    <td class="td-pair">{{ t.pair }}</td>
                    <td><span class="badge" [class]="'side-' + t.side.toLowerCase()">{{ t.side }}</span></td>
                    <td class="td-num">\${{ t.entryPrice.toLocaleString('en-US',{minimumFractionDigits:2}) }}</td>
                    <td class="td-num">{{ t.exitPrice ? '$' + t.exitPrice.toLocaleString('en-US',{minimumFractionDigits:2}) : '—' }}</td>
                    <td class="td-muted">{{ t.quantity.toFixed(5) }}</td>
                    <td class="td-num" [class.positive]="(t.pnl ?? 0) > 0" [class.negative]="(t.pnl ?? 0) < 0">
                      {{ t.pnl != null ? (t.pnl >= 0 ? '+$' : '-$') + Math.abs(t.pnl).toFixed(2) : '—' }}
                    </td>
                    <td class="td-num" [class.positive]="(t.pnlPct ?? 0) > 0" [class.negative]="(t.pnlPct ?? 0) < 0">
                      {{ t.pnlPct != null ? (t.pnlPct >= 0 ? '+' : '') + t.pnlPct.toFixed(2) + '%' : '—' }}
                    </td>
                    <td><span class="badge" [class]="'status-' + t.status">{{ t.status }}</span></td>
                    <td><span class="badge" [class]="t.isPaper ? 'mode-paper' : 'mode-live'">{{ t.isPaper ? 'PAPER' : 'LIVE' }}</span></td>
                    <td class="td-muted">{{ t.openedAt | date:'MM/dd HH:mm' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; animation: fadeIn 0.25s ease-out; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .btn { padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-outline { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); }
    .btn-outline:hover { background: var(--bg-hover); color: var(--text-primary); }

    /* Stats row */
    .stats-row {
      display: flex; align-items: stretch;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; margin-bottom: 20px; overflow: hidden;
    }
    .stat-item { flex: 1; padding: 16px 12px; text-align: center; }
    .stat-divider { width: 1px; background: var(--border); }
    .stat-label { display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; font-weight: 600; }
    .stat-val { font-size: 18px; font-weight: 700; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }

    /* Equity */
    .equity-section { margin-bottom: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .equity-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .equity-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .equity-final { font-size: 16px; font-weight: 700; }
    .equity-chart { height: 100px; }
    .equity-svg { width: 100%; height: 100%; }

    /* Table section */
    .filter-row { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
    .filter-btn {
      padding: 5px 14px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
      font-size: 12px; display: flex; align-items: center; gap: 5px; transition: all 0.15s;
    }
    .filter-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
    .filter-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .filter-count {
      background: rgba(255,255,255,0.2); border-radius: 10px;
      padding: 0px 5px; font-size: 10px; font-weight: 700;
    }
    .loading-state { padding: 8px 0; }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .empty-icon { font-size: 48px; display: block; margin-bottom: 12px; }
    .empty-state p { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: var(--text-secondary); }
    .empty-state span { font-size: 13px; }
    .table-wrapper { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
    .trades-table { width: 100%; border-collapse: collapse; background: var(--bg-card); }
    th {
      padding: 10px 14px; text-align: left; font-size: 10px; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.07em; border-bottom: 1px solid var(--border);
      background: var(--bg-secondary); font-weight: 700; white-space: nowrap;
    }
    td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg-hover); }
    .td-pair { font-weight: 700; }
    .td-num { font-variant-numeric: tabular-nums; }
    .td-muted { color: var(--text-secondary); font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .side-buy { background: rgba(38,166,154,0.15); color: var(--green); }
    .side-sell { background: rgba(239,83,80,0.15); color: var(--red); }
    .status-open { background: rgba(59,130,246,0.12); color: var(--blue); }
    .status-closed { background: rgba(100,116,139,0.1); color: var(--text-muted); }
    .mode-paper { background: rgba(245,158,11,0.1); color: var(--yellow); }
    .mode-live { background: rgba(139,92,246,0.1); color: var(--purple); }
  `]
})
export class TradeHistoryComponent implements OnInit {
  filter = signal<string>('all');
  equityWidth = 600;
  equityHeight = 100;
  readonly Math = Math;
  readonly Infinity = Infinity;

  filters = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'paper', label: 'Paper' },
    { value: 'live', label: 'Live' },
  ];

  readonly filteredTrades = computed(() => {
    const f = this.filter(), trades = this.tradeStore.trades();
    if (f === 'open')   return trades.filter(t => t.status === 'open');
    if (f === 'closed') return trades.filter(t => t.status === 'closed');
    if (f === 'paper')  return trades.filter(t => t.isPaper);
    if (f === 'live')   return trades.filter(t => !t.isPaper);
    return trades;
  });

  filterCount(f: string): number {
    const trades = this.tradeStore.trades();
    if (f === 'all') return trades.length;
    if (f === 'open')   return trades.filter(t => t.status === 'open').length;
    if (f === 'closed') return trades.filter(t => t.status === 'closed').length;
    if (f === 'paper')  return trades.filter(t => t.isPaper).length;
    if (f === 'live')   return trades.filter(t => !t.isPaper).length;
    return 0;
  }

  readonly equityCurve = computed(() => {
    const closed = this.tradeStore.closedTrades().slice().reverse();
    if (closed.length < 2) return [];
    let cum = 0;
    return closed.map(t => { cum += (t.pnl ?? 0); return { pnl: t.pnl ?? 0, cumulative: cum }; });
  });

  readonly profitFactor = computed(() => {
    const closed = this.tradeStore.closedTrades();
    const wins  = closed.filter(t => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
    const losses = Math.abs(closed.filter(t => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0));
    return losses === 0 ? (wins > 0 ? Infinity : 0) : wins / losses;
  });

  readonly maxDrawdown = computed(() => {
    const curve = this.equityCurve();
    if (!curve.length) return 0;
    let peak = curve[0].cumulative, dd = 0;
    for (const p of curve) {
      if (p.cumulative > peak) peak = p.cumulative;
      const drawdown = peak - p.cumulative;
      if (drawdown > dd) dd = drawdown;
    }
    return dd;
  });

  equityPoints(): string {
    const pts = this.equityCurve();
    if (!pts.length) return '';
    const vals = pts.map(p => p.cumulative);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * this.equityWidth;
      const y = this.equityHeight - ((p.cumulative - min) / range) * (this.equityHeight - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  equityAreaPath(): string {
    const pts = this.equityCurve();
    if (!pts.length) return '';
    const vals = pts.map(p => p.cumulative);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const points = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * this.equityWidth;
      const y = this.equityHeight - ((p.cumulative - min) / range) * (this.equityHeight - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points[0]} ${points.slice(1).map(p => 'L ' + p).join(' ')} L ${this.equityWidth},${this.equityHeight} L 0,${this.equityHeight} Z`;
  }

  zeroY(): number {
    const pts = this.equityCurve();
    if (!pts.length) return this.equityHeight / 2;
    const vals = pts.map(p => p.cumulative);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    return this.equityHeight - ((0 - min) / range) * (this.equityHeight - 10) - 5;
  }

  lastDotX(): number {
    return this.equityWidth;
  }

  lastDotY(): number {
    const pts = this.equityCurve();
    if (!pts.length) return this.equityHeight / 2;
    const vals = pts.map(p => p.cumulative);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const last = pts[pts.length - 1].cumulative;
    return this.equityHeight - ((last - min) / range) * (this.equityHeight - 10) - 5;
  }

  constructor(readonly tradeStore: TradeStoreService) {}

  async ngOnInit(): Promise<void> {
    await this.tradeStore.init();
  }
}
