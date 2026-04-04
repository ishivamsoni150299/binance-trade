import { Injectable, signal, computed } from '@angular/core';
import { BotConfig, DEFAULT_BOT_CONFIG } from '../models/types';

const STORAGE_KEY = 'btrade_config';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly _config = signal<BotConfig>(this.load());

  readonly config = this._config.asReadonly();
  readonly isPaperTrading = computed(() => this._config().riskParams.paperTrading);
  readonly isEnabled = computed(() => this._config().enabled);
  readonly pair = computed(() => this._config().pair);
  readonly timeframe = computed(() => this._config().timeframe);

  update(patch: Partial<BotConfig>): void {
    const updated = { ...this._config(), ...patch };
    this._config.set(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  updateRisk(patch: Partial<BotConfig['riskParams']>): void {
    this.update({ riskParams: { ...this._config().riskParams, ...patch } });
  }

  updateStrategy(patch: Partial<BotConfig['strategyParams']>): void {
    this.update({ strategyParams: { ...this._config().strategyParams, ...patch } });
  }

  setEnabled(enabled: boolean): void {
    this.update({ enabled });
  }

  reset(): void {
    this._config.set(DEFAULT_BOT_CONFIG);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BOT_CONFIG));
  }

  private load(): BotConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_BOT_CONFIG, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_BOT_CONFIG };
  }
}
