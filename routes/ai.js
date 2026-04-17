const express = require('express');
const { isValidAddress, normalizeAddress } = require('../services/chain');
const { getPools, getJainePools } = require('../services/gecko');
const { getWalletPositionIds, getPosition } = require('../services/chain');
const { calculateImpermanentLoss } = require('../utils/il');
const { generateStrategy, isAiConfigured, resolveEndpoint } = require('../services/ai');

const router = express.Router();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function summarizePools(pools) {
  if (!pools.length) {
    return {
      totalTvl: 0,
      avgApy: 0,
      bestApyPool: null,
      avgRiskScore: 0,
    };
  }

  const totalTvl = pools.reduce((acc, p) => acc + toNumber(p.tvlUsd), 0);
  const avgApy = pools.reduce((acc, p) => acc + toNumber(p.apyEstimate), 0) / pools.length;
  const avgRiskScore = pools.reduce((acc, p) => acc + toNumber(p.riskScore), 0) / pools.length;

  const bestApyPool = [...pools].sort((a, b) => toNumber(b.apyEstimate) - toNumber(a.apyEstimate))[0] || null;

  return {
    totalTvl: Number(totalTvl.toFixed(2)),
    avgApy: Number(avgApy.toFixed(2)),
    bestApyPool,
    avgRiskScore: Number(avgRiskScore.toFixed(2)),
  };
}

function normalizeRiskProfile(input) {
  const value = String(input || 'moderate').toLowerCase().trim();
  if (value === 'aggressive') return 'aggressive';
  if (value === 'conservative') return 'conservative';
  if (value === 'balanced') return 'moderate';
  if (value === 'moderate') return 'moderate';
  return 'moderate';
}

async function getWalletSnapshot(walletAddress) {
  if (!walletAddress) {
    return {
      walletAddress: null,
      count: 0,
      totalLiquidity: '0',
      avgIlPercent: 0,
    };
  }

  if (!isValidAddress(walletAddress)) {
    throw new Error('Invalid walletAddress');
  }

  const normalized = normalizeAddress(walletAddress);
  const ids = await getWalletPositionIds(normalized);

  if (!ids.length) {
    return {
      walletAddress: normalized,
      count: 0,
      totalLiquidity: '0',
      avgIlPercent: 0,
    };
  }

  const positions = await Promise.all(ids.map((id) => getPosition(id)));

  const ilValues = positions.map((pos) => {
    const entryPrice = Math.pow(1.0001, (Number(pos.tickLower) + Number(pos.tickUpper)) / 2);
    const currentPrice = entryPrice;
    return calculateImpermanentLoss(entryPrice, currentPrice);
  });

  const avgIl = ilValues.reduce((acc, v) => acc + v, 0) / Math.max(ilValues.length, 1);

  const totalLiquidity = positions.reduce((acc, pos) => acc + BigInt(pos.liquidity.toString()), 0n);

  return {
    walletAddress: normalized,
    count: positions.length,
    totalLiquidity: totalLiquidity.toString(),
    avgIlPercent: Number(avgIl.toFixed(4)),
  };
}

function ruleBasedStrategy({ market, jaine, wallet, riskProfile }) {
  const actions = [];
  const risks = [];
  const opportunities = [];
  let allocationPlan = '';
  let rebalancePolicy = '';

  if (market.bestApyPool) {
    opportunities.push(`Highest APY currently: ${market.bestApyPool.pairName} at ${market.bestApyPool.apyEstimate}%.`);
  }

  if (toNumber(market.avgRiskScore) < 40) {
    risks.push('Overall pool risk profile is elevated. Favor tighter position sizing and shorter rebalance windows.');
  }

  if (riskProfile === 'conservative') {
    allocationPlan = '70% stable/high-liquidity pools, 20% medium-risk pools, 10% tactical JAINE exposure.';
    rebalancePolicy = 'Rebalance weekly; hard stop any pool if liquidity drops >20% or volume collapses for 2 consecutive days.';
  } else if (riskProfile === 'aggressive') {
    allocationPlan = '35% stable pools, 25% core medium-risk pairs, 40% high-yield tactical positions (including JAINE boosted).';
    rebalancePolicy = 'Rebalance every 48h; rotate 10-15% capital from bottom decile APY into top quartile adjusted-by-risk pools.';
  } else {
    allocationPlan = '55% stable/high-liquidity pools, 30% medium-risk pools, 15% tactical JAINE boosted positions.';
    rebalancePolicy = 'Rebalance every 72h; shift up to 8% capital per rebalance cycle based on APY-risk spread.';
  }

  if (wallet.count === 0) {
    actions.push('Open an initial two-leg position plan: one stable pair + one growth pair, each entered in two tranches.');
  } else {
    actions.push(`Portfolio currently has ${wallet.count} LP positions; migrate the lowest-performing 20% into higher risk-adjusted yield pools.`);
  }
  actions.push(`Allocation policy (${riskProfile}): ${allocationPlan}`);
  actions.push(`Execution policy: ${rebalancePolicy}`);
  actions.push('Set an IL alert threshold at 3.5% and fee recapture check every 24h for active positions.');

  if (jaine.bestApyPool) {
    opportunities.push(`JAINE boosted leader: ${jaine.bestApyPool.pairName} at ${jaine.bestApyPool.apyEstimate}% APY.`);
    actions.push('Set an auto-review trigger when JAINE boosted APY drops by >20% from current level or risk score falls below 45.');
  }

  return {
    summary: `Professional ${riskProfile} strategy generated from live pool and wallet context with explicit allocation and rebalance policy.`,
    actions,
    risks,
    opportunities,
    confidence: riskProfile === 'aggressive' ? 0.66 : 0.72,
  };
}

