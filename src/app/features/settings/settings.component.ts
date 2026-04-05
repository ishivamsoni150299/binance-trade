import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { CredentialsService } from '../../core/services/credentials.service';
import { BotSchedulerService } from '../../core/services/bot-scheduler.service';

type SetupStep = 'idle' | 'running' | 'done' | 'error';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Settings</h1>
        <p class="subtitle">One-click setup — enter your keys and we handle everything else</p>
      </div>

      <!-- ── ONE-CLICK SETUP ──────────────────────────────────── -->
      <div class="section setup-section">
        <div class="section-title">
          Connect Your Binance Account
          @if (setupStep() === 'done') { <span class="badge-ok">Connected</span> }
        </div>

        @if (setupStep() === 'done') {
          <div class="done-box">
            <div class="done-icon">✓</div>
            <div class="done-body">
              <div class="done-title">All set! Bot is now trading with your real Binance account.</div>
              <div class="done-sub">The bot runs every 5 minutes automatically via GitHub Actions. Check the Dashboard to see your real balance and signals.</div>
            </div>
            <button class="btn-reconfig" (click)="setupStep.set('idle')">Reconfigure</button>
          </div>
        } @else {

          <!-- Step 1: Trading mode -->
          <div class="setup-step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="step-title">Choose trading mode</div>
              <div class="mode-row">
                <div class="mode-opt" [class.active]="!isLive()" (click)="isLive.set(false)">
                  <div class="mo-check" [class.on]="!isLive()"></div>
                  <div>
                    <div class="mo-title">Paper Trading</div>
                    <div class="mo-sub">Simulated — no real money</div>
                  </div>
                </div>
                <div class="mode-opt live-opt" [class.active]="isLive()" (click)="isLive.set(true)">
                  <div class="mo-check live-check" [class.on]="isLive()"></div>
                  <div>
                    <div class="mo-title">Live Trading <span class="live-tag">REAL MONEY</span></div>
                    <div class="mo-sub">Uses your Binance {{ balanceHint() }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: Binance keys -->
          <div class="setup-step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="step-title">
                Binance API Keys
                <span class="step-hint">From binance.com → Profile → API Management</span>
              </div>
              <div class="input-row">
                <input class="setup-input" type="text" placeholder="API Key"
                  [ngModel]="apiKey()" (ngModelChange)="apiKey.set($event)"
                  autocomplete="off" spellcheck="false" />
              </div>
              <div class="input-row">
                <input class="setup-input" [type]="showSecret() ? 'text' : 'password'"
                  placeholder="API Secret"
                  [ngModel]="apiSecret()" (ngModelChange)="apiSecret.set($event)"
                  autocomplete="off" spellcheck="false" />
                <button class="btn-vis" (click)="showSecret.set(!showSecret())">{{ showSecret() ? 'Hide' : 'Show' }}</button>
              </div>
              <div class="key-rules">
                Enable only: <strong>Enable Spot &amp; Margin Trading</strong> — never enable withdrawals
              </div>
            </div>
          </div>

          <!-- Step 3: GitHub token -->
          <div class="setup-step">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="step-title">
                GitHub Token
                <span class="step-hint">Used once to auto-configure your bot</span>
              </div>
              <div class="input-row">
                <input class="setup-input" [type]="showToken() ? 'text' : 'password'"
                  placeholder="GitHub Personal Access Token (ghp_...)"
                  [ngModel]="githubToken()" (ngModelChange)="githubToken.set($event)"
                  autocomplete="off" spellcheck="false" />
                <button class="btn-vis" (click)="showToken.set(!showToken())">{{ showToken() ? 'Hide' : 'Show' }}</button>
              </div>
              <button class="btn-get-token" (click)="openTokenPage()">
                Get GitHub Token →
              </button>
              <div class="token-hint">
                When creating the token: select <strong>repo</strong> scope only. Token is used once and never stored.
              </div>
            </div>
          </div>

          <!-- Step 4: Pair & Timeframe -->
          <div class="setup-step">
            <div class="step-num">4</div>
            <div class="step-body">
              <div class="step-title">Trading Pair &amp; Timeframe</div>
              <div class="pair-row">
                <div class="pair-group">
                  <label>Pair</label>
                  <select class="setup-select"
                    [ngModel]="botPair()" (ngModelChange)="botPair.set($event)">
                    @for (p of pairOptions; track p) {
                      <option [value]="p">{{ p }}</option>
                    }
                  </select>
                </div>
                <div class="pair-group">
                  <label>Timeframe</label>
                  <div class="tf-row">
                    @for (tf of timeframeOptions; track tf) {
                      <button class="tf-btn" [class.active]="botTimeframe() === tf"
                        (click)="botTimeframe.set(tf)">{{ tf }}</button>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 5: Risk Settings -->
          <div class="setup-step">
            <div class="step-num">5</div>
            <div class="step-body">
              <div class="step-title">Risk Settings
                @if (!isLive()) { <span class="step-hint">Applies when you switch to live</span> }
              </div>
              <div class="risk-row">
                <div class="risk-item">
                  <label>Position Size</label>
                  <div class="risk-val">{{ positionSizePct() }}%</div>
                  <input type="range" min="5" max="50" step="1" class="slider"
                    [ngModel]="positionSizePct()" (ngModelChange)="positionSizePct.set(+$event)" />
                  <div class="risk-sub">{{ positionDollar() }} per trade</div>
                </div>
                <div class="risk-item">
                  <label>Stop Loss</label>
                  <div class="risk-val red">-{{ stopLossPct() }}%</div>
                  <input type="range" min="0.5" max="10" step="0.5" class="slider red"
                    [ngModel]="stopLossPct()" (ngModelChange)="stopLossPct.set(+$event)" />
                </div>
                <div class="risk-item">
                  <label>Take Profit</label>
                  <div class="risk-val green">+{{ takeProfitPct() }}%</div>
                  <input type="range" min="1" max="20" step="0.5" class="slider green"
                    [ngModel]="takeProfitPct()" (ngModelChange)="takeProfitPct.set(+$event)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Setup button -->
          <button class="btn-setup" (click)="runSetup()"
            [disabled]="!canSetup() || setupStep() === 'running'">
            @if (setupStep() === 'running') {
              <span class="spinner"></span> Configuring everything...
            } @else {
              {{ isLive() ? 'Connect & Start Live Trading' : 'Connect & Start Paper Trading' }} — {{ botPair() }} {{ botTimeframe() }}
            }
          </button>

          @if (setupStep() === 'error') {
            <div class="error-box">{{ setupError() }}</div>
          }

          <div class="what-happens">
            <div class="wh-title">What happens when you click:</div>
            <div class="wh-row"><span class="wh-dot ok"></span>Your API keys are saved securely to GitHub</div>
            <div class="wh-row"><span class="wh-dot ok"></span>Bot switches to {{ isLive() ? 'LIVE' : 'PAPER' }} mode</div>
            <div class="wh-row"><span class="wh-dot ok"></span>First bot cycle triggers immediately</div>
            <div class="wh-row"><span class="wh-dot ok"></span>Dashboard shows your real {{ isLive() ? 'Binance' : 'simulated' }} balance</div>
            <div class="wh-row"><span class="wh-dot ok"></span>Bot runs automatically every 5 min 24/7</div>
          </div>
        }
      </div>

      <!-- ── BOT INTERVAL ─────────────────────────────────── -->
      <div class="section">
        <div class="section-title">Browser Bot Interval</div>
        <div class="interval-row">
          @for (opt of intervalOptions; track opt.value) {
            <button class="iv-btn" [class.active]="cfg().botIntervalSec === opt.value"
              (click)="config.update({botIntervalSec: opt.value})">
              {{ opt.label }}
            </button>
          }
        </div>
        <div class="iv-hint">How often the bot checks for signals while you have the app open.</div>
      </div>

      <!-- ── DANGER ZONE ───────────────────────────────────── -->
      <div class="section danger-section">
        <div class="section-title">Danger Zone</div>
        <div class="danger-row">
          <div>
            <div class="dr-title">Reset All Settings</div>
            <div class="dr-desc">Clears config and resets to defaults.</div>
          </div>
          <button class="btn-danger" (click)="resetConfig()">Reset</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 760px; animation: fadeIn 0.2s ease-out; }
    .page-header { margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 13px; color: var(--text-muted); margin: 0; }

    .section {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-bottom: 16px;
    }
    .setup-section { border-color: rgba(59,130,246,0.3); }
    .section-title {
      font-size: 12px; font-weight: 700; color: var(--text-secondary);
      text-transform: uppercase; letter-spacing: 0.07em;
      margin-bottom: 18px; display: flex; align-items: center; gap: 8px;
    }
    .badge-ok {
      font-size: 10px; background: rgba(38,166,154,0.15); color: var(--green);
      border: 1px solid rgba(38,166,154,0.3); padding: 2px 8px; border-radius: 10px;
      text-transform: none; letter-spacing: 0; font-weight: 700;
    }

    /* Done state */
    .done-box {
      display: flex; align-items: center; gap: 16px;
      background: rgba(38,166,154,0.06); border: 1px solid rgba(38,166,154,0.25);
      border-radius: 10px; padding: 16px 20px;
    }
    .done-icon { font-size: 28px; color: var(--green); flex-shrink: 0; }
    .done-body { flex: 1; }
    .done-title { font-size: 14px; font-weight: 700; color: var(--green); }
    .done-sub { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
    .btn-reconfig {
      padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 12px;
    }

    /* Steps */
    .setup-step {
      display: flex; gap: 14px; margin-bottom: 20px;
      padding-bottom: 20px; border-bottom: 1px solid var(--border);
    }
    .setup-step:last-of-type { border-bottom: none; }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%; background: var(--blue);
      color: white; font-size: 13px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .step-body { flex: 1; }
    .step-title {
      font-size: 14px; font-weight: 700; color: var(--text-primary);
      margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
    }
    .step-hint { font-size: 11px; color: var(--text-muted); font-weight: 400; }

    /* Mode selector */
    .mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mode-opt {
      display: flex; align-items: center; gap: 12px; padding: 14px;
      border: 2px solid var(--border); border-radius: 10px; cursor: pointer;
      transition: all 0.15s;
    }
    .mode-opt:hover { border-color: var(--blue); }
    .mode-opt.active { border-color: var(--blue); background: rgba(59,130,246,0.06); }
    .live-opt.active { border-color: var(--red); background: rgba(239,83,80,0.05); }
    .mo-check {
      width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border);
      flex-shrink: 0; transition: all 0.15s;
    }
    .mo-check.on { background: var(--blue); border-color: var(--blue); }
    .live-check.on { background: var(--red); border-color: var(--red); }
    .mo-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
    .mo-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .live-tag {
      font-size: 9px; background: rgba(239,83,80,0.15); color: var(--red);
      padding: 1px 5px; border-radius: 4px; font-weight: 800;
    }

    /* Inputs */
    .input-row { display: flex; gap: 8px; margin-bottom: 8px; position: relative; }
    .setup-input {
      flex: 1; padding: 10px 14px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-primary);
      color: var(--text-primary); font-size: 13px; font-family: monospace; outline: none;
    }
    .setup-input:focus { border-color: var(--blue); }
    .btn-vis {
      padding: 0 12px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-muted); cursor: pointer; font-size: 12px;
    }
    .key-rules { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    .btn-get-token {
      display: inline-block; margin: 6px 0; padding: 6px 12px; border-radius: 6px;
      border: 1px solid var(--blue); background: rgba(59,130,246,0.08);
      color: var(--blue); cursor: pointer; font-size: 12px; font-weight: 700;
    }
    .token-hint { font-size: 11px; color: var(--text-muted); margin-top: 6px; }

    /* Pair & timeframe */
    .pair-row { display: flex; gap: 20px; flex-wrap: wrap; }
    .pair-group { display: flex; flex-direction: column; gap: 6px; }
    .setup-select {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-primary); color: var(--text-primary); font-size: 13px;
      font-weight: 600; outline: none; cursor: pointer; min-width: 140px;
    }
    .setup-select:focus { border-color: var(--blue); }
    .tf-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .tf-btn {
      padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer;
      font-size: 12px; font-weight: 600; transition: all 0.15s;
    }
    .tf-btn.active { background: var(--blue); color: white; border-color: var(--blue); }

    /* Risk */
    .risk-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .risk-item { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    label { display: block; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .risk-val { font-size: 20px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }
    .risk-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .risk-val.red { color: var(--red); }
    .risk-val.green { color: var(--green); }
    .slider { width: 100%; accent-color: var(--blue); cursor: pointer; }
    .slider.red { accent-color: var(--red); }
    .slider.green { accent-color: var(--green); }

    /* Setup button */
    .btn-setup {
      width: 100%; padding: 14px; border-radius: 10px; border: none;
      background: var(--blue); color: white; font-size: 15px; font-weight: 800;
      cursor: pointer; margin: 6px 0 16px; display: flex; align-items: center;
      justify-content: center; gap: 10px; transition: all 0.15s;
    }
    .btn-setup:hover:not(:disabled) { background: #2563eb; }
    .btn-setup:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner {
      width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-box {
      background: rgba(239,83,80,0.08); border: 1px solid rgba(239,83,80,0.3);
      color: var(--red); border-radius: 8px; padding: 12px 14px;
      font-size: 13px; margin-bottom: 12px;
    }

    /* What happens */
    .what-happens {
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 14px;
    }
    .wh-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .wh-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
    .wh-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .wh-dot.ok { background: var(--green); }

    /* Interval */
    .interval-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .iv-btn {
      padding: 7px 16px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer;
      font-size: 12px; font-weight: 600;
    }
    .iv-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .iv-hint { font-size: 12px; color: var(--text-muted); }

    /* Danger */
    .danger-section { border-color: rgba(239,83,80,0.2); }
    .danger-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .dr-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .dr-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .btn-danger {
      padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(239,83,80,0.4);
      background: transparent; color: var(--red); cursor: pointer; font-size: 12px; font-weight: 600;
      flex-shrink: 0;
    }

    @media (max-width: 600px) {
      .mode-row { grid-template-columns: 1fr; }
      .risk-row { grid-template-columns: 1fr; }
    }
  `]
})
export class SettingsComponent {
  // Setup form
  apiKey      = signal('');
  apiSecret   = signal('');
  githubToken = signal('');
  showSecret  = signal(false);
  showToken   = signal(false);
  isLive      = signal(false);

  // Pair & timeframe
  botPair      = signal('BTCUSDT');
  botTimeframe = signal('1h');

  readonly pairOptions = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT'];
  readonly timeframeOptions = ['15m', '30m', '1h', '2h', '4h', '1d'];

  // Risk
  positionSizePct = signal(15);
  stopLossPct     = signal(1.5);
  takeProfitPct   = signal(3);

  // Setup state
  setupStep  = signal<SetupStep>('idle');
  setupError = signal('');

  readonly canSetup = computed(() =>
    !!this.apiKey().trim() && !!this.apiSecret().trim() && !!this.githubToken().trim()
  );

  readonly balanceHint    = computed(() => this.isLive() ? '$77 USDT' : '$10,000 simulated');
  readonly positionDollar = computed(() => {
    const base = this.isLive() ? 77 : 10000;
    return '$' + (base * this.positionSizePct() / 100).toFixed(2);
  });

  readonly intervalOptions = [
    { value: 15,  label: '15s' },
    { value: 30,  label: '30s' },
    { value: 60,  label: '1m'  },
    { value: 300, label: '5m'  },
  ];

  constructor(
    readonly config: ConfigService,
    readonly creds: CredentialsService,
    private bot: BotSchedulerService,
  ) {}

  cfg() { return this.config.config(); }

  openTokenPage(): void {
    window.open(
      'https://github.com/settings/tokens/new?scopes=repo&description=BTrader+Bot+Setup',
      '_blank'
    );
  }

  async runSetup(): Promise<void> {
    this.setupStep.set('running');
    this.setupError.set('');
    try {
      const res = await fetch('/api/setup/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken:     this.githubToken().trim(),
          binanceApiKey:   this.apiKey().trim(),
          binanceApiSecret: this.apiSecret().trim(),
          paperTrading:    !this.isLive(),
          positionSizePct: this.positionSizePct(),
          stopLossPct:     this.stopLossPct(),
          takeProfitPct:   this.takeProfitPct(),
          botPair:         this.botPair(),
          botTimeframe:    this.botTimeframe(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Setup failed');

      // Save locally too
      this.creds.save({
        apiKey:    this.apiKey().trim(),
        apiSecret: this.apiSecret().trim(),
        isLive:    this.isLive(),
      });
      this.config.updateRisk({ paperTrading: !this.isLive() });

      // Clear sensitive fields from memory
      this.githubToken.set('');
      this.apiKey.set('');
      this.apiSecret.set('');

      // Restart browser bot
      if (this.bot.status() === 'running') { this.bot.stop(); this.bot.start(); }

      this.setupStep.set('done');
    } catch (e: any) {
      this.setupError.set(e.message ?? 'Unknown error. Check your GitHub token has repo scope.');
      this.setupStep.set('error');
    }
  }

  resetConfig(): void {
    if (confirm('Reset all bot settings to defaults?')) {
      this.config.reset();
      this.bot.stop();
    }
  }
}
