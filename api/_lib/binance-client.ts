import * as crypto from 'crypto';

const BASE_URL = process.env['BINANCE_TESTNET'] === 'true'
  ? 'https://testnet.binance.vision/api'
  : 'https://api.binance.com/api';

const API_KEY = process.env['BINANCE_API_KEY'] ?? '';
const API_SECRET = process.env['BINANCE_API_SECRET'] ?? '';

function sign(queryString: string): string {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

async function request(method: string, path: string, params: Record<string, any> = {}, signed = false): Promise<any> {
  let qs = new URLSearchParams(params).toString();

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
    },
    body: method === 'POST' ? qs : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Binance API ${res.status}: ${err}`);
  }

  return res.json();
}

export async function getKlines(symbol: string, interval: string, limit = 200): Promise<number[][]> {
  return request('GET', '/v3/klines', { symbol, interval, limit });
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
