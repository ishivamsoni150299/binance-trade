import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'node:crypto';

const REPO_OWNER = 'ishivamsoni150299';
const REPO_NAME  = 'binance-trade';

// Encrypt a secret value using the repo's public key (libsodium sealed box via tweetnacl)
async function encryptSecret(publicKeyB64: string, secretValue: string): Promise<string> {
  const sodium = await import('tweetnacl');
  const { encodeUTF8, decodeBase64, encodeBase64 } = await import('tweetnacl-util');

  const recipientPublicKey = decodeBase64(publicKeyB64);
  const messageBytes = encodeUTF8(secretValue);

  // Generate ephemeral keypair
  const ephemeralKeypair = sodium.box.keyPair();

  // Compute shared key
  const sharedKey = sodium.box.before(recipientPublicKey, ephemeralKeypair.secretKey);

  // Encrypt (sealed box = ephemeral pubkey + box)
  const nonce = sodium.randomBytes(sodium.box.nonceLength);
  const encrypted = sodium.box.after(messageBytes, nonce, sharedKey);

  // GitHub expects: ephemeralPublicKey(32) + nonce(24) + ciphertext
  const result = new Uint8Array(32 + 24 + encrypted.length);
  result.set(ephemeralKeypair.publicKey, 0);
  result.set(nonce, 32);
  result.set(encrypted, 56);

  return encodeBase64(result);
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
  const encrypted = await encryptSecret(publicKey, value);
  await githubApi(token, 'PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/${name}`, {
    encrypted_value: encrypted,
    key_id: keyId,
  });
}

async function setVariable(token: string, name: string, value: string) {
  // Try update first, then create
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

  const { githubToken, binanceApiKey, binanceApiSecret, paperTrading, positionSizePct, stopLossPct, takeProfitPct } = req.body ?? {};

  if (!githubToken) return res.status(400).json({ error: 'githubToken is required' });

  // Use keys from request body, or fall back to Vercel env vars
  const apiKey    = binanceApiKey    || process.env['BINANCE_API_KEY']    || '';
  const apiSecret = binanceApiSecret || process.env['BINANCE_API_SECRET'] || '';

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Binance API key and secret are required. Set them here or in Vercel environment variables.' });
  }

  try {
    // 1. Get repo public key for secret encryption
    const pkData = await githubApi(githubToken, 'GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/public-key`);
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
    await setVariable(githubToken, 'BOT_PAIR',               'BTCUSDT');
    await setVariable(githubToken, 'BOT_TIMEFRAME',          '1h');

    // 4. Trigger workflow run immediately
    try {
      await githubApi(githubToken, 'POST', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/trading-bot.yml/dispatches`, {
        ref: 'main',
      });
    } catch { /* non-critical */ }

    return res.status(200).json({
      success: true,
      message: `GitHub configured. Secrets set. Bot triggered. Mode: ${isPaper ? 'PAPER' : 'LIVE'}.`,
      mode: isPaper ? 'paper' : 'live',
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Setup failed' });
  }
}
