/**
 * Standalone bot runner - executed directly by GitHub Actions
 * GitHub servers are not blocked by Binance (unlike some hosting IPs)
 *
 * Run: npx ts-node scripts/bot-runner.ts
 * Env: BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_TESTNET, BOT_PAIR, BOT_TIMEFRAME
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Config from env
const API_KEY    = process.env['BINANCE_API_KEY'] ?? '';
const API_SECRET = process.env['BINANCE_API_SECRET'] ?? '';
const TESTNET    = process.env['BINANCE_TESTNET'] === 'true';
const PAIR       = process.env['BOT_PAIR'] ?? 'BTCUSDT';
const TIMEFRAME  = process.env['BOT_TIMEFRAME'] ?? '1h';
const PAPER      = process.env['BOT_PAPER_TRADING'] !== 'false'; // default paper=true
const STRATEGY  = (process.env['BOT_STRATEGY'] ?? 'COMPOSITE').toUpperCase();
const BUY_TH    = parseFloat(process.env['BOT_BUY_THRESHOLD'] ?? '0.5');
const SELL_TH   = parseFloat(process.env['BOT_SELL_THRESHOLD'] ?? '-0.5');

const BASE = TESTNET
  ? 'https://testnet.binance.vision/api'
  : 'https://api.binance.com/api';

// Public kline hosts — data.binance.vision is a CDN that bypasses geo-blocks
const PUBLIC_HOSTS = TESTNET
  ? ['https://testnet.binance.vision']
  : [
      'https://data-api.binance.vision',   // CDN endpoint, not geo-restricted
      'https://api.binance.com',
      'https://api1.binance.com',
      'https://api2.binance.com',
      'https://api3.binance.com',
    ];

// Binance helpers
function sign(qs: string): string {
  return crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
}

async function binanceRequest(method: string, endpoint: string, params: Record<string, any> = {}, signed = false): Promise<any> {
  let qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();

  if (signed) {
    qs += `&timestamp=${Date.now()}`;
    qs += `&signature=${sign(qs)}`;
  }

  const url = `${BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BTrader/1.0',
    },
    body: method === 'POST' ? qs : undefined,
    signal: AbortSignal.timeout(10000),
  });

  const text = await res.text();
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${data?.msg ?? text}`);
  return data;
}

async function getKlines(symbol: string, interval: string, limit = 200): Promise<number[][]> {
  for (const host of PUBLIC_HOSTS) {
    try {
      // data-api.binance.vision uses /api/v3/, others use /api/v3/
      const path = host.includes('data-api') ? '/api/v3/klines' : '/api/v3/klines';
      const url = `${host}${path}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 BTrader/1.0' },
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { continue; }
      if (Array.isArray(data) && data.length > 0) return data;
      if (data?.code === 0 || (data?.msg && data.msg.includes('restricted'))) {
        console.warn(`[${host}] geo-blocked (451):`, data.msg?.slice(0, 80) ?? 'blocked');
        continue; // try next host
      }
      console.warn(`[${host}] unexpected response:`, text.slice(0, 100));
    } catch (e: any) {
      console.warn(`[${host}] fetch error: ${e?.message ?? e}`);
    }
  }
  throw new Error('All Binance hosts failed — geo-restriction on this runner region');
}

async function getBalance(asset = 'USDT'): Promise<number> {
  const acc = await binanceRequest('GET', '/v3/account', {}, true);
  const bal = acc.balances?.find((b: any) => b.asset === asset);
  return parseFloat(bal?.free ?? '0');
}

async function getOpenOrders(symbol: string): Promise<any[]> {
  return binanceRequest('GET', '/v3/openOrders', { symbol }, true);
}

async function placeMarketOrder(symbol: string, side: 'BUY'|'SELL', quantity: number): Promise<any> {
  return binanceRequest('POST', '/v3/order', {
    symbol, side, type: 'MARKET', quantity: quantity.toFixed(5),
  }, true);
}

// Indicators
function calcEma(vals: number[], period: number): number[] {
  if (vals.length < period) return [];
  const k = 2 / (period + 1);
  let ema = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [ema];
  for (let i = period; i < vals.length; i++) {
    ema = vals[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function rsiScore(closes: number[], period = 14, oversold = 30, overbought = 70): number {
  if (closes.length < period + 1) return 0;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  if (rsi <= oversold) return 1;
  if (rsi >= overbought) return -1;
  return rsi < 50 ? (50 - rsi) / (50 - oversold) : -(rsi - 50) / (overbought - 50);
}

function macdScore(closes: number[]): number {
  const fast = calcEma(closes, 12), slow = calcEma(closes, 26);
  if (!fast.length || !slow.length) return 0;
  const macdVals = slow.map((s, i) => fast[i + (fast.length - slow.length)] - s);
  const signal = calcEma(macdVals, 9);
  if (!signal.length) return 0;
  const hist = macdVals[macdVals.length - 1] - signal[signal.length - 1];
  const scale = Math.abs(macdVals[macdVals.length - 1]) + 0.0001;
  return Math.max(-1, Math.min(1, (hist / scale) * 10));
}

function bollingerScore(closes: number[], period = 20, mult = 2): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
  const upper = mid + mult * std, lower = mid - mult * std;
  const cur = closes[closes.length - 1];
  const b = upper === lower ? 0.5 : (cur - lower) / (upper - lower);
  if (b <= 0) return 1;
  if (b >= 1) return -1;
  return b < 0.2 ? 0.7 : b > 0.8 ? -0.7 : (0.5 - b) * 2;
}

function emaScore(closes: number[], fast = 9, slow = 21): number {
  const f = calcEma(closes, fast), s = calcEma(closes, slow);
  if (f.length < 2 || s.length < 2) return 0;
  const crossedAbove = f[f.length - 2] <= s[s.length - 2] && f[f.length - 1] > s[s.length - 1];
  const crossedBelow = f[f.length - 2] >= s[s.length - 2] && f[f.length - 1] < s[s.length - 1];
  if (crossedAbove) return 1;
  if (crossedBelow) return -1;
  return Math.max(-0.5, Math.min(0.5, ((f[f.length - 1] - s[s.length - 1]) / s[s.length - 1]) * 50));
}

function compositeSignal(closes: number[]): { action: 'BUY'|'SELL'|'HOLD', score: number, rsi: number, macd: number, bb: number, ema: number } {
  const rsi = rsiScore(closes);
  const macd = macdScore(closes);
  const bb = bollingerScore(closes);
  const ema = emaScore(closes);
  const score = rsi * 0.25 + macd * 0.30 + bb * 0.25 + ema * 0.20;
  const action = score >= 0.5 ? 'BUY' : score <= -0.5 ? 'SELL' : 'HOLD';
  return { action, score, rsi, macd, bb, ema };
}

function actionFromScore(score: number): 'BUY'|'SELL'|'HOLD' {
  if (score >= BUY_TH) return 'BUY';
  if (score <= SELL_TH) return 'SELL';
  return 'HOLD';
}

function strategySignal(closes: number[]) {
  const rsi = rsiScore(closes);
  const macd = macdScore(closes);
  const bb = bollingerScore(closes);
  const ema = emaScore(closes);
  if (STRATEGY === 'COMPOSITE') return compositeSignal(closes);
  if (STRATEGY === 'RSI') return { action: actionFromScore(rsi), score: rsi, rsi, macd, bb, ema };
  if (STRATEGY === 'MACD') return { action: actionFromScore(macd), score: macd, rsi, macd, bb, ema };
  if (STRATEGY === 'BOLLINGER') return { action: actionFromScore(bb), score: bb, rsi, macd, bb, ema };
  if (STRATEGY === 'EMA') return { action: actionFromScore(ema), score: ema, rsi, macd, bb, ema };
  return compositeSignal(closes);
}

// Wallet snapshot (saved to wallet.json in repo)
const WALLET_FILE = path.join(process.cwd(), 'wallet.json');

async function saveWallet(): Promise<void> {
  if (PAPER || !API_KEY) {
    // Paper mode — do NOT overwrite wallet.json if it already has real data
    const existing = loadExistingWallet();
    if (existing && existing.isPaper === false) {
      console.log('Paper mode: keeping existing live wallet.json untouched');
      return;
    }
    const paperBalance = [{ asset: 'USDT', free: 10000, locked: 0, total: 10000 }];
    fs.writeFileSync(WALLET_FILE, JSON.stringify({ balances: paperBalance, isPaper: true, updatedAt: Date.now() }, null, 2));
    console.log('Paper wallet saved: $10,000 USDT (simulated)');
    return;
  }
  // Live mode: fetch real balances from Binance
  // Try multiple base URLs in case one is geo-blocked
  const SIGNED_HOSTS = [
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
  ];
  for (const host of SIGNED_HOSTS) {
    try {
      const params: Record<string, string> = { timestamp: String(Date.now()) };
      const qs = new URLSearchParams(params).toString();
      const sig = crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
      const url = `${host}/api/v3/account?${qs}&signature=${sig}`;
      const res = await fetch(url, {
        headers: { 'X-MBX-APIKEY': API_KEY, 'User-Agent': 'Mozilla/5.0 BTrader/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      const acc = JSON.parse(text);
      if (acc.code === 0 || (acc.msg && acc.msg.includes('restricted'))) {
        console.warn(`[${host}] account API geo-blocked`);
        continue;
      }
      if (!res.ok) { console.warn(`[${host}] account API error:`, acc.msg); continue; }
      const balances = (acc.balances ?? [])
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          total: parseFloat(b.free) + parseFloat(b.locked),
        }))
        .sort((a: any, b: any) => b.total - a.total);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ balances, isPaper: false, updatedAt: Date.now() }, null, 2));
      console.log(`Live wallet saved: ${balances.length} asset(s) from ${host}`);
      return;
    } catch (e: any) {
      console.warn(`[${host}] account fetch error: ${e.message}`);
    }
  }
  console.warn('Could not fetch live wallet from any host — keeping existing wallet.json');
}

function loadExistingWallet(): any {
  try { return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8')); } catch { return null; }
}

// Trade log (appended to trades.json in repo)
const TRADES_FILE = path.join(process.cwd(), 'trades.json');

function loadTrades(): any[] {
  try {
    return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
  } catch { return []; }
}

function saveTrade(trade: any): void {
  const trades = loadTrades();
  trades.unshift(trade);
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades.slice(0, 1000), null, 2));
  console.log('Trade saved to trades.json');
}

// Main
async function main() {
  console.log(`\n=== BTrader Bot [${new Date().toISOString()}] ===`);
  console.log(`Pair: ${PAIR} | Timeframe: ${TIMEFRAME} | Strategy: ${STRATEGY} | Mode: ${PAPER ? 'PAPER' : 'LIVE'} | Testnet: ${TESTNET}`);

  if (!PAPER && !API_KEY) {
    console.error('ERROR: BINANCE_API_KEY not set for live trading');
    process.exit(1);
  }

  // 1. Save wallet snapshot (runs every cycle so balance stays fresh)
  await saveWallet();

  // 2. Fetch candles
  const raw = await getKlines(PAIR, TIMEFRAME, 200);
  const closes = raw.map(k => parseFloat(String(k[4])));
  const currentPrice = closes[closes.length - 1];
  console.log(`Current price: $${currentPrice.toLocaleString()}`);

  // 2. Signal
  const signal = strategySignal(closes);
  console.log(`Signal: ${signal.action} | Score: ${(signal.score * 100).toFixed(0)} | RSI:${(signal.rsi * 100).toFixed(0)} MACD:${(signal.macd * 100).toFixed(0)} BB:${(signal.bb * 100).toFixed(0)} EMA:${(signal.ema * 100).toFixed(0)}`);

  if (signal.action === 'HOLD') {
    console.log('Action: HOLD - no trade');
    return;
  }

  // 3. Check existing open orders (avoid double-entry)
  let openOrders: any[] = [];
  if (!PAPER) {
    openOrders = await getOpenOrders(PAIR);
    if (openOrders.length > 0) {
      console.log(`Skipping: ${openOrders.length} open order(s) already exist`);
      return;
    }
  }

  // 4. Execute
  const positionSizePct = parseFloat(process.env['BOT_POSITION_SIZE_PCT'] ?? '5');
  const stopLossPct     = parseFloat(process.env['BOT_STOP_LOSS_PCT'] ?? '2');
  const takeProfitPct   = parseFloat(process.env['BOT_TAKE_PROFIT_PCT'] ?? '4');

  let balance = 10000; // Paper default
  if (!PAPER) balance = await getBalance('USDT');

  const riskAmount = balance * (positionSizePct / 100);
  const quantity   = riskAmount / currentPrice;
  const stopPrice  = signal.action === 'BUY'
    ? currentPrice * (1 - stopLossPct / 100)
    : currentPrice * (1 + stopLossPct / 100);
  const tpPrice    = signal.action === 'BUY'
    ? currentPrice * (1 + takeProfitPct / 100)
    : currentPrice * (1 - takeProfitPct / 100);

  const trade: any = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pair: PAIR,
    side: signal.action,
    strategy: STRATEGY,
    entryPrice: currentPrice,
    quantity,
    stopLossPrice: stopPrice,
    takeProfitPrice: tpPrice,
    fee: quantity * currentPrice * 0.001,
    status: 'open',
    openedAt: Date.now(),
    isPaper: PAPER,
    signalScore: signal.score,
    indicators: { rsi: signal.rsi, macd: signal.macd, bollinger: signal.bb, ema: signal.ema },
  };

  if (!PAPER) {
    const order = await placeMarketOrder(PAIR, signal.action, quantity);
    trade.binanceOrderId = order.orderId;
    trade.entryPrice = parseFloat(order.fills?.[0]?.price ?? String(currentPrice));
    trade.quantity = parseFloat(order.executedQty);
    console.log(`LIVE ORDER placed: ${signal.action} ${trade.quantity} ${PAIR} @ $${trade.entryPrice}`);
  } else {
    console.log(`PAPER trade: ${signal.action} ${quantity.toFixed(5)} ${PAIR} @ $${currentPrice}`);
  }

  saveTrade(trade);
  console.log(`Stop-loss: $${stopPrice.toFixed(2)} | Take-profit: $${tpPrice.toFixed(2)}`);
  console.log('=== Done ===\n');
}

main().catch(err => {
  console.error('Bot error:', err.message);
  // Exit 0 for network errors so GitHub Actions does not mark the run as failed
  const isNetworkError = err.message?.includes('Binance hosts failed') || err.message?.includes('fetch');
  process.exit(isNetworkError ? 0 : 1);
});
