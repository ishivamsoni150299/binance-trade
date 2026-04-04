import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>How It Works</h1>
        <p class="subtitle">Everything you need to know to start automated trading</p>
      </div>

      <!-- What is this app -->
      <div class="explainer-hero">
        <div class="eh-icon">🤖</div>
        <div class="eh-text">
          <h2>BTrader is your personal automated trading bot</h2>
          <p>It watches the crypto market 24/7, detects buy/sell signals using AI indicators, and places trades on Binance <strong>automatically</strong> — even when your browser is closed.</p>
        </div>
      </div>

      <!-- How it works flow -->
      <div class="section-title">How the bot works</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="fs-num">1</div>
          <div class="fs-icon">📊</div>
          <div class="fs-title">Reads Market Data</div>
          <div class="fs-desc">Every 5 minutes, the bot fetches the last 200 candles of BTC/USDT price history from Binance</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="fs-num">2</div>
          <div class="fs-icon">🧠</div>
          <div class="fs-title">Calculates Signals</div>
          <div class="fs-desc">4 indicators are scored: RSI, MACD, Bollinger Bands, and EMA. Combined into one score from -100 to +100</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="fs-num">3</div>
          <div class="fs-icon">⚡</div>
          <div class="fs-title">Decides to Trade</div>
          <div class="fs-desc">Score above 50 = BUY. Score below -50 = SELL. Between = HOLD (do nothing)</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="fs-num">4</div>
          <div class="fs-icon">✅</div>
          <div class="fs-title">Places Order</div>
          <div class="fs-desc">In paper mode: logs a fake trade. In live mode: places a real market order on your Binance account</div>
        </div>
      </div>

      <!-- Two modes -->
      <div class="section-title">Two modes — start safe</div>
      <div class="modes-grid">
        <div class="mode-card paper-card">
          <div class="mc-badge">YOU ARE HERE</div>
          <div class="mc-icon">📝</div>
          <div class="mc-title">Paper Trading (Safe)</div>
          <div class="mc-desc">Trades with fake $10,000. No real money. Perfect for testing and learning how the bot performs.</div>
          <div class="mc-status active">✓ Currently Active</div>
        </div>
        <div class="mode-card live-card">
          <div class="mc-icon">⚡</div>
          <div class="mc-title">Live Trading (Real Money)</div>
          <div class="mc-desc">Uses your actual Binance balance. Only switch to this after you've seen consistent profit in paper mode for 2–4 weeks.</div>
          <div class="mc-status">Switch when ready</div>
        </div>
      </div>

      <!-- What runs 24/7 -->
      <div class="section-title">What runs 24/7 automatically</div>
      <div class="auto-grid">
        <div class="auto-card">
          <div class="ac-icon">⚙️</div>
          <div class="ac-title">GitHub Actions</div>
          <div class="ac-desc">A free server that runs the bot every 5 minutes — even when your computer is off and browser is closed</div>
          <div class="ac-link">
            <a href="https://github.com/ishivamsoni150299/binance-trade/actions" target="_blank" class="ac-btn">View runs →</a>
          </div>
        </div>
        <div class="auto-card">
          <div class="ac-icon">🌐</div>
          <div class="ac-title">Vercel (This Website)</div>
          <div class="ac-desc">Hosts your dashboard. Shows you live prices, trades, and bot status in real time</div>
          <div class="ac-link">
            <a href="https://binance-trade-two.vercel.app" target="_blank" class="ac-btn">Open dashboard →</a>
          </div>
        </div>
        <div class="auto-card">
          <div class="ac-icon">📡</div>
          <div class="ac-title">Binance WebSocket</div>
          <div class="ac-desc">Live price stream connected directly to Binance. Updates every second — you see the real market price</div>
        </div>
      </div>

      <!-- Step by step guide -->
      <div class="section-title">Your action plan — 3 simple steps</div>
      <div class="action-steps">

        <div class="action-step done">
          <div class="as-check">✓</div>
          <div class="as-content">
            <div class="as-title">Step 1: Setup complete</div>
            <div class="as-desc">Your app is deployed, GitHub Actions is running every 5 min, paper wallet shows $10,000 USDT. Everything is working.</div>
          </div>
        </div>

        <div class="action-step current">
          <div class="as-num">2</div>
          <div class="as-content">
            <div class="as-title">Step 2: Watch the bot trade in paper mode</div>
            <div class="as-desc">For the next 2–4 weeks, just watch. The bot will automatically place fake trades. Go to <strong>Trade History</strong> to see results. If you see consistent profit — you're ready for real money.</div>
            <div class="as-actions">
              <a routerLink="/trades" class="as-btn primary">View Trade History</a>
              <a routerLink="/bot" class="as-btn secondary">Adjust Strategy</a>
            </div>
          </div>
        </div>

        <div class="action-step">
          <div class="as-num">3</div>
          <div class="as-content">
            <div class="as-title">Step 3: Switch to Live Trading (when profitable)</div>
            <div class="as-desc">When you're confident, go to GitHub Actions variables and change <code>BOT_PAPER_TRADING</code> from <code>true</code> to <code>false</code>. The bot will then place real orders using your Binance API key.</div>
            <div class="as-actions">
              <a href="https://github.com/ishivamsoni150299/binance-trade/settings/variables/actions" target="_blank" class="as-btn secondary">GitHub Variables →</a>
            </div>
          </div>
        </div>

      </div>

      <!-- Indicators explained -->
      <div class="section-title">What do the indicators mean?</div>
      <div class="indicators-grid">
        <div class="ind-card">
          <div class="ic-name">RSI</div>
          <div class="ic-full">Relative Strength Index</div>
          <div class="ic-bar" style="background: rgba(59,130,246,0.3)"></div>
          <div class="ic-desc">Measures if BTC is <span class="buy">oversold</span> (good time to buy) or <span class="sell">overbought</span> (good time to sell). Uses 25% of the total score.</div>
        </div>
        <div class="ind-card">
          <div class="ic-name">MACD</div>
          <div class="ic-full">Moving Avg Convergence Divergence</div>
          <div class="ic-bar" style="background: rgba(139,92,246,0.3)"></div>
          <div class="ic-desc">Detects momentum shifts. When the fast line crosses above slow = <span class="buy">bullish</span>. Below = <span class="sell">bearish</span>. Uses 30% of the score.</div>
        </div>
        <div class="ind-card">
          <div class="ic-name">Bollinger</div>
          <div class="ic-full">Bollinger Bands</div>
          <div class="ic-bar" style="background: rgba(245,158,11,0.3)"></div>
          <div class="ic-desc">Price bands around a moving average. Price near <span class="buy">lower band</span> = buy signal. Near <span class="sell">upper band</span> = sell signal. Uses 25% of the score.</div>
        </div>
        <div class="ind-card">
          <div class="ic-name">EMA</div>
          <div class="ic-full">Exponential Moving Average</div>
          <div class="ic-bar" style="background: rgba(38,166,154,0.3)"></div>
          <div class="ic-desc">Two moving averages (fast + slow). Fast crosses above slow = <span class="buy">uptrend</span>. Below = <span class="sell">downtrend</span>. Uses 20% of the score.</div>
        </div>
      </div>

      <!-- FAQ -->
      <div class="section-title">Frequently asked questions</div>
      <div class="faq-list">
        <div class="faq-item">
          <div class="faq-q">Is my money safe right now?</div>
          <div class="faq-a">Yes. You are in <strong>Paper Trading mode</strong>. The bot only trades with a fake $10,000. No real Binance orders are being placed.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">What if the bot loses money in paper mode?</div>
          <div class="faq-a">That's fine — and actually useful. Go to <strong>Bot Config</strong> and adjust the strategy. Try different pairs (ETH, SOL), timeframes (1h, 4h), or tweak the RSI/EMA parameters.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How do I know the bot is running?</div>
          <div class="faq-a">Check <a href="https://github.com/ishivamsoni150299/binance-trade/actions" target="_blank">GitHub Actions</a> — you'll see a green checkmark every 5 minutes. Also check <code>trades.json</code> in the repo — it gets updated with each trade.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How much can I realistically make?</div>
          <div class="faq-a">In paper mode the bot uses 5% position size on a $10,000 balance = $500 per trade. With a good win rate (55-65%) and 2:1 risk/reward, expect 3-8% monthly return. <strong>But crypto is risky — never trade more than you can afford to lose.</strong></div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Can I run it on multiple coins?</div>
          <div class="faq-a">Currently one pair at a time. Change the pair in <strong>Bot Config</strong> or update <code>BOT_PAIR</code> in GitHub Actions variables. Multi-pair support is a future upgrade.</div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .page { padding: 24px; max-width: 1000px; animation: fadeIn 0.2s ease-out; }
    .page-header { margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 4px; }
    .subtitle { font-size: 14px; color: var(--text-muted); margin: 0; }

    /* Hero explainer */
    .explainer-hero {
      display: flex; gap: 20px; align-items: flex-start;
      background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08));
      border: 1px solid rgba(59,130,246,0.2);
      border-radius: 14px; padding: 24px; margin-bottom: 32px;
    }
    .eh-icon { font-size: 48px; flex-shrink: 0; }
    .eh-text h2 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
    .eh-text p { font-size: 14px; color: var(--text-secondary); margin: 0; line-height: 1.7; }

    /* Section title */
    .section-title {
      font-size: 11px; font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.1em;
      margin: 32px 0 14px; padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    /* Flow steps */
    .flow-steps { display: flex; align-items: flex-start; gap: 0; margin-bottom: 8px; }
    .flow-step {
      flex: 1; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px 16px; text-align: center; position: relative;
    }
    .flow-arrow { font-size: 20px; color: var(--text-muted); padding: 0 8px; margin-top: 40px; flex-shrink: 0; }
    .fs-num {
      position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
      width: 20px; height: 20px; border-radius: 50%; background: var(--blue);
      font-size: 11px; font-weight: 800; color: white;
      display: flex; align-items: center; justify-content: center;
    }
    .fs-icon { font-size: 28px; margin-bottom: 8px; }
    .fs-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    .fs-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

    /* Modes */
    .modes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .mode-card {
      border-radius: 12px; padding: 20px; border: 2px solid var(--border); position: relative;
    }
    .paper-card { border-color: rgba(38,166,154,0.4); background: rgba(38,166,154,0.06); }
    .live-card { background: var(--bg-card); }
    .mc-badge {
      position: absolute; top: -10px; left: 16px;
      background: var(--green); color: white;
      font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.05em;
    }
    .mc-icon { font-size: 32px; margin-bottom: 10px; }
    .mc-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
    .mc-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px; }
    .mc-status { font-size: 12px; font-weight: 600; color: var(--text-muted); }
    .mc-status.active { color: var(--green); }

    /* Auto grid */
    .auto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .auto-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px;
    }
    .ac-icon { font-size: 28px; margin-bottom: 10px; }
    .ac-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .ac-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px; }
    .ac-btn {
      font-size: 12px; color: var(--blue); text-decoration: none; font-weight: 600;
    }
    .ac-btn:hover { text-decoration: underline; }

    /* Action steps */
    .action-steps { display: flex; flex-direction: column; gap: 12px; }
    .action-step {
      display: flex; gap: 16px; align-items: flex-start;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 18px 20px;
    }
    .action-step.done { border-color: rgba(38,166,154,0.3); background: rgba(38,166,154,0.04); }
    .action-step.current { border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.05); }
    .as-check {
      width: 32px; height: 32px; border-radius: 50%; background: var(--green);
      color: white; font-size: 14px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .as-num {
      width: 32px; height: 32px; border-radius: 50%; background: var(--blue);
      color: white; font-size: 14px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .action-step:not(.done):not(.current) .as-num { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
    .as-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    .as-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 10px; }
    .as-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .as-btn {
      padding: 7px 16px; border-radius: 7px; font-size: 12px; font-weight: 600;
      text-decoration: none; display: inline-block;
    }
    .as-btn.primary { background: var(--blue); color: white; }
    .as-btn.secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
    .as-btn:hover { opacity: 0.85; }
    code { font-size: 11px; background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; color: var(--green); }

    /* Indicators */
    .indicators-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
    .ind-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .ic-name { font-size: 16px; font-weight: 800; margin-bottom: 2px; }
    .ic-full { font-size: 10px; color: var(--text-muted); margin-bottom: 10px; }
    .ic-bar { height: 3px; border-radius: 2px; margin-bottom: 10px; }
    .ic-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
    .buy { color: var(--green); font-weight: 600; }
    .sell { color: var(--red); font-weight: 600; }

    /* FAQ */
    .faq-list { display: flex; flex-direction: column; gap: 0; }
    .faq-item {
      padding: 16px 0; border-bottom: 1px solid var(--border);
    }
    .faq-item:last-child { border-bottom: none; }
    .faq-q { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .faq-a { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
    .faq-a a { color: var(--blue); text-decoration: none; }
    .faq-a a:hover { text-decoration: underline; }

    @media (max-width: 768px) {
      .flow-steps { flex-direction: column; }
      .flow-arrow { transform: rotate(90deg); margin: 4px auto; }
      .modes-grid, .auto-grid, .indicators-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class GuideComponent {}
