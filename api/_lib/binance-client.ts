import * as crypto from 'node:crypto';

const BASE_URL = process.env['BINANCE_TESTNET'] === 'true'
  ? 'https://testnet.binance.vision/api'
  : 'https://api.binance.com/api';

const API_KEY = process.env['BINANCE_API_KEY'] ?? '';
const API_SECRET = process.env['BINANCE_API_SECRET'] ?? '';

function sign(queryString: string): string {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

async function request(method: string, path: string, params: Record<string, any> = {}, signed = false): Promise<any> {
  let qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();

  if (signed) {
    const timestamp = Date.now();
    qs += `&timestamp=${timestamp}`;
    qs += `&signature=${sign(qs)}`;
  }

  const url = `${BASE_URL}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; BTrader/1.0)',
    },
    body: method === 'POST' ? qs : undefined,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Binance API ${res.status}: ${err}`);
  }

  return res.json();
}

// Public klines don't need API key — try all Binance hosts for reliability
const PUBLIC_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

export async function getKlines(symbol: string, interval: string, limit = 200): Promise<number[][]> {
  // Use testnet if configured
  if (process.env['BINANCE_TESTNET'] === 'true') {
    return request('GET', '/v3/klines', { symbol, interval, limit });
  }

  let lastError: Error | null = null;
  for (const host of PUBLIC_HOSTS) {
    try {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BTrader/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error(data?.msg ?? 'Non-array response');
      return data;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('All Binance hosts failed for klines');
}

export async function getAccountInfo(): Promise<any> {
  return request('GET', '/v3/account', {}, true);
}

export async function getOpenOrders(symbol: string): Promise<any[]> {
  return request('GET', '/v3/openOrders', { symbol }, true);
}

export async function placeOrder(
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
): Promise<any> {
  return request('POST', '/v3/order', {
    symbol,
    side,
    type: 'MARKET',
    quantity: quantity.toFixed(6),
  }, true);
}

export async function placeOcoOrder(
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  stopPrice: number,
  stopLimitPrice: number,
): Promise<any> {
  return request('POST', '/v3/order/oco', {
    symbol,
    side,
    quantity: quantity.toFixed(6),
    price: price.toFixed(2),
    stopPrice: stopPrice.toFixed(2),
    stopLimitPrice: stopLimitPrice.toFixed(2),
    stopLimitTimeInForce: 'GTC',
  }, true);
}

export async function cancelOrder(symbol: string, orderId: number): Promise<any> {
  return request('DELETE', '/v3/order', { symbol, orderId }, true);
}

export async function getAvailableBalance(asset = 'USDT'): Promise<number> {
  const account = await getAccountInfo();
  const balance = account.balances?.find((b: any) => b.asset === asset);
  return parseFloat(balance?.free ?? '0');
}
