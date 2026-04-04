import { Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="stat-card card-hover">
      <div class="stat-header">
        <span class="stat-label">{{ label() }}</span>
        @if (trend() !== 0) {
          <span class="trend-arrow" [class.trend-up]="trend()! > 0" [class.trend-down]="trend()! < 0">
            {{ trend()! > 0 ? '↑' : '↓' }}
          </span>
        }
      </div>
      <div class="stat-value" [class.positive]="isPositive()" [class.negative]="isNegative()">
        {{ value() }}
      </div>
      @if (sub()) {
        <div class="stat-sub">{{ sub() }}</div>
      }
    </div>
  `,
  styles: [`
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
    }
    .stat-card:hover {
      border-color: var(--border-light);
      transform: translateY(-1px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .stat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; }
    .trend-arrow { font-size: 14px; font-weight: 700; }
    .trend-up { color: var(--green); }
    .trend-down { color: var(--red); }
    .stat-value { font-size: 26px; font-weight: 700; color: var(--text-primary); line-height: 1; }
    .stat-value.positive { color: var(--green); }
    .stat-value.negative { color: var(--red); }
    .stat-sub { font-size: 12px; color: var(--text-secondary); margin-top: 6px; }
  `]
})
export class StatCardComponent {
  label = input.required<string>();
  value = input.required<string>();
  sub = input<string>('');
  isPositive = input<boolean>(false);
  isNegative = input<boolean>(false);
  trend = input<number>(0);
}
