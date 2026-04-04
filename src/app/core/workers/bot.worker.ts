/// <reference lib="webworker" />

let intervalId: ReturnType<typeof setInterval> | null = null;
let config: any = null;

self.onmessage = (evt) => {
  const { type, payload } = evt.data;

  switch (type) {
    case 'START':
      config = payload.config;
      if (intervalId) clearInterval(intervalId);
      runBotCycle(); // Run immediately
      intervalId = setInterval(runBotCycle, payload.intervalMs ?? 30000);
      break;

    case 'STOP':
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      break;

    case 'UPDATE_CONFIG':
      config = payload.config;
      break;
  }
};

async function runBotCycle(): Promise<void> {
  if (!config) return;

  try {
    self.postMessage({ type: 'CYCLE_START', timestamp: Date.now() });

    const response = await fetch('/api/bot/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Secret': config.botSecret ?? '',
      },
      body: JSON.stringify({
        pair: config.pair,
        timeframe: config.timeframe,
        strategyParams: config.strategyParams,
        riskParams: config.riskParams,
        paperTrading: config.riskParams?.paperTrading ?? true,
        openPositions: config.openPositions ?? 0,
        dailyPnlPct: config.dailyPnlPct ?? 0,
      }),
    });

    const result = await response.json();
    self.postMessage({ type: 'CYCLE_RESULT', result });
  } catch (err: any) {
    self.postMessage({ type: 'CYCLE_ERROR', error: err.message });
  }
}
