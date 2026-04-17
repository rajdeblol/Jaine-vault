const express = require('express');
const { ethers } = require('ethers');
const {
  isValidAddress,
  normalizeAddress,
  getWalletPositionIds,
  getPosition,
  getPoolAddress,
  getPoolCurrentTick,
  getTokenMeta,
} = require('../services/chain');
const { getToken } = require('../services/gecko');
const { calculatePositionAmounts, calculateImpermanentLoss } = require('../utils/il');

const router = express.Router();

function parseTokenPrice(tokenResponse) {
  const token = tokenResponse?.data?.attributes;
  return Number(token?.price_usd || 0);
}

router.get('/:walletAddress', async (req, res) => {
  try {
    const rawWalletAddress = req.params.walletAddress;

    if (!isValidAddress(rawWalletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    const walletAddress = normalizeAddress(rawWalletAddress);

    const positionIds = await getWalletPositionIds(walletAddress);

    const positions = await Promise.all(
      positionIds.map(async (idBigInt) => {
        const tokenId = idBigInt.toString();
        const pos = await getPosition(idBigInt);

        const [meta0, meta1, token0Data, token1Data] = await Promise.all([
          getTokenMeta(pos.token0),
          getTokenMeta(pos.token1),
          getToken(pos.token0).catch(() => null),
          getToken(pos.token1).catch(() => null),
        ]);

        const price0Usd = parseTokenPrice(token0Data);
        const price1Usd = parseTokenPrice(token1Data);

        const poolAddress = await getPoolAddress(pos.token0, pos.token1, pos.fee);
        let currentTick = Number(pos.tickLower);

        if (poolAddress && poolAddress !== ethers.ZeroAddress) {
          const tickData = await getPoolCurrentTick(poolAddress);
          currentTick = tickData.tick;
        }

        const { amount0, amount1 } = calculatePositionAmounts({
          liquidity: pos.liquidity,
          tickLower: Number(pos.tickLower),
          tickUpper: Number(pos.tickUpper),
          currentTick,
        });

        const normalizedAmount0 = amount0 / Math.pow(10, meta0.decimals);
        const normalizedAmount1 = amount1 / Math.pow(10, meta1.decimals);

        const feesEarned0 = Number(ethers.formatUnits(pos.tokensOwed0, meta0.decimals));
        const feesEarned1 = Number(ethers.formatUnits(pos.tokensOwed1, meta1.decimals));

        const principalUsd = normalizedAmount0 * price0Usd + normalizedAmount1 * price1Usd;
        const feesUsd = feesEarned0 * price0Usd + feesEarned1 * price1Usd;
        const usdValue = principalUsd + feesUsd;

        const entryPrice = Math.pow(1.0001, (Number(pos.tickLower) + Number(pos.tickUpper)) / 2);
        const currentPrice = Math.pow(1.0001, currentTick);
        const ilPercent = calculateImpermanentLoss(entryPrice, currentPrice);

        return {
          tokenId,
          token0: {
            address: pos.token0,
            symbol: meta0.symbol,
          },
          token1: {
            address: pos.token1,
            symbol: meta1.symbol,
          },
          poolAddress,
          liquidity: pos.liquidity.toString(),
          tickLower: Number(pos.tickLower),
          tickUpper: Number(pos.tickUpper),
          feesEarned0,
          feesEarned1,
          usdValue: Number(usdValue.toFixed(4)),
          ilPercent: Number(ilPercent.toFixed(4)),
        };
      })
    );

    return res.json({
      walletAddress,
      chainId: 16661,
      count: positions.length,
      positions,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch positions',
      details: error.message,
    });
  }
});

module.exports = router;
