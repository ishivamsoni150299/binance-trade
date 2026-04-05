export interface RiskParams {
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  dynamicPositionSizing?: boolean;
  minPositionSizePct?: number;
  maxPositionSizePct?: number;
  volatilityTargetPct?: number;
}

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  positionSize?: number;
  positionSizePct?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export function computePositionSizePct(
  params: RiskParams,
  signalScore?: number,
  volatilityPct?: number,
): number {
  const base = params.positionSizePct;
  if (!params.dynamicPositionSizing || signalScore === undefined) return base;

  const strength = Math.min(1, Math.abs(signalScore));
  const volTarget = params.volatilityTargetPct ?? 2;
  const minPct = params.minPositionSizePct ?? Math.min(1, base);
  const maxPct = params.maxPositionSizePct ?? base;

  let volFactor = 1;
  if (volatilityPct && volatilityPct > 0) {
    volFactor = volTarget / volatilityPct;
  }
  volFactor = Math.max(0.5, Math.min(1.5, volFactor));

  let sizePct = base * strength * volFactor;
  sizePct = Math.max(minPct, Math.min(maxPct, sizePct));
  return sizePct;
}

export function checkRisk(
  params: RiskParams,
  currentPrice: number,
  availableBalance: number,
  openPositions: number,
  dailyPnlPct: number,
  side: 'BUY' | 'SELL' = 'BUY',
  signalScore?: number,
  volatilityPct?: number,
): RiskCheck {
  if (dailyPnlPct <= -params.maxDailyLossPct) {
    return { allowed: false, reason: `Daily loss limit reached (${dailyPnlPct.toFixed(2)}%)` };
  }

  if (openPositions >= params.maxOpenPositions) {
    return { allowed: false, reason: `Max open positions reached (${openPositions})` };
  }

  if (availableBalance <= 0) {
    return { allowed: false, reason: 'No available balance' };
  }

  const positionSizePct = computePositionSizePct(params, signalScore, volatilityPct);
  const riskAmount = availableBalance * (positionSizePct / 100);
  const positionSize = riskAmount / currentPrice;
  const stopLossPrice = side === 'BUY'
    ? currentPrice * (1 - params.stopLossPct / 100)
    : currentPrice * (1 + params.stopLossPct / 100);
  const takeProfitPrice = side === 'BUY'
    ? currentPrice * (1 + params.takeProfitPct / 100)
    : currentPrice * (1 - params.takeProfitPct / 100);

  return {
    allowed: true,
    positionSize,
    positionSizePct,
    stopLossPrice,
    takeProfitPrice,
  };
}