router.get('/health', (_req, res) => {
  const endpoint = resolveEndpoint();
  res.json({
    aiConfigured: isAiConfigured(),
    provider: endpoint.provider,
    model: endpoint.model,
    hasOpenRouterUrl: Boolean(process.env.OPENROUTER_API_URL),
    hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
    hasMimoUrl: Boolean(process.env.MIMO_API_URL),
    hasMimoKey: Boolean(process.env.MIMO_API_KEY),
    hasAiUrl: Boolean(process.env.AI_URL),
    hasAiKey: Boolean(process.env.AI_KEY),
    hasSystemPrompt: Boolean(process.env.SYSTEM_PROMPT),
  });
});

router.post('/agent/strategy', async (req, res) => {
  try {
    const { walletAddress = null, riskProfile = 'moderate', userRequest = 'Build a professional DeFi strategy for my wallet.' } = req.body || {};
    const normalizedRiskProfile = normalizeRiskProfile(riskProfile);

    const [poolsData, jaineData, walletSnapshot] = await Promise.all([
      getPools(1),
      getJainePools(1),
      getWalletSnapshot(walletAddress),
    ]);

    const pools = (poolsData?.data || []).map((pool) => {
      const attrs = pool?.attributes || {};
      return {
        pairName: attrs.name,
        apyEstimate: toNumber(attrs.volume_usd?.h24) > 0 && toNumber(attrs.reserve_in_usd) > 0
          ? Number((((toNumber(attrs.volume_usd?.h24) * toNumber(attrs.swap_fee || attrs.fee_percentage || 0.003) * 365) / toNumber(attrs.reserve_in_usd)) * 100).toFixed(2))
          : 0,
        tvlUsd: toNumber(attrs.reserve_in_usd),
        riskScore: 50,
      };
    });

    const jainePools = (jaineData?.data || []).map((pool) => {
      const attrs = pool?.attributes || {};
      return {
        pairName: attrs.name,
        apyEstimate: toNumber(attrs.volume_usd?.h24) > 0 && toNumber(attrs.reserve_in_usd) > 0
          ? Number((((toNumber(attrs.volume_usd?.h24) * toNumber(attrs.swap_fee || attrs.fee_percentage || 0.003) * 365) / toNumber(attrs.reserve_in_usd)) * 100).toFixed(2))
          : 0,
        tvlUsd: toNumber(attrs.reserve_in_usd),
        riskScore: 55,
      };
    });

    const market = summarizePools(pools);
    const jaine = summarizePools(jainePools);

    const context = {
      generatedAt: new Date().toISOString(),
      network: {
        chainId: 16661,
        geckoNetwork: poolsData?._meta?.network || null,
        geckoJaineDex: jaineData?._meta?.dex || null,
      },
      riskProfile: normalizedRiskProfile,
      market,
      jaine,
      wallet: walletSnapshot,
    };

    const aiResult = await generateStrategy({
      context,
      userRequest,
    });

    const strategy = aiResult || ruleBasedStrategy({ market, jaine, wallet: walletSnapshot, riskProfile: normalizedRiskProfile });

    return res.json({
      ok: true,
      aiEnabled: Boolean(aiResult),
      context,
      strategy,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate AI strategy',
      details: error.message,
    });
  }
});

module.exports = router;
