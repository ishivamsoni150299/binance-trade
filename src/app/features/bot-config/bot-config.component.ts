import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { StrategyType, Timeframe } from '../../core/models/types';

@Component({
  selector: 'app-bot-config',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Bot Configuration</h1>
        <div class="bot-toggle">
          <span class="status-label" [class]="'s-' + bot.status()">{{ bot.status() }}</span>
          <button class="toggle-btn" [class.running]="bot.status() === 'running'" (click)="toggleBot()">
            {{ bot.status() === 'running' ? '⏹ Stop' : '▶ Start' }}
          </button>
        </div>
      </div>

      @if (bot.lastError()) {
        <div class="error-banner">⚠ {{ bot.lastError() }}</div>
      }

      <div class="config-grid">
        <!-- Trading pair & timeframe -->
        <div class="config-section">
          <h2>Market</h2>
          <div class="form-row">
            <label>Trading Pair</label>
            <select [ngModel]="cfg().pair" (ngModelChange)="onPairChange($event)">
              @for (pair of pairs; track pair) {
                <option [value]="pair">{{ pair }}</option>
              }
            </select>
          </div>
          <div class="form-row">
            <label>Timeframe</label>
            <div class="btn-group">
              @for (tf of timeframes; track tf) {
                <button [class.active]="cfg().timeframe === tf" (click)="onTimeframeChange(tf)">{{ tf }}</button>
              }
            </div>
          </div>
          <div class="form-row">
            <label>Strategy</label>
            <div class="btn-group">
              @for (s of strategies; track s) {
                <button [class.active]="cfg().strategy === s" (click)="onStrategyChange(s)" [title]="strategyDesc[s]">{{ s }}</button>
              }
            </div>
          </div>
        </div>

        <!-- Strategy params -->
        <div class="config-section">
          <h2>Strategy Parameters</h2>
          <div class="form-row">
            <label>RSI Period <span class="value">{{ cfg().strategyParams.rsiPeriod }}</span></label>
            <input type="range" min="5" max="30" step="1" [ngModel]="cfg().strategyParams.rsiPeriod"
              (ngModelChange)="config.updateStrategy({rsiPeriod: +$event})">
          </div>
          <div class="form-row">
            <label>RSI Oversold <span class="value">{{ cfg().strategyParams.rsiOversold }}</span></label>
            <input type="range" min="10" max="40" step="1" [ngModel]="cfg().strategyParams.rsiOversold"
              (ngModelChange)="config.updateStrategy({rsiOversold: +$event})">
          </div>
          <div class="form-row">
            <label>RSI Overbought <span class="value">{{ cfg().strategyParams.rsiOverbought }}</span></label>
            <input type="range" min="60" max="90" step="1" [ngModel]="cfg().strategyParams.rsiOverbought"
              (ngModelChange)="config.updateStrategy({rsiOverbought: +$event})">
          </div>
          <div class="form-row">
            <label>EMA Fast <span class="value">{{ cfg().strategyParams.emaFast }}</span></label>
            <input type="range" min="5" max="20" step="1" [ngModel]="cfg().strategyParams.emaFast"
              (ngModelChange)="config.updateStrategy({emaFast: +$event})">
          </div>
          <div class="form-row">
            <label>EMA Slow <span class="value">{{ cfg().strategyParams.emaSlow }}</span></label>
            <input type="range" min="15" max="50" step="1" [ngModel]="cfg().strategyParams.emaSlow"
              (ngModelChange)="config.updateStrategy({emaSlow: +$event})">
          </div>
          <div class="form-row">
            <label>BB Period <span class="value">{{ cfg().strategyParams.bbPeriod }}</span></label>
            <input type="range" min="10" max="50" step="1" [ngModel]="cfg().strategyParams.bbPeriod"
              (ngModelChange)="config.updateStrategy({bbPeriod: +$event})">
          </div>
        </div>

        <!-- Risk management -->
        <div class="config-section">
          <h2>Risk Management</h2>
          <div class="form-row">
            <label>Position Size <span class="value">{{ cfg().riskParams.positionSizePct }}%</span></label>
            <input type="range" min="1" max="20" step="0.5" [ngModel]="cfg().riskParams.positionSizePct"
              (ngModelChange)="config.updateRisk({positionSizePct: +$event})">
          </div>
          <div class="form-row">
            <label>Stop Loss <span class="value">{{ cfg().riskParams.stopLossPct }}%</span></label>
            <input type="range" min="0.5" max="10" step="0.5" [ngModel]="cfg().riskParams.stopLossPct"
              (ngModelChange)="config.updateRisk({stopLossPct: +$event})">
          </div>
          <div class="form-row">
            <label>Take Profit <span class="value">{{ cfg().riskParams.takeProfitPct }}%</span></label>
            <input type="range" min="1" max="20" step="0.5" [ngModel]="cfg().riskParams.takeProfitPct"
              (ngModelChange)="config.updateRisk({takeProfitPct: +$event})">
          </div>
          <div class="form-row">
            <label>Max Daily Loss <span class="value">{{ cfg().riskParams.maxDailyLossPct }}%</span></label>
            <input type="range" min="1" max="20" step="1" [ngModel]="cfg().riskParams.maxDailyLossPct"
              (ngModelChange)="config.updateRisk({maxDailyLossPct: +$event})">
          </div>
          <div class="risk-summary">
            <div class="risk-row">
              <span>Risk/Reward Ratio</span>
              <span class="risk-value">1 : {{ (cfg().riskParams.takeProfitPct / cfg().riskParams.stopLossPct).toFixed(1) }}</span>
            </div>
          </div>
        </div>

        <!-- Paper / Live toggle -->
        <div class="config-section mode-section">
          <h2>Trading Mode</h2>
          <div class="mode-toggle">
            <button [class.active]="cfg().riskParams.paperTrading" (click)="config.updateRisk({paperTrading: true})">
              📝 Paper Trading
            </button>
            <button [class.active]="!cfg().riskParams.paperTrading" (click)="setLive()" class="live-btn">
              ⚡ Live Trading
            </button>
          </div>
          <p class="mode-hint">
            {{ cfg().riskParams.paperTrading
              ? 'Paper mode: trades are simulated, no real orders placed.'
              : '⚠ Live mode: REAL money will be used. Ensure your Binance API key is set in Vercel.' }}
          </p>
        </div>
      </div>

      <div class="config-actions">
        <button class="btn btn-danger" (click)="resetConfig()">Reset to Defaults</button>
        <span class="save-hint">✓ Settings saved automatically</span>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1000px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0; }
    .bot-toggle { display: flex; align-items: center; gap: 12px; }
    .status-label { font-size: 12px; text-transform: uppercase; font-weight: 600; }
    .s-running { color: var(--green); }
    .s-stopped { color: var(--text-muted); }
    .s-error { color: var(--red); }
    .toggle-btn {
      padding: 8px 18px; border-radius: 6px; border: none; cursor: pointer;
      background: var(--blue); color: white; font-weight: 600; font-size: 13px;
    }
    .toggle-btn.running { background: var(--red); }
    .error-banner {
      background: rgba(239,83,80,0.1); border: 1px solid var(--red);
      border-radius: 6px; padding: 10px 16px; color: var(--red); margin-bottom: 16px;
    }
    .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .config-section {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 20px;
    }
    .config-section h2 { font-size: 14px; font-weight: 600; margin: 0 0 16px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .form-row { margin-bottom: 14px; }
    .form-row label { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
    .value { color: var(--text-primary); font-weight: 600; }
    input[type=range] { width: 100%; accent-color: var(--blue); }
    select {
      width: 100%; background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 6px; padding: 8px 10px; color: var(--text-primary); font-size: 13px;
    }
    .btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
    .btn-group button {
      padding: 5px 10px; background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 12px;
    }
    .btn-group button.active { background: var(--blue); color: white; border-color: var(--blue); }
    .risk-summary { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; }
    .risk-row { display: flex; justify-content: space-between; font-size: 13px; }
    .risk-value { font-weight: 600; color: var(--green); }
    .mode-section { grid-column: span 2; }
    .mode-toggle { display: flex; gap: 12px; margin-bottom: 12px; }
    .mode-toggle button {
      flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: 8px;
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .mode-toggle button.active { border-color: var(--blue); color: var(--blue); background: rgba(59,130,246,0.08); }
    .live-btn.active { border-color: var(--red); color: var(--red); background: rgba(239,83,80,0.08); }
    .mode-hint { font-size: 12px; color: var(--text-muted); margin: 0; }
    .config-actions { display: flex; align-items: center; gap: 16px; margin-top: 20px; }
    .btn { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-danger { background: rgba(239,83,80,0.1); color: var(--red); border: 1px solid var(--red); }
    .save-hint { color: var(--green); font-size: 12px; }
    @media (max-width: 768px) { .config-grid { grid-template-columns: 1fr; } .mode-section { grid-column: auto; } }
  `]
})
export class BotConfigComponent {
  pairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT'];
  timeframes: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  strategies: StrategyType[] = ['RSI', 'MACD', 'BOLLINGER', 'EMA', 'COMPOSITE'];
  strategyDesc: Record<StrategyType, string> = {
    RSI: 'Buy oversold, sell overbought',
    MACD: 'Buy/sell on MACD crossover',
    BOLLINGER: 'Trade at band extremes',
    EMA: 'Buy/sell on EMA crossover',
    COMPOSITE: 'Weighted score of all indicators (recommended)',
  };

  constructor(
    readonly config: ConfigService,
    readonly bot: BotSchedulerService,
  ) {}

  get cfg() { return this.config.config; }

  toggleBot(): void {
    if (this.bot.status() === 'running') this.bot.stop();
    else this.bot.start();
  }

  onPairChange(pair: string): void { this.config.update({ pair }); }
  onTimeframeChange(tf: string): void { this.config.update({ timeframe: tf as Timeframe }); }
  onStrategyChange(s: StrategyType): void { this.config.update({ strategy: s }); }

  setLive(): void {
    if (confirm('Switch to LIVE trading? This will place REAL orders on Binance. Make sure your API key is set in Vercel environment variables.')) {
      this.config.updateRisk({ paperTrading: false });
    }
  }

  resetConfig(): void {
    if (confirm('Reset all settings to defaults?')) this.config.reset();
  }
}
