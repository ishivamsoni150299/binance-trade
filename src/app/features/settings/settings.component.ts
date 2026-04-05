import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { CredentialsService } from '../../core/services/credentials.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Settings</h1>
          <p class="subtitle">All data stays in your browser — keys are never sent to any server</p>
        </div>
      </div>

      <!-- ── TRADING MODE ─────────────────────────────────── -->
      <div class="section">
        <div class="section-title">Trading Mode</div>
        <div class="mode-cards">

          <div class="mode-card" [class.active]="creds.isPaper()" (click)="setPaper()">
            <div class="mc-icon paper-icon">P</div>
            <div class="mc-body">
              <div class="mc-title">Paper Trading</div>
              <div class="mc-desc">Simulated $10,000 — no real money at risk. Perfect for testing.</div>
            </div>
            <div class="mc-check" [class.checked]="creds.isPaper()">
              {{ creds.isPaper() ? '✓' : '' }}
            </div>
          </div>

          <div class="mode-card" [class.active]="creds.isLive()" [class.live-card]="creds.isLive()"
               (click)="setLive()">
            <div class="mc-icon live-icon">L</div>
            <div class="mc-body">
              <div class="mc-title">Live Trading <span class="live-badge">REAL MONEY</span></div>
              <div class="mc-desc">Uses your Binance API key. Requires keys below. Start small.</div>
            </div>
            <div class="mc-check" [class.checked]="creds.isLive()">
              {{ creds.isLive() ? '✓' : '' }}
            </div>
          </div>

        </div>

        @if (!creds.hasKeys() && creds.creds().isLive) {
          <div class="warn-box">Enter your API keys below to enable live trading.</div>
        }
        @if (creds.isLive()) {
          <div class="live-warn">
            You are trading with REAL MONEY. Losses are real. Never risk more than you can afford to lose.
          </div>
        }
      </div>

      <!-- ── API KEYS ──────────────────────────────────────── -->
      <div class="section">
        <div class="section-title">Binance API Keys
          <span class="secure-badge">Stored locally in your browser only</span>
        </div>

        @if (creds.hasKeys()) {
          <div class="keys-saved">
            <span class="ks-icon">K</span>
            <div class="ks-info">
              <div class="ks-title">API Keys saved</div>
              <div class="ks-sub">Key: {{ maskedKey() }}</div>
            </div>
            <button class="btn-clear" (click)="clearKeys()">Remove Keys</button>
          </div>
        }

        <div class="form-group">
          <label>API Key</label>
          <input type="text" [(ngModel)]="apiKeyInput" placeholder="Paste your Binance API Key here"
            class="key-input" autocomplete="off" spellcheck="false" />
        </div>
        <div class="form-group">
          <label>API Secret
            <span class="label-hint">Hidden after saving</span>
          </label>
          <input [type]="showSecret() ? 'text' : 'password'" [(ngModel)]="apiSecretInput"
            placeholder="Paste your API Secret here"
            class="key-input" autocomplete="off" spellcheck="false" />
          <button class="btn-toggle-vis" (click)="showSecret.set(!showSecret())">
            {{ showSecret() ? 'Hide' : 'Show' }}
          </button>
        </div>

        <div class="key-actions">
          <button class="btn-save" (click)="saveKeys()" [disabled]="!apiKeyInput || !apiSecretInput">
            Save API Keys
          </button>
          <button class="btn-test" (click)="testConnection()" [disabled]="!creds.hasKeys() || testing()">
            {{ testing() ? 'Testing...' : 'Test Connection' }}
          </button>
        </div>

        @if (testResult()) {
          <div class="test-result" [class.success]="testSuccess()" [class.fail]="!testSuccess()">
            {{ testResult() }}
          </div>
        }

        <div class="key-instructions">
          <div class="ki-title">How to create an API key on Binance:</div>
          <ol class="ki-steps">
            <li>Go to <strong>Binance.com → Profile → API Management</strong></li>
            <li>Click <strong>Create API</strong> → choose <strong>System Generated</strong></li>
            <li>Enable ONLY <strong>"Enable Spot & Margin Trading"</strong></li>
            <li><strong>NEVER enable withdrawals</strong> — not needed for trading</li>
            <li>Copy both keys and paste above</li>
          </ol>
        </div>
      </div>

      <!-- ── RISK SETTINGS ─────────────────────────────────── -->
      <div class="section">
        <div class="section-title">Risk Settings
          @if (creds.isLive()) {
            <span class="live-badge-sm">Live Mode</span>
          }
        </div>

        <div class="risk-grid">

          <div class="risk-card">
            <div class="rc-label">Position Size</div>
            <div class="rc-val">{{ cfg().riskParams.positionSizePct }}%</div>
            <input type="range" min="5" max="30" step="1" class="slider green"
              [ngModel]="cfg().riskParams.positionSizePct"
              (ngModelChange)="config.updateRisk({positionSizePct: +$event})">
            <div class="rc-hint">= {{ positionUsd() }} per trade</div>
          </div>

          <div class="risk-card">
            <div class="rc-label">Stop Loss</div>
            <div class="rc-val red">{{ cfg().riskParams.stopLossPct }}%</div>
            <input type="range" min="0.5" max="5" step="0.5" class="slider red"
              [ngModel]="cfg().riskParams.stopLossPct"
              (ngModelChange)="config.updateRisk({stopLossPct: +$event})">
            <div class="rc-hint">Max loss: {{ maxLossUsd() }} per trade</div>
          </div>

          <div class="risk-card">
            <div class="rc-label">Take Profit</div>
            <div class="rc-val green">{{ cfg().riskParams.takeProfitPct }}%</div>
            <input type="range" min="1" max="10" step="0.5" class="slider green"
              [ngModel]="cfg().riskParams.takeProfitPct"
              (ngModelChange)="config.updateRisk({takeProfitPct: +$event})">
            <div class="rc-hint">Max gain: {{ maxGainUsd() }} per trade</div>
          </div>

          <div class="risk-card">
            <div class="rc-label">Daily Loss Limit</div>
            <div class="rc-val red">{{ cfg().riskParams.maxDailyLossPct }}%</div>
            <input type="range" min="1" max="15" step="1" class="slider red"
              [ngModel]="cfg().riskParams.maxDailyLossPct"
              (ngModelChange)="config.updateRisk({maxDailyLossPct: +$event})">
            <div class="rc-hint">Bot pauses if daily loss exceeds this</div>
          </div>

        </div>

        <div class="rr-summary">
          <div class="rr-item">
            <span class="rr-label">Risk : Reward</span>
            <span class="rr-val">1 : {{ (cfg().riskParams.takeProfitPct / cfg().riskParams.stopLossPct).toFixed(1) }}</span>
          </div>
          <div class="rr-item">
            <span class="rr-label">Break-even win rate</span>
            <span class="rr-val">{{ breakEvenWinRate().toFixed(0) }}%</span>
          </div>
          <div class="rr-item">
            <span class="rr-label">Max open positions</span>
            <span class="rr-val">{{ cfg().riskParams.maxOpenPositions }}</span>
          </div>
        </div>
      </div>

      <!-- ── BOT INTERVAL ─────────────────────────────────── -->
      <div class="section">
        <div class="section-title">Bot Check Interval (Browser)</div>
        <div class="interval-row">
          @for (opt of intervalOptions; track opt.value) {
            <button class="iv-btn" [class.active]="cfg().botIntervalSec === opt.value"
              (click)="config.update({botIntervalSec: opt.value})">
              {{ opt.label }}
            </button>
          }
        </div>
        <div class="iv-hint">How often the bot checks for signals when you have the app open.</div>
      </div>

      <!-- ── DANGER ZONE ───────────────────────────────────── -->
      <div class="section danger-section">
        <div class="section-title">Danger Zone</div>
        <div class="danger-row">
          <div>
            <div class="dr-title">Reset All Settings</div>
            <div class="dr-desc">Clears all config and resets to defaults. Does not remove API keys.</div>
          </div>
          <button class="btn-danger" (click)="resetConfig()">Reset Config</button>
        </div>
        <div class="danger-row">
          <div>
            <div class="dr-title">Remove API Keys</div>
            <div class="dr-desc">Deletes stored keys from browser. Bot switches to paper mode.</div>
          </div>
          <button class="btn-danger" (click)="clearKeys()">Remove Keys</button>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 900px; animation: fadeIn 0.2s ease-out; }
    .page-header { margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 12px; color: var(--text-muted); margin: 0; }

    /* Section */
    .section {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-bottom: 16px;
    }
    .section-title {
      font-size: 12px; font-weight: 700; color: var(--text-secondary);
      text-transform: uppercase; letter-spacing: 0.07em;
      margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    }
    .secure-badge {
      font-size: 10px; background: rgba(38,166,154,0.12); color: var(--green);
      border: 1px solid rgba(38,166,154,0.3); padding: 2px 8px; border-radius: 10px;
      text-transform: none; letter-spacing: 0; font-weight: 600;
    }
    .live-badge-sm {
      font-size: 10px; background: rgba(239,83,80,0.1); color: var(--red);
      border: 1px solid rgba(239,83,80,0.3); padding: 2px 8px; border-radius: 10px;
      text-transform: none; letter-spacing: 0; font-weight: 700;
    }

    /* Mode cards */
    .mode-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .mode-card {
      display: flex; align-items: center; gap: 14px;
      border: 2px solid var(--border); border-radius: 10px; padding: 16px;
      cursor: pointer; transition: all 0.15s;
    }
    .mode-card:hover { border-color: var(--blue); background: var(--bg-hover); }
    .mode-card.active { border-color: var(--blue); background: rgba(59,130,246,0.06); }
    .mode-card.live-card.active { border-color: var(--red); background: rgba(239,83,80,0.06); }
    .mc-icon {
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; flex-shrink: 0;
    }
    .paper-icon { background: rgba(59,130,246,0.15); color: var(--blue); }
    .live-icon { background: rgba(239,83,80,0.15); color: var(--red); }
    .mc-body { flex: 1; }
    .mc-title { font-size: 14px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
    .mc-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .mc-check {
      width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .mc-check.checked { background: var(--blue); border-color: var(--blue); color: white; }
    .live-badge {
      font-size: 9px; background: rgba(239,83,80,0.15); color: var(--red);
      padding: 1px 6px; border-radius: 4px; font-weight: 700;
    }
    .warn-box {
      background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
      color: var(--yellow); border-radius: 8px; padding: 10px 14px; font-size: 13px;
    }
    .live-warn {
      background: rgba(239,83,80,0.08); border: 1px solid rgba(239,83,80,0.3);
      color: var(--red); border-radius: 8px; padding: 10px 14px; font-size: 12px;
      font-weight: 600; margin-top: 8px;
    }

    /* API keys */
    .keys-saved {
      display: flex; align-items: center; gap: 12px;
      background: rgba(38,166,154,0.08); border: 1px solid rgba(38,166,154,0.25);
      border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;
    }
    .ks-icon {
      width: 32px; height: 32px; border-radius: 8px; background: var(--green);
      color: white; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .ks-info { flex: 1; }
    .ks-title { font-size: 13px; font-weight: 600; color: var(--green); }
    .ks-sub { font-size: 12px; color: var(--text-muted); }
    .btn-clear {
      padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(239,83,80,0.4);
      background: transparent; color: var(--red); cursor: pointer; font-size: 12px; font-weight: 600;
    }

    .form-group { margin-bottom: 12px; position: relative; }
    label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
    .label-hint { font-weight: 400; color: var(--text-muted); margin-left: 6px; }
    .key-input {
      width: 100%; padding: 10px 14px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-primary);
      color: var(--text-primary); font-size: 13px; font-family: monospace;
      box-sizing: border-box; outline: none;
    }
    .key-input:focus { border-color: var(--blue); }
    .btn-toggle-vis {
      position: absolute; right: 10px; top: 32px;
      background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px;
    }

    .key-actions { display: flex; gap: 10px; margin-bottom: 12px; }
    .btn-save {
      padding: 10px 20px; border-radius: 8px; border: none;
      background: var(--blue); color: white; cursor: pointer; font-size: 13px; font-weight: 700;
    }
    .btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-test {
      padding: 10px 20px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer;
      font-size: 13px; font-weight: 600;
    }
    .btn-test:disabled { opacity: 0.4; cursor: not-allowed; }

    .test-result {
      padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 14px;
    }
    .test-result.success { background: rgba(38,166,154,0.1); color: var(--green); border: 1px solid rgba(38,166,154,0.3); }
    .test-result.fail { background: rgba(239,83,80,0.08); color: var(--red); border: 1px solid rgba(239,83,80,0.3); }

    .key-instructions {
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; padding: 14px; margin-top: 4px;
    }
    .ki-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; }
    .ki-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
    .ki-steps li { font-size: 12px; color: var(--text-secondary); }
    .ki-steps strong { color: var(--text-primary); }

    /* Risk grid */
    .risk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
    .risk-card {
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px;
    }
    .rc-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .rc-val { font-size: 22px; font-weight: 800; color: var(--text-primary); margin-bottom: 10px; }
    .rc-val.green { color: var(--green); }
    .rc-val.red { color: var(--red); }
    .rc-hint { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
    .slider { width: 100%; accent-color: var(--blue); cursor: pointer; }
    .slider.green { accent-color: var(--green); }
    .slider.red { accent-color: var(--red); }

    .rr-summary {
      display: flex; gap: 16px;
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 16px;
    }
    .rr-item { display: flex; flex-direction: column; gap: 2px; }
    .rr-label { font-size: 11px; color: var(--text-muted); }
    .rr-val { font-size: 15px; font-weight: 700; color: var(--text-primary); }

    /* Interval */
    .interval-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .iv-btn {
      padding: 7px 16px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 12px; font-weight: 600;
    }
    .iv-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .iv-hint { font-size: 12px; color: var(--text-muted); }

    /* Danger */
    .danger-section { border-color: rgba(239,83,80,0.25); }
    .danger-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .danger-row:last-child { border-bottom: none; padding-bottom: 0; }
    .dr-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .dr-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .btn-danger {
      padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(239,83,80,0.4);
      background: transparent; color: var(--red); cursor: pointer; font-size: 12px; font-weight: 600;
      white-space: nowrap; flex-shrink: 0;
    }
    .btn-danger:hover { background: rgba(239,83,80,0.08); }

    @media (max-width: 768px) {
      .mode-cards { grid-template-columns: 1fr; }
      .risk-grid { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class SettingsComponent {
  apiKeyInput = '';
  apiSecretInput = '';
  showSecret = signal(false);
  testing = signal(false);
  testResult = signal<string | null>(null);
  testSuccess = signal(false);
  liveBalance = signal(77); // will be updated after connection test

  readonly intervalOptions = [
    { value: 15, label: '15s' },
    { value: 30, label: '30s' },
    { value: 60, label: '1m' },
    { value: 300, label: '5m' },
  ];

  constructor(
    readonly config: ConfigService,
    readonly creds: CredentialsService,
    private bot: BotSchedulerService,
  ) {}

  cfg() { return this.config.config(); }

  balanceEstimate(): number {
    return this.creds.isLive() ? this.liveBalance() : 10000;
  }

  positionUsd(): string {
    return '$' + ((this.balanceEstimate() * this.cfg().riskParams.positionSizePct) / 100).toFixed(2);
  }

  maxLossUsd(): string {
    const pos = this.balanceEstimate() * this.cfg().riskParams.positionSizePct / 100;
    return '$' + (pos * this.cfg().riskParams.stopLossPct / 100).toFixed(2);
  }

  maxGainUsd(): string {
    const pos = this.balanceEstimate() * this.cfg().riskParams.positionSizePct / 100;
    return '$' + (pos * this.cfg().riskParams.takeProfitPct / 100).toFixed(2);
  }

  breakEvenWinRate(): number {
    const sl = this.cfg().riskParams.stopLossPct;
    const tp = this.cfg().riskParams.takeProfitPct;
    return (sl / (sl + tp)) * 100;
  }

  maskedKey(): string {
    const k = this.creds.apiKey;
    if (!k || k.length < 8) return '****';
    return k.slice(0, 6) + '****' + k.slice(-4);
  }

  saveKeys(): void {
    this.creds.save({ apiKey: this.apiKeyInput.trim(), apiSecret: this.apiSecretInput.trim() });
    this.apiKeyInput = '';
    this.apiSecretInput = '';
    this.testResult.set('Keys saved. Click "Test Connection" to verify.');
    this.testSuccess.set(true);
  }

  clearKeys(): void {
    if (this.bot.status() === 'running') this.bot.stop();
    this.creds.clear();
    this.config.updateRisk({ paperTrading: true });
    this.testResult.set(null);
  }

  setPaper(): void {
    this.config.updateRisk({ paperTrading: true });
    this.creds.save({ isLive: false });
    if (this.bot.status() === 'running') { this.bot.stop(); this.bot.start(); }
  }

  setLive(): void {
    if (!this.creds.hasKeys()) {
      this.testResult.set('Please enter and save your API keys first.');
      this.testSuccess.set(false);
      return;
    }
    this.config.updateRisk({ paperTrading: false });
    this.creds.save({ isLive: true });
    if (this.bot.status() === 'running') { this.bot.stop(); this.bot.start(); }
  }

  async testConnection(): Promise<void> {
    this.testing.set(true);
    this.testResult.set(null);
    try {
      const HOSTS = ['https://api.binance.com', 'https://api1.binance.com', 'https://api2.binance.com'];
      let lastErr = '';
      for (const host of HOSTS) {
        try {
          const ts = Date.now();
          const qs = `timestamp=${ts}`;
          const sig = await this.creds.sign(qs);
          const res = await fetch(`${host}/api/v3/account?${qs}&signature=${sig}`, {
            headers: { 'X-MBX-APIKEY': this.creds.apiKey },
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.msg ?? `HTTP ${res.status}`);
          // Get USDT balance
          const usdt = data.balances?.find((b: any) => b.asset === 'USDT');
          const bal = usdt ? parseFloat(usdt.free) : 0;
          this.liveBalance.set(bal);
          this.testResult.set(`Connected! Your USDT balance: $${bal.toFixed(2)}`);
          this.testSuccess.set(true);
          this.testing.set(false);
          return;
        } catch (e: any) { lastErr = e.message; }
      }
      throw new Error(lastErr || 'Connection failed');
    } catch (e: any) {
      this.testResult.set(`Failed: ${e.message}. Check your API key and make sure Spot Trading is enabled.`);
      this.testSuccess.set(false);
    } finally {
      this.testing.set(false);
    }
  }

  resetConfig(): void {
    if (confirm('Reset all bot settings to defaults?')) {
      this.config.reset();
    }
  }
}
