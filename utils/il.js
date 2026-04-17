function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tickToPrice(tick) {
  return Math.pow(1.0001, Number(tick));
}

function calculateImpermanentLoss(entryPrice, currentPrice) {
  if (!entryPrice || !currentPrice || entryPrice <= 0 || currentPrice <= 0) {
    return 0;
  }

  const ratio = currentPrice / entryPrice;
  const il = (2 * Math.sqrt(ratio)) / (1 + ratio) - 1;
  return Math.abs(il) * 100;
}

function calculatePositionAmounts({ liquidity, tickLower, tickUpper, currentTick }) {
  const L = Number(liquidity);
  if (!L || L <= 0) {
    return { amount0: 0, amount1: 0 };
  }

  const sqrtPriceLower = Math.sqrt(tickToPrice(tickLower));
  const sqrtPriceUpper = Math.sqrt(tickToPrice(tickUpper));
  const sqrtPriceCurrent = Math.sqrt(tickToPrice(currentTick));

  let amount0 = 0;
  let amount1 = 0;

  if (currentTick <= tickLower) {
    amount0 = L * ((sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceLower * sqrtPriceUpper));
  } else if (currentTick >= tickUpper) {
    amount1 = L * (sqrtPriceUpper - sqrtPriceLower);
  } else {
    amount0 = L * ((sqrtPriceUpper - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceUpper));
    amount1 = L * (sqrtPriceCurrent - sqrtPriceLower);
  }

  return { amount0, amount1 };
}

function estimateFeesUsd({ feesEarned0, feesEarned1, price0Usd, price1Usd }) {
  const f0 = Number(feesEarned0 || 0);
  const f1 = Number(feesEarned1 || 0);
  return f0 * Number(price0Usd || 0) + f1 * Number(price1Usd || 0);
}

function calculateRiskScore({ tvlUsd, ageDays, volume24h, volume6h }) {
  const tvlScore = clamp((Number(tvlUsd || 0) / 5_000_000) * 40, 0, 40);
  const ageScore = clamp((Number(ageDays || 0) / 180) * 30, 0, 30);

  const v24 = Number(volume24h || 0);
  const v6 = Number(volume6h || 0);
  const projected24 = v6 * 4;
  const consistency = v24 <= 0 ? 0 : 1 - Math.abs(v24 - projected24) / Math.max(v24, projected24, 1);
  const consistencyScore = clamp(consistency * 30, 0, 30);

  return Number((tvlScore + ageScore + consistencyScore).toFixed(2));
}

function calculateIlResult({ entryPrice, currentPrice, liquidity, tickLower, tickUpper, feeApr = 0.2 }) {
  const ilPercent = calculateImpermanentLoss(entryPrice, currentPrice);
  const liquidityValue = Number(liquidity || 0) * Number(currentPrice || 0);
  const estimatedFees = liquidityValue * feeApr;
  const netPositionValue = liquidityValue - (liquidityValue * ilPercent) / 100 + estimatedFees;

  return {
    ilPercent: Number(ilPercent.toFixed(4)),
    estimatedFees: Number(estimatedFees.toFixed(4)),
    netPositionValue: Number(netPositionValue.toFixed(4)),
    range: {
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
    },
  };
}

module.exports = {
  tickToPrice,
  calculateImpermanentLoss,
  calculatePositionAmounts,
  estimateFeesUsd,
  calculateRiskScore,
  calculateIlResult,
};
