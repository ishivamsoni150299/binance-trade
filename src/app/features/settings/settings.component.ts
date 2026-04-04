import { Component } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page">
      <h1>Settings</h1>

      <div class="settings-grid">
        <!-- API Key instructions -->
        <div class="settings-section">
          <h2>Binance API Keys</h2>
          <p class="info-text">
            For security, API keys are <strong>never stored in the browser</strong>. They are set as
            environment variables in your Vercel project and used only server-side.
          </p>
          <div class="steps">
            <div class="step">
              <span class="step-num">1</span>
              <div>
                <strong>Create API Key on Binance</strong>
                <p>Go to Binance > Profile > API Management. Create a key with <em>Spot Trading</em> permission only. Never enable withdrawals.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div>
                <strong>Add to Vercel</strong>
                <p>In your Vercel project > Settings > Environment Variables, add:</p>
                <code class="code-block">BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
BINANCE_TESTNET=true
BOT_SECRET=any-random-secret-string</code>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div>
                <strong>Add to GitHub Actions</strong>
                <p>In your GitHub repo > Settings > Secrets > Actions, add <code>BOT_SECRET</code> with the same value.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">4</span>
              <div>
                <strong>Test with Testnet first</strong>
                <p>Keep <code>BINANCE_TESTNET=true</code> until you verify everything works. Then set it to <code>false</code> for live trading.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- GitHub Actions -->
        <div class="settings-section">
          <h2>Always-On Bot (GitHub Actions)</h2>
          <p class="info-text">
            The bot runs in your browser when you have the tab open. For <strong>24/7 automated trading</strong>,
            GitHub Actions will call the bot endpoint every 5 minutes.
          </p>
          <div class="steps">
            <div class="step">
              <span class="step-num">1</span>
              <div>
                <strong>Push to GitHub</strong>
                <p>The workflow file <code>.github/workflows/trading-bot.yml</code> is already included.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div>
                <strong>Set secrets</strong>
                <p>Add these secrets in GitHub > Settings > Secrets:</p>
                <code class="code-block">BOT_SECRET=same-value-as-vercel
APP_URL=https://your-app.vercel.app</code>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div>
                <strong>Enable Actions</strong>
                <p>Go to your repo's Actions tab and enable workflows.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bot interval -->
        <div class="settings-section">
          <h2>Bot Check Interval</h2>
          <p class="info-text">How often the browser-based bot checks for signals (when tab is open).</p>
          <div class="interval-options">
            @for (opt of intervalOptions; track opt.value) {
              <button class="interval-btn" [class.active]="config.config().botIntervalSec === opt.value" (click)="setInterval(opt.value)">
                {{ opt.label }}
              </button>
            }
          </div>
          <p class="info-hint">Note: For 1h/4h strategies, 1 minute is more than sufficient.</p>
        </div>

        <!-- About -->
        <div class="settings-section">
          <h2>About</h2>
          <div class="about-list">
            <div class="about-row"><span>Version</span><span>1.0.0</span></div>
            <div class="about-row"><span>Framework</span><span>Angular 19</span></div>
            <div class="about-row"><span>Charts</span><span>TradingView LW v5</span></div>
            <div class="about-row"><span>Storage</span><span>IndexedDB (local)</span></div>
            <div class="about-row"><span>Backend</span><span>Vercel Serverless</span></div>
            <div class="about-row"><span>Exchange</span><span>Binance Spot</span></div>
          </div>
          <p class="disclaimer">
            <strong>Disclaimer:</strong> This tool is for educational purposes. Crypto trading involves significant risk.
            Never trade more than you can afford to lose. Always start with paper trading.
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 900px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 24px; }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .settings-section {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 20px;
    }
    h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
    .info-text { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; line-height: 1.6; }
    .steps { display: flex; flex-direction: column; gap: 14px; }
    .step { display: flex; gap: 12px; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%; background: var(--blue);
      color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; margin-top: 2px;
    }
    .step strong { display: block; font-size: 13px; margin-bottom: 4px; }
    .step p { font-size: 12px; color: var(--text-secondary); margin: 0; }
    code { font-size: 11px; color: var(--blue); background: var(--bg-hover); padding: 1px 4px; border-radius: 3px; }
    .code-block {
      display: block; background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 6px; padding: 10px; margin-top: 6px;
      font-family: 'Courier New', monospace; font-size: 12px;
      color: var(--green); white-space: pre; overflow-x: auto;
    }
    .interval-options { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .interval-btn {
      padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border);
      background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; font-size: 12px;
    }
    .interval-btn.active { background: var(--blue); color: white; border-color: var(--blue); }
    .info-hint { font-size: 12px; color: var(--text-muted); margin: 0; }
    .about-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .about-row { display: flex; justify-content: space-between; font-size: 13px; }
    .about-row span:first-child { color: var(--text-secondary); }
    .about-row span:last-child { font-weight: 500; }
    .disclaimer { font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 12px; }
    @media (max-width: 768px) { .settings-grid { grid-template-columns: 1fr; } }
  `]
})
export class SettingsComponent {
  intervalOptions = [
    { value: 15, label: '15s' },
    { value: 30, label: '30s' },
    { value: 60, label: '1m' },
    { value: 300, label: '5m' },
  ];

  constructor(readonly config: ConfigService) {}

  setInterval(seconds: number): void {
    this.config.update({ botIntervalSec: seconds });
  }
}