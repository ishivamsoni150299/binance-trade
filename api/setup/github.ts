import type { VercelRequest, VercelResponse } from '@vercel/node';

const REPO_OWNER = 'ishivamsoni150299';
const REPO_NAME  = 'binance-trade';

async function encryptSecret(publicKeyB64: string, secretValue: string): Promise<string> {
  const _sodium = await import('libsodium-wrappers');
  await _sodium.ready;
  const sodium = _sodium;
  const recipientKey = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(secretValue);
  const encrypted = sodium.crypto_box_seal(messageBytes, recipientKey);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

async function githubApi(token: string, method: string, path: string, body?: any) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data.message ?? `GitHub API ${res.status}: ${text.slice(0, 200)}`);
  return data;
}

async function setSecret(token: string, keyId: string, publicKey: string, name: string, value: string) {
  const encrypted_value = await encryptSecret(publicKey, value);
  await githubApi(token, 'PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/${name}`, {
    encrypted_value,
    key_id: keyId,
  });
}

async function setVariable(token: string, name: string, value: string) {
  try {
    await githubApi(token, 'PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/variables/${name}`, { name, value });
  } catch {
    await githubApi(token, 'POST', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/variables`, { name, value });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { githubToken, binanceApiKey, binanceApiSecret, paperTrading, positionSizePct, stopLossPct, takeProfitPct, botPair, botTimeframe } = req.body ?? {};

  if (!githubToken) return res.status(400).json({ error: 'githubToken is required' });

  const apiKey    = binanceApiKey    || process.env['BINANCE_API_KEY']    || '';
  const apiSecret = binanceApiSecret || process.env['BINANCE_API_SECRET'] || '';

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Binance API key and secret are required.' });
  }

  try {
    // 1. Get public key — note: correct path is /actions/secrets/public-key
    const pkData = await githubApi(githubToken, 'GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/public-key`);
    const { key_id, key } = pkData;

    // 2. Set secrets
    await setSecret(githubToken, key_id, key, 'BINANCE_API_KEY', apiKey);
    await setSecret(githubToken, key_id, key, 'BINANCE_API_SECRET', apiSecret);

    // 3. Set variables
    const isPaper = paperTrading === true || paperTrading === 'true';
    await setVariable(githubToken, 'BOT_PAPER_TRADING',      isPaper ? 'true' : 'false');
    await setVariable(githubToken, 'BINANCE_TESTNET',        'false');
    await setVariable(githubToken, 'BOT_POSITION_SIZE_PCT',  String(positionSizePct  ?? 15));
    await setVariable(githubToken, 'BOT_STOP_LOSS_PCT',      String(stopLossPct      ?? 1.5));
    await setVariable(githubToken, 'BOT_TAKE_PROFIT_PCT',    String(takeProfitPct    ?? 3));
    await setVariable(githubToken, 'BOT_PAIR',               botPair      ?? 'BTCUSDT');
    await setVariable(githubToken, 'BOT_TIMEFRAME',          botTimeframe ?? '1h');

    // 4. Trigger workflow immediately
    try {
      await githubApi(githubToken, 'POST', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/trading-bot.yml/dispatches`, {
        ref: 'main',
      });
    } catch { /* non-critical */ }

    return res.status(200).json({
      success: true,
      message: `GitHub configured. Bot triggered. Mode: ${isPaper ? 'PAPER' : 'LIVE'}.`,
      mode: isPaper ? 'paper' : 'live',
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Setup failed' });
  }
}
