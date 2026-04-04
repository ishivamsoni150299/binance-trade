import type { VercelRequest, VercelResponse } from '@vercel/node';

const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

async function fetchWithFallback(path: string): Promise<any> {
  let lastError: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const url = `${host}${path}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; BTrader/1.0)',
        },
        signal: AbortSignal.timeout(8000),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${host}: ${text.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(data?.msg ?? `HTTP ${response.status}`);
      }

      return data;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('All Binance hosts failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols, window = '24h', type = 'MINI' } = req.query as Record<string, string>;

  try {
    if (symbols) {
      const path = `/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
      const data = await fetchWithFallback(path);
      return res.status(200).json(data);
    }

    const path = window === '24h'
      ? `/api/v3/ticker/24hr?type=${encodeURIComponent(type)}`
      : `/api/v3/ticker?windowSize=${encodeURIComponent(window)}&type=${encodeURIComponent(type)}`;

    const data = await fetchWithFallback(path);
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Failed to load tickers' });
  }
}
