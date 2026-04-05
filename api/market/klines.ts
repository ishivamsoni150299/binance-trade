import type { VercelRequest, VercelResponse } from '@vercel/node';

// Binance sometimes blocks AWS/Vercel IPs on the main domain.
// We try api.binance.com first, then fall back to api1/api2/api3 mirrors.
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: string,
  startTime?: string,
  endTime?: string,
): Promise<any[]> {
  let lastError: Error | null = null;

  for (const host of BINANCE_HOSTS) {
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries({ symbol, interval, limit, startTime, endTime }).filter(([, v]) => v !== undefined))
      ).toString();
      const url = `${host}/api/v3/klines?${qs}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; BTrader/1.0)',
        },
        signal: AbortSignal.timeout(8000),
      });

      const text = await response.text();

      // Guard: Binance returns error objects like {"code":-1121,"msg":"Invalid symbol."}
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${host}: ${text.slice(0, 200)}`);
      }

      if (!Array.isArray(data)) {
        // Binance error response
        throw new Error(data?.msg ?? `Unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
      }

      return data;
    } catch (err: any) {
      lastError = err;
      // Try next host
    }
  }

  throw lastError ?? new Error('All Binance hosts failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    symbol = 'BTCUSDT',
    interval = '1h',
    limit = '200',
    startTime,
    endTime,
  } = req.query as Record<string, string>;

  try {
    const raw = await fetchKlines(symbol, interval, limit, startTime, endTime);

    const candles = raw.map((k: any[]) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    return res.status(200).json(candles);
  } catch (err: any) {
    console.error('klines error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
