import { Injectable, signal, computed } from '@angular/core';

export interface Credentials {
  apiKey: string;
  apiSecret: string;
  isLive: boolean;
  workerUrl: string; // Cloudflare Worker proxy URL
}

const STORAGE_KEY = 'btrade_credentials';

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly _creds = signal<Credentials>(this.load());

  readonly creds     = this._creds.asReadonly();
  readonly hasKeys   = computed(() => !!this._creds().apiKey && !!this._creds().apiSecret);
  readonly hasWorker = computed(() => !!this._creds().workerUrl?.trim());
  readonly isLive    = computed(() => this._creds().isLive && this.hasKeys());
  readonly isPaper   = computed(() => !this.isLive());

  /** Full proxy URL for a Binance API path, e.g. /api/v3/account */
  proxyUrl(path: string): string {
    const base = this._creds().workerUrl?.replace(/\/$/, '') ?? '';
    return base ? `${base}${path}` : '';
  }

  /** Whether the Worker proxy is configured and should be used */
  get useProxy(): boolean { return this.hasWorker(); }

  save(patch: Partial<Credentials>): void {
    const updated = { ...this._creds(), ...patch };
    this._creds.set(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  clear(): void {
    const cleared: Credentials = { apiKey: '', apiSecret: '', isLive: false, workerUrl: '' };
    this._creds.set(cleared);
    localStorage.removeItem(STORAGE_KEY);
  }

  async sign(queryString: string): Promise<string> {
    const secret = this._creds().apiSecret;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(queryString);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  get apiKey(): string { return this._creds().apiKey; }
  get workerUrl(): string { return this._creds().workerUrl ?? ''; }

  private load(): Credentials {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { apiKey: '', apiSecret: '', isLive: false, workerUrl: '', ...JSON.parse(raw) };
    } catch {}
    return { apiKey: '', apiSecret: '', isLive: false, workerUrl: '' };
  }
}
