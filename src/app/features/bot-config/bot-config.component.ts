import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { ConfigService } from '../../core/services/config.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';
import { StrategyType, Timeframe, RiskParams, DEFAULT_RISK_PARAMS, TRUSTED_PAIRS } from '../../core/models/types';

@Component({
  selector: 'app-bot-config',
  standalone: true,
  imports: [FormsModule, TitleCasePipe],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Bot Configuration</h1>
          <div class="subtitle">Settings are saved automatically</div>
        </div>
        <div class="bot-controls">
          <div class="bot-status-chip" [class]="'chip-' + bot.status()">
            <span class="chip-dot"></span>
            {{ bot.status() | titlecase }}
            @if (bot.cycleCount() > 0) { - {{ bot.cycleCount() }} cycles }
          </div>
          <button class="toggle-btn" [class.btn-stop]="bot.status() === 'running'" (click)="toggleBot()">
            {{ bot.status() === 'running' ? 'Stop Bot' : 'Start Bot' }}
          </button>
        </div>
      </div>

      @if (bot.lastError()) {
        <div class="error-banner">{{ bot.lastError() }}</div>
      }

      <div class="config-layout">

        <!-- LEFT: Market + Strategy selector -->
        <div class="config-col">

          <!-- Market -->
          <div class="card">
            <div class="card-title">Market</div>
            <div class="form-row">
              <label>Trading Pair</label>
              <select [ngModel]="cfg().pair" (ngModelChange)="config.update({pair: $event})">
                @for (pair of pairs; track pair) {
                  <option [value]="pair">{{ pair }}</option>
                }
              </select>
            </div>
            <div class="form-row">
              <label>Auto Pick Best Pair</label>
              <div class="trust-row">
                <button class="trust-toggle" [class.active]="cfg().scanEnabled" (click)="toggleScan()">
                  {{ cfg().scanEnabled ? 'On' : 'Off' }}
                </button>
                <span class="trust-sub">Uses trusted pairs with top momentum and volume</span>
              </div>
            </div>
            <div class="form-row">
              <label>Trusted Only</label>
              <div class="trust-row">
                <button class="trust-toggle" [class.active]="cfg().trustedOnly" (click)="toggleTrustedOnly()">
                  {{ cfg().trustedOnly ? 'On' : 'Off' }}
                </button>
                <span class="trust-sub">Limit trades to trusted pairs only</span>
              </div>
            </div>
            <div class="form-row">
              <label>Trusted Pairs</label>
              <div class="trust-grid">
                @for (pair of pairs; track pair) {
                  <button class="trust-chip" [class.active]="isTrusted(pair)" (click)="toggleTrustedPair(pair)">
                    {{ pair }}
                  </button>
                }
              </div>
              <div class="trust-hint">Select the pairs you trust for automated trading.</div>
            </div>
            <div class="form-row">
              <label>Timeframe</label>
              <div class="btn-group">
                @for (tf of timeframes; track tf) {
                  <button [class.active]="cfg().timeframe === tf" (click)="config.update({timeframe: tf})">{{ tf }}</button>
                }
              </div>
            </div>
          </div>

          <!-- Strategy selector -->
          <div class="card">
            <div class="card-title">Strategy</div>
            <div class="strategy-cards">
              @for (s of strategies; track s) {
                <div class="strategy-card" [class.selected]="cfg().strategy === s" (click)="config.update({strategy: s})">
                  <div class="sc-icon">{{ strategyIcon[s] }}</div>
                  <div class="sc-name">{{ s }}</div>
                  <div class="sc-desc">{{ strategyDesc[s] }}</div>
                  @if (cfg().strategy === s) {
                    <div class="sc-check">OK</div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Trading mode -->
          <div class="card">
            <div class="card-title">Trading Mode</div>
            <div class="mode-toggle">
              <button [class.active]="cfg().riskParams.paperTrading" (click)="config.updateRisk({paperTrading: true})">
                <div>
                  <div class="mode-name">Paper</div>
                  <div class="mode-sub">Simulated trades</div>
                </div>
              </button>
              <button [class.active]="!cfg().riskParams.paperTrading" [class.live-active]="!cfg().riskParams.paperTrading" (click)="setLive()">
                <div>
                  <div class="mode-name">Live</div>
                  <div class="mode-sub">Real orders</div>
                </div>
              </button>
            </div>
            @if (!cfg().riskParams.paperTrading) {
              <div class="live-warning">Live mode: real money at risk. Ensure API keys are set in Vercel.</div>
            }
          </div>

        </div>

        <!-- RIGHT: Parameters -->
        <div class="config-col">

          <!-- Strategy params -->
          <div class="card">
            <div class="card-title">Strategy Parameters</div>
            <div class="slider-row">
              <div class="slider-label">
                <span>RSI Period</span>
                <span class="slider-val">{{ cfg().strategyParams.rsiPeriod }}</span>
              </div>
              <input type="range" min="5" max="30" step="1" class="slider"
                [ngModel]="cfg().strategyParams.rsiPeriod"
                (ngModelChange)="config.updateStrategy({rsiPeriod: +$event})">
              <div class="slider-bounds"><span>5</span><span>30</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>RSI Oversold</span>
                <span class="slider-val green">{{ cfg().strategyParams.rsiOversold }}</span>
              </div>
              <input type="range" min="10" max="40" step="1" class="slider green-slider"
                [ngModel]="cfg().strategyParams.rsiOversold"
                (ngModelChange)="config.updateStrategy({rsiOversold: +$event})">
              <div class="slider-bounds"><span>10</span><span>40</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>RSI Overbought</span>
                <span class="slider-val red">{{ cfg().strategyParams.rsiOverbought }}</span>
              </div>
              <input type="range" min="60" max="90" step="1" class="slider red-slider"
                [ngModel]="cfg().strategyParams.rsiOverbought"
                (ngModelChange)="config.updateStrategy({rsiOverbought: +$event})">
              <div class="slider-bounds"><span>60</span><span>90</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>EMA Fast</span>
                <span class="slider-val">{{ cfg().strategyParams.emaFast }}</span>
              </div>
              <input type="range" min="5" max="20" step="1" class="slider"
                [ngModel]="cfg().strategyParams.emaFast"
                (ngModelChange)="config.updateStrategy({emaFast: +$event})">
              <div class="slider-bounds"><span>5</span><span>20</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>EMA Slow</span>
                <span class="slider-val">{{ cfg().strategyParams.emaSlow }}</span>
              </div>
              <input type="range" min="15" max="50" step="1" class="slider"
                [ngModel]="cfg().strategyParams.emaSlow"
                (ngModelChange)="config.updateStrategy({emaSlow: +$event})">
              <div class="slider-bounds"><span>15</span><span>50</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Bollinger Period</span>
                <span class="slider-val">{{ cfg().strategyParams.bbPeriod }}</span>
              </div>
              <input type="range" min="10" max="50" step="1" class="slider"
                [ngModel]="cfg().strategyParams.bbPeriod"
                (ngModelChange)="config.updateStrategy({bbPeriod: +$event})">
              <div class="slider-bounds"><span>10</span><span>50</span></div>
            </div>

            <div class="section-title">Filters</div>
            <div class="safe-row">
              <div class="safe-left">
                <div class="safe-title">Trend Filter</div>
                <div class="safe-sub">Trade only with trend</div>
              </div>
              <button class="safe-toggle" [class.active]="cfg().strategyParams.useTrendFilter" (click)="toggleTrendFilter()">
                {{ cfg().strategyParams.useTrendFilter ? 'On' : 'Off' }}
              </button>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Trend EMA Fast</span>
                <span class="slider-val">{{ cfg().strategyParams.trendEmaFast }}</span>
              </div>
              <input type="range" min="5" max="50" step="1" class="slider"
                [ngModel]="cfg().strategyParams.trendEmaFast"
                (ngModelChange)="config.updateStrategy({trendEmaFast: +$event})">
              <div class="slider-bounds"><span>5</span><span>50</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Trend EMA Slow</span>
                <span class="slider-val">{{ cfg().strategyParams.trendEmaSlow }}</span>
              </div>
              <input type="range" min="20" max="200" step="5" class="slider"
                [ngModel]="cfg().strategyParams.trendEmaSlow"
                (ngModelChange)="config.updateStrategy({trendEmaSlow: +$event})">
              <div class="slider-bounds"><span>20</span><span>200</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Trend Threshold</span>
                <span class="slider-val">{{ cfg().strategyParams.trendThresholdPct.toFixed(2) }}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" class="slider"
                [ngModel]="cfg().strategyParams.trendThresholdPct"
                (ngModelChange)="config.updateStrategy({trendThresholdPct: +$event})">
              <div class="slider-bounds"><span>0%</span><span>1%</span></div>
            </div>

            <div class="safe-row">
              <div class="safe-left">
                <div class="safe-title">Volatility Filter</div>
                <div class="safe-sub">Avoid flat or extreme moves</div>
              </div>
              <button class="safe-toggle" [class.active]="cfg().strategyParams.useVolatilityFilter" (click)="toggleVolatilityFilter()">
                {{ cfg().strategyParams.useVolatilityFilter ? 'On' : 'Off' }}
              </button>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Volatility Lookback</span>
                <span class="slider-val">{{ cfg().strategyParams.volatilityLookback }}</span>
              </div>
              <input type="range" min="10" max="50" step="1" class="slider"
                [ngModel]="cfg().strategyParams.volatilityLookback"
                (ngModelChange)="config.updateStrategy({volatilityLookback: +$event})">
              <div class="slider-bounds"><span>10</span><span>50</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Min Volatility</span>
                <span class="slider-val">{{ cfg().strategyParams.minVolatilityPct.toFixed(2) }}%</span>
              </div>
              <input type="range" min="0.1" max="3" step="0.1" class="slider"
                [ngModel]="cfg().strategyParams.minVolatilityPct"
                (ngModelChange)="config.updateStrategy({minVolatilityPct: +$event})">
              <div class="slider-bounds"><span>0.1%</span><span>3%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Max Volatility</span>
                <span class="slider-val">{{ cfg().strategyParams.maxVolatilityPct.toFixed(1) }}%</span>
              </div>
              <input type="range" min="3" max="15" step="0.5" class="slider"
                [ngModel]="cfg().strategyParams.maxVolatilityPct"
                (ngModelChange)="config.updateStrategy({maxVolatilityPct: +$event})">
              <div class="slider-bounds"><span>3%</span><span>15%</span></div>
            </div>
          </div>

          <!-- Risk management -->
          <div class="card">
            <div class="card-title">Risk Management</div>

            <div class="safe-row">
              <div class="safe-left">
                <div class="safe-title">Safe Mode</div>
                <div class="safe-sub">Conservative sizing and limits</div>
              </div>
              <button class="safe-toggle" [class.active]="isSafeMode()" (click)="toggleSafeMode()">
                {{ isSafeMode() ? 'On' : 'Off' }}
              </button>
            </div>

            <div class="slider-row">
              <div class="slider-label">
                <span>Position Size</span>
                <span class="slider-val">{{ cfg().riskParams.positionSizePct }}%</span>
              </div>
              <input type="range" min="1" max="20" step="0.5" class="slider"
                [ngModel]="cfg().riskParams.positionSizePct"
                (ngModelChange)="config.updateRisk({positionSizePct: +$event})">
              <div class="slider-bounds"><span>1%</span><span>20%</span></div>
            </div>
            <div class="safe-row">
              <div class="safe-left">
                <div class="safe-title">Dynamic Position Sizing</div>
                <div class="safe-sub">Scale size by signal strength and volatility</div>
              </div>
              <button class="safe-toggle" [class.active]="cfg().riskParams.dynamicPositionSizing" (click)="toggleDynamicSizing()">
                {{ cfg().riskParams.dynamicPositionSizing ? 'On' : 'Off' }}
              </button>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Min Position Size</span>
                <span class="slider-val">{{ cfg().riskParams.minPositionSizePct }}%</span>
              </div>
              <input type="range" min="0.5" max="10" step="0.5" class="slider"
                [ngModel]="cfg().riskParams.minPositionSizePct"
                (ngModelChange)="config.updateRisk({minPositionSizePct: +$event})">
              <div class="slider-bounds"><span>0.5%</span><span>10%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Max Position Size</span>
                <span class="slider-val">{{ cfg().riskParams.maxPositionSizePct }}%</span>
              </div>
              <input type="range" min="2" max="20" step="1" class="slider"
                [ngModel]="cfg().riskParams.maxPositionSizePct"
                (ngModelChange)="config.updateRisk({maxPositionSizePct: +$event})">
              <div class="slider-bounds"><span>2%</span><span>20%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Volatility Target</span>
                <span class="slider-val">{{ cfg().riskParams.volatilityTargetPct.toFixed(1) }}%</span>
              </div>
              <input type="range" min="0.5" max="5" step="0.1" class="slider"
                [ngModel]="cfg().riskParams.volatilityTargetPct"
                (ngModelChange)="config.updateRisk({volatilityTargetPct: +$event})">
              <div class="slider-bounds"><span>0.5%</span><span>5%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Stop Loss</span>
                <span class="slider-val red">{{ cfg().riskParams.stopLossPct }}%</span>
              </div>
              <input type="range" min="0.5" max="10" step="0.5" class="slider red-slider"
                [ngModel]="cfg().riskParams.stopLossPct"
                (ngModelChange)="config.updateRisk({stopLossPct: +$event})">
              <div class="slider-bounds"><span>0.5%</span><span>10%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Take Profit</span>
                <span class="slider-val green">{{ cfg().riskParams.takeProfitPct }}%</span>
              </div>
              <input type="range" min="1" max="20" step="0.5" class="slider green-slider"
                [ngModel]="cfg().riskParams.takeProfitPct"
                (ngModelChange)="config.updateRisk({takeProfitPct: +$event})">
              <div class="slider-bounds"><span>1%</span><span>20%</span></div>
            </div>
            <div class="slider-row">
              <div class="slider-label">
                <span>Max Daily Loss</span>
                <span class="slider-val red">{{ cfg().riskParams.maxDailyLossPct }}%</span>
              </div>
              <input type="range" min="1" max="20" step="1" class="slider red-slider"
                [ngModel]="cfg().riskParams.maxDailyLossPct"
                (ngModelChange)="config.updateRisk({maxDailyLossPct: +$event})">
              <div class="slider-bounds"><span>1%</span><span>20%</span></div>
            </div>

            <!-- Risk/Reward summary -->
            <div class="rr-summary">
              <div class="rr-item">
                <span class="rr-label">Risk / Reward</span>
                <span class="rr-value" [class.rr-good]="rrRatio() >= 2" [class.rr-bad]="rrRatio() < 1.5">
                  1 : {{ rrRatio().toFixed(1) }}
                </span>
              </div>
              <div class="rr-item">
                <span class="rr-label">Break-even Win Rate</span>
                <span class="rr-value">{{ breakEvenWinRate().toFixed(0) }}%</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div class="config-footer">
        <button class="btn-reset" (click)="resetConfig()">Reset to Defaults</button>
        <span class="save-hint">All settings saved automatically to localStorage</span>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1100px; animation: fadeIn 0.25s ease-out; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .bot-controls { display: flex; align-items: center; gap: 10px; }
    .bot-status-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary);
    }
    .chip-running { color: var(--green); border-color: rgba(38,166,154,0.3); background: rgba(38,166,154,0.08); }
    .chip-error { color: var(--red); border-color: rgba(239,83,80,0.3); }
    .chip-dot {
      width: 6px; height: 6px; border-radius: 50%; background: currentColor;
    }
    .chip-running .chip-dot { animation: pulse-green 2s infinite; }
    .toggle-btn {
      padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer;
      background: var(--blue); color: white; font-weight: 600; font-size: 13px; transition: background 0.15s;
    }
    .toggle-btn:hover { background: #2563eb; }
    .btn-stop { background: var(--red); }
    .btn-stop:hover { background: #dc2626; }
    .error-banner {
      background: rgba(239,83,80,0.1); border: 1px solid rgba(239,83,80,0.3);
      border-radius: 8px; padding: 10px 16px; color: var(--red); margin-bottom: 16px; font-size: 13px;
    }
    .config-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .config-col { display: flex; flex-direction: column; gap: 14px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px;
    }
    .card-title {
      font-size: 11px; font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 14px;
    }
    .section-title {
      margin: 14px 0 10px;
      font-size: 11px; font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.07em;
    }
    .safe-row {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;
    }
    .safe-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
    .safe-sub { font-size: 11px; color: var(--text-muted); }
    .safe-toggle {
      min-width: 58px; padding: 6px 10px; border-radius: 16px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-secondary); font-size: 12px; font-weight: 700; cursor: pointer;
    }
    .safe-toggle.active { background: rgba(38,166,154,0.12); color: var(--green); border-color: rgba(38,166,154,0.4); }
    .form-row { margin-bottom: 14px; }
    .form-row:last-child { margin-bottom: 0; }
    .form-row label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }
    .trust-row { display: flex; align-items: center; gap: 10px; }
    .trust-toggle {
      min-width: 58px; padding: 6px 10px; border-radius: 16px; border: 1px solid var(--border);
      background: var(--bg-card); color: var(--text-secondary); font-size: 12px; font-weight: 700; cursor: pointer;
    }
    .trust-toggle.active { background: rgba(38,166,154,0.12); color: var(--green); border-color: rgba(38,166,154,0.4); }
    .trust-sub { font-size: 11px; color: var(--text-muted); }
    .trust-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .trust-chip {
      padding: 6px 10px; border-radius: 14px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 11px; font-weight: 700;
    }
    .trust-chip.active { background: rgba(59,130,246,0.12); color: var(--blue); border-color: rgba(59,130,246,0.4); }
    .trust-hint { margin-top: 6px; font-size: 11px; color: var(--text-muted); }
    select {
      width: 100%; background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px; color: var(--text-primary); font-size: 13px;
    }
    .btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
    .btn-group button {
      padding: 5px 10px; background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 6px; color: var(--text-secondary); cursor: pointer; font-size: 12px; font-weight: 500;
      transition: all 0.15s;
    }
    .btn-group button.active { background: var(--blue); color: white; border-color: var(--blue); }
    .btn-group button:hover:not(.active) { background: var(--bg-primary); color: var(--text-primary); }

    /* Strategy cards */
    .strategy-cards { display: flex; flex-direction: column; gap: 8px; }
    .strategy-card {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-hover); cursor: pointer; transition: all 0.15s; position: relative;
    }
    .strategy-card:hover { border-color: var(--border-light); background: var(--bg-primary); }
    .strategy-card.selected { border-color: var(--blue); background: rgba(59,130,246,0.08); }
    .sc-icon { font-size: 11px; width: 48px; text-align: center; color: var(--text-muted); font-weight: 700; }
    .sc-name { font-size: 12px; font-weight: 700; color: var(--text-primary); width: 80px; }
    .sc-desc { font-size: 11px; color: var(--text-muted); flex: 1; }
    .sc-check { font-size: 11px; color: var(--blue); font-weight: 700; }

    /* Mode toggle */
    .mode-toggle { display: flex; gap: 10px; margin-bottom: 10px; }
    .mode-toggle button {
      flex: 1; display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border: 2px solid var(--border); border-radius: 10px;
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .mode-toggle button:hover { border-color: var(--border-light); background: var(--bg-primary); }
    .mode-toggle button.active { border-color: var(--blue); background: rgba(59,130,246,0.08); color: var(--blue); }
    .mode-toggle button.live-active { border-color: var(--red); background: rgba(239,83,80,0.08); color: var(--red); }
    .mode-name { font-size: 13px; font-weight: 700; line-height: 1.2; text-align: left; }
    .mode-sub { font-size: 10px; color: inherit; opacity: 0.7; }
    .live-warning { font-size: 12px; color: var(--red); background: rgba(239,83,80,0.08); border-radius: 6px; padding: 8px 10px; }

    /* Sliders */
    .slider-row { margin-bottom: 16px; }
    .slider-row:last-of-type { margin-bottom: 0; }
    .slider-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }
    .slider-val { font-weight: 700; color: var(--text-primary); }
    .slider-val.green { color: var(--green); }
    .slider-val.red { color: var(--red); }
    .slider { width: 100%; accent-color: var(--blue); height: 4px; }
    .green-slider { accent-color: var(--green); }
    .red-slider { accent-color: var(--red); }
    .slider-bounds { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 2px; }

    /* Risk reward summary */
    .rr-summary {
      display: flex; gap: 0; margin-top: 16px; padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .rr-item { flex: 1; text-align: center; }
    .rr-item:first-child { border-right: 1px solid var(--border); }
    .rr-label { display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .rr-value { font-size: 18px; font-weight: 700; color: var(--text-primary); }
    .rr-good { color: var(--green); }
    .rr-bad { color: var(--yellow); }

    /* Footer */
    .config-footer { display: flex; align-items: center; gap: 16px; margin-top: 20px; }
    .btn-reset {
      padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
      background: rgba(239,83,80,0.08); color: var(--red); border: 1px solid rgba(239,83,80,0.3);
    }
    .btn-reset:hover { background: rgba(239,83,80,0.15); }
    .save-hint { font-size: 12px; color: var(--green); }

    @media (max-width: 768px) {
      .config-layout { grid-template-columns: 1fr; }
    }
  `]
})
export class BotConfigComponent {
  pairs = TRUSTED_PAIRS;
  timeframes: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  strategies: StrategyType[] = ['RSI', 'MACD', 'BOLLINGER', 'EMA', 'COMPOSITE'];

  strategyIcon: Record<StrategyType, string> = {
    RSI: 'RSI', MACD: 'MACD', BOLLINGER: 'BOLL', EMA: 'EMA', COMPOSITE: 'COMP',
  };
  strategyDesc: Record<StrategyType, string> = {
    RSI: 'Buy oversold / sell overbought zones',
    MACD: 'Crossover signals with histogram',
    BOLLINGER: 'Trade at Bollinger Band extremes',
    EMA: 'Fast / slow exponential MA crossover',
    COMPOSITE: 'Weighted score of all 4 indicators',
  };

  private previousRisk: RiskParams | null = null;
  private readonly safeRisk: RiskParams = {
    positionSizePct: 2,
    stopLossPct: 1,
    takeProfitPct: 2,
    maxDailyLossPct: 2,
    maxOpenPositions: 1,
    dynamicPositionSizing: true,
    minPositionSizePct: 1,
    maxPositionSizePct: 3,
    volatilityTargetPct: 2,
    paperTrading: true,
  };

  readonly rrRatio = computed(() =>
    this.config.config().riskParams.takeProfitPct / this.config.config().riskParams.stopLossPct
  );

  readonly breakEvenWinRate = computed(() =>
    (1 / (1 + this.rrRatio())) * 100
  );

  readonly isSafeMode = computed(() => {
    const r = this.config.config().riskParams;
    return r.positionSizePct === this.safeRisk.positionSizePct &&
      r.stopLossPct === this.safeRisk.stopLossPct &&
      r.takeProfitPct === this.safeRisk.takeProfitPct &&
      r.maxDailyLossPct === this.safeRisk.maxDailyLossPct &&
      r.maxOpenPositions === this.safeRisk.maxOpenPositions &&
      r.dynamicPositionSizing === this.safeRisk.dynamicPositionSizing &&
      r.minPositionSizePct === this.safeRisk.minPositionSizePct &&
      r.maxPositionSizePct === this.safeRisk.maxPositionSizePct &&
      r.volatilityTargetPct === this.safeRisk.volatilityTargetPct;
  });

  constructor(
    readonly config: ConfigService,
    readonly bot: BotSchedulerService,
  ) {}

  get cfg() { return this.config.config; }

  toggleBot(): void {
    if (this.bot.status() === 'running') this.bot.stop();
    else this.bot.start();
  }

  setLive(): void {
    if (confirm('Switch to LIVE trading? Real money will be used. Make sure BINANCE_API_KEY is set in Vercel.')) {
      this.config.updateRisk({ paperTrading: false });
    }
  }

  resetConfig(): void {
    if (confirm('Reset all settings to defaults?')) this.config.reset();
  }

  toggleSafeMode(): void {
    if (this.isSafeMode()) {
      if (this.previousRisk) this.config.updateRisk(this.previousRisk);
      else this.config.updateRisk(DEFAULT_RISK_PARAMS);
      this.previousRisk = null;
      return;
    }
    this.previousRisk = { ...this.config.config().riskParams };
    this.config.updateRisk(this.safeRisk);
  }

  toggleScan(): void {
    const next = !this.config.config().scanEnabled;
    this.config.update({ scanEnabled: next });
  }

  toggleTrendFilter(): void {
    this.config.updateStrategy({ useTrendFilter: !this.config.config().strategyParams.useTrendFilter });
  }

  toggleVolatilityFilter(): void {
    this.config.updateStrategy({ useVolatilityFilter: !this.config.config().strategyParams.useVolatilityFilter });
  }

  toggleDynamicSizing(): void {
    this.config.updateRisk({ dynamicPositionSizing: !this.config.config().riskParams.dynamicPositionSizing });
  }

  toggleTrustedOnly(): void {
    const cfg = this.config.config();
    const next = !cfg.trustedOnly;
    this.config.update({ trustedOnly: next });
    if (next) this.ensurePairIsTrusted();
  }

  isTrusted(pair: string): boolean {
    return this.config.config().trustedPairs.includes(pair);
  }

  toggleTrustedPair(pair: string): void {
    const cfg = this.config.config();
    const set = new Set(cfg.trustedPairs);
    if (set.has(pair)) set.delete(pair);
    else set.add(pair);
    if (set.size === 0) return;
    const next = Array.from(set);
    this.config.update({ trustedPairs: next });
    if (cfg.trustedOnly) this.ensurePairIsTrusted();
  }

  private ensurePairIsTrusted(): void {
    const cfg = this.config.config();
    if (!cfg.trustedPairs.includes(cfg.pair)) {
      const fallback = cfg.trustedPairs[0] ?? 'BTCUSDT';
      this.config.update({ pair: fallback });
    }
  }
}
