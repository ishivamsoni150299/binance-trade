import { Injectable, signal, computed } from '@angular/core';

export interface Credentials {
  apiKey: string;
  apiSecret: string;
  isLive: boolean; // false = paper, true = live real money
}

const STORAGE_KEY = 'btrade_credentials';

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly _creds = signal<Credentials>(this.load());

  readonly creds = this._creds.asReadonly();
  readonly hasKeys = computed(() => !!this._creds().apiKey && !!this._creds().apiSecret);
  readonly isLive = computed(() => this._creds().isLive && this.hasKeys());
  readonly isPaper = computed(() => !this.isLive());

  save(patch: Partial<Credentials>): void {
    const updated = { ...this._creds(), ...patch };
    this._creds.set(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  clear(): void {
    const cleared: Credentials = { apiKey: '', apiSecret: '', isLive: false };
    this._creds.set(cleared);
    localStorage.removeItem(STORAGE_KEY);
  }

  // Sign a Binance API request query string
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

  private load(): Credentials {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { apiKey: '', apiSecret: '', isLive: false, ...JSON.parse(raw) };
    } catch {}
    return { apiKey: '', apiSecret: '', isLive: false };
  }
}
