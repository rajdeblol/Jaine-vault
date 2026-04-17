const express = require('express');
const { isValidAddress, normalizeAddress } = require('../services/chain');
const { getToken } = require('../services/gecko');

const router = express.Router();

function getErrorDetails(error) {
  if (error?.response?.status) {
    const upstream = error.response.data?.errors?.[0]?.title || error.response.statusText || 'Upstream error';
    return `GeckoTerminal ${error.response.status}: ${upstream}`;
  }
  return error.message;
}

router.get('/:address', async (req, res) => {
  try {
    const rawAddress = req.params.address;

    if (!isValidAddress(rawAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }
    const address = normalizeAddress(rawAddress);

    const data = await getToken(address);
    const attrs = data?.data?.attributes || {};

    return res.json({
      address,
      name: attrs.name,
      symbol: attrs.symbol,
      priceUsd: Number(attrs.price_usd || 0),
      marketCapUsd: Number(attrs.market_cap_usd || 0),
      fdvUsd: Number(attrs.fdv_usd || 0),
      change24hPercent: Number(attrs.price_change_percentage?.h24 || 0),
      volume24hUsd: Number(attrs.volume_usd?.h24 || 0),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch token data',
      details: getErrorDetails(error),
    });
  }
});

module.exports = router;
