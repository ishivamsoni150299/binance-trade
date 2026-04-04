export interface RiskParams {
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
}

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  positionSize?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export function checkRisk(
  params: RiskParams,
  currentPrice: number,
  availableBalance: number,
  openPositions: number,
  dailyPnlPct: number,
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

  const riskAmount = availableBalance * (params.positionSizePct / 100);
  const positionSize = riskAmount / currentPrice;
  const stopLossPrice = currentPrice * (1 - params.stopLossPct / 100);
  const takeProfitPrice = currentPrice * (1 + params.takeProfitPct / 100);

  return {
    allowed: true,
    positionSize,
    stopLossPrice,
    takeProfitPrice,
  };
}
