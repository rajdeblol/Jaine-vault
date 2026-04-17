const express = require('express');
const { getPools, getJainePools } = require('../services/gecko');
const { calculateRiskScore } = require('../utils/il');

const router = express.Router();

function getErrorDetails(error) {
  if (error?.response?.status) {
    const upstream = error.response.data?.errors?.[0]?.title || error.response.statusText || 'Upstream error';
    return `GeckoTerminal ${error.response.status}: ${upstream}`;
  }
  return error.message;
}

function parsePool(pool) {
  const attrs = pool?.attributes || {};
  const relationships = pool?.relationships || {};
  const includedTokens = relationships?.tokens?.data || [];

  const extractAddress = (value) => {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
  };

  const tvl = Number(attrs.reserve_in_usd || 0);
  const volume24h = Number(attrs.volume_usd?.h24 || 0);
  const volume6h = Number(attrs.volume_usd?.h6 || 0);
  const feeTierPct = Number(attrs.swap_fee || attrs.fee_percentage || 0.003);

  const createdAt = attrs.pool_created_at ? new Date(attrs.pool_created_at) : null;
  const ageDays = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24) : 0;

  const apyEstimate = tvl > 0 ? ((volume24h * feeTierPct * 365) / tvl) * 100 : 0;
  const riskScore = calculateRiskScore({
    tvlUsd: tvl,
    ageDays,
    volume24h,
    volume6h,
  });

  return {
    poolAddress: attrs.address,
    pairName: attrs.name,
    token0Address: extractAddress(includedTokens[0]?.id),
    token1Address: extractAddress(includedTokens[1]?.id),
    apyEstimate: Number(apyEstimate.toFixed(2)),
    tvlUsd: Number(tvl.toFixed(2)),
    volume24hUsd: Number(volume24h.toFixed(2)),
    feeTier: feeTierPct,
    riskScore,
    dex: relationships?.dex?.data?.id || 'unknown',
  };
}

router.get('/', async (_req, res) => {
  try {
    const data = await getPools(1);
    const pools = (data?.data || []).map(parsePool);

    return res.json({
      network: 'zero-gravity',
      count: pools.length,
      pools,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch pools',
      details: getErrorDetails(error),
    });
  }
});

router.get('/jaine', async (_req, res) => {
  try {
    const data = await getJainePools(1);
    const pools = (data?.data || [])
      .map((pool) => ({
        ...parsePool(pool),
        flag: 'JAINE_BOOSTED',
      }))
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    return res.json({
      dex: 'jaine',
      count: pools.length,
      pools,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch JAINE pools',
      details: getErrorDetails(error),
    });
  }
});

module.exports = router;
