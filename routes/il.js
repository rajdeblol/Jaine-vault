const express = require('express');
const { calculateIlResult } = require('../utils/il');

const router = express.Router();
const TICK_MIN = -887272;
const TICK_MAX = 887272;

function parseFiniteNumber(value) {
  if (Array.isArray(value) || value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

router.get('/', async (req, res) => {
  try {
    const { entryPrice, currentPrice, liquidity, tickLower, tickUpper } = req.query;

    const numeric = {
      entryPrice: parseFiniteNumber(entryPrice),
      currentPrice: parseFiniteNumber(currentPrice),
      liquidity: parseFiniteNumber(liquidity),
      tickLower: parseFiniteNumber(tickLower),
      tickUpper: parseFiniteNumber(tickUpper),
    };

    const required = ['entryPrice', 'currentPrice', 'liquidity', 'tickLower', 'tickUpper'];
    const invalidField = required.find((field) => numeric[field] === null);

    if (invalidField) {
      return res.status(400).json({
        error: `Invalid query param: ${invalidField}`,
      });
    }

    if (numeric.entryPrice <= 0 || numeric.currentPrice <= 0 || numeric.liquidity <= 0) {
      return res.status(400).json({
        error: 'entryPrice, currentPrice, and liquidity must be greater than 0',
      });
    }

    if (!Number.isInteger(numeric.tickLower) || !Number.isInteger(numeric.tickUpper)) {
      return res.status(400).json({
        error: 'tickLower and tickUpper must be integers',
      });
    }

    if (
      numeric.tickLower < TICK_MIN ||
      numeric.tickLower > TICK_MAX ||
      numeric.tickUpper < TICK_MIN ||
      numeric.tickUpper > TICK_MAX
    ) {
      return res.status(400).json({
        error: `tick bounds must be within ${TICK_MIN} and ${TICK_MAX}`,
      });
    }

    if (numeric.tickLower >= numeric.tickUpper) {
      return res.status(400).json({
        error: 'tickLower must be less than tickUpper',
      });
    }

    const result = calculateIlResult(numeric);

    return res.json({
      input: numeric,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to calculate IL',
      details: error.message,
    });
  }
});

module.exports = router;
