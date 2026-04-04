import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAccountInfo } from '../_lib/binance-client.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const account = await getAccountInfo();
    // Only return non-zero balances
    const balances = (account.balances ?? [])
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }))
      .sort((a: any, b: any) => b.total - a.total);

    res.json({ balances, timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
