/**
 * Cloudflare Worker — Binance API Proxy
 *
 * Secrets (set via: wrangler secret put BINANCE_API_KEY):
 *   BINANCE_API_KEY
 *   BINANCE_API_SECRET
 *
 * All requests are signed server-side. API keys never exposed to browser.
 * Deploy: wrangler deploy
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
};

const ALLOWED_PATHS = [
  '/api/v3/account',
  '/api/v3/order',
  '/api/v3/openOrders',
  '/api/v3/myTrades',
  '/api/v3/userDataStream',
  '/api/v3/ticker/price',
  '/api/v3/klines',
  '/api/v3/exchangeInfo',
  '/api/v3/time',
];

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const SIGNED_ENDPOINTS = [
  '/api/v3/account',
  '/api/v3/order',
  '/api/v3/openOrders',
  '/api/v3/myTrades',
];

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'binance-proxy' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Security: only proxy allowed Binance endpoints
    if (!ALLOWED_PATHS.some(p => path.startsWith(p))) {
      return new Response(JSON.stringify({ error: 'Endpoint not allowed' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
      return new Response(JSON.stringify({ error: 'API keys not configured in Worker secrets' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const needsSignature = SIGNED_ENDPOINTS.some(p => path.startsWith(p));

    try {
      const params = new URLSearchParams(url.search);
      let bodyParams = new URLSearchParams();

      // For POST/DELETE, parse body params too
      if (request.method === 'POST' || request.method === 'DELETE') {
        const bodyText = await request.text();
        if (bodyText) {
          bodyParams = new URLSearchParams(bodyText);
          bodyParams.forEach((v, k) => params.set(k, v));
        }
      }

      if (needsSignature) {
        params.set('timestamp', Date.now().toString());
        const qs = params.toString();
        const signature = await hmacSha256(env.BINANCE_API_SECRET, qs);
        params.set('signature', signature);
      }

      const binanceUrl = `https://api.binance.com${path}?${params.toString()}`;

      const binanceResp = await fetch(binanceUrl, {
        method: request.method,
        headers: {
          'X-MBX-APIKEY': env.BINANCE_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 BTrader/1.0',
        },
      });

      const responseText = await binanceResp.text();

      return new Response(responseText, {
        status: binanceResp.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message ?? 'Proxy error' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
