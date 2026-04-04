import { Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">{{ icon() }}</span>
        <span class="stat-label">{{ label() }}</span>
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
      border-radius: 10px;
      padding: 16px;
    }
    .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .stat-icon { font-size: 18px; }
    .stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); }
    .stat-value.positive { color: var(--green); }
    .stat-value.negative { color: var(--red); }
    .stat-sub { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
  `]
})
export class StatCardComponent {
  icon = input<string>('📊');
  label = input.required<string>();
  value = input.required<string>();
  sub = input<string>('');
  isPositive = input<boolean>(false);
  isNegative = input<boolean>(false);
}
