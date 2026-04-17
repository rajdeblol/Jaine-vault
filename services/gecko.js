const axios = require('axios');

const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const CACHE_TTL_MS = 30_000;
const MAX_CALLS_PER_MINUTE = 10;
const GECKO_NETWORK = process.env.GECKO_NETWORK || 'zero-gravity';
const GECKO_JAINE_DEX = process.env.GECKO_JAINE_DEX || 'jaine';

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
});

const cache = new Map();
const requestTimestamps = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheKey(path, params = {}) {
  const ordered = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  return `${path}?${JSON.stringify(ordered)}`;
}

async function enforceRateLimit() {
  const now = Date.now();

  while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= 60_000) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_CALLS_PER_MINUTE) {
    const waitMs = 60_000 - (now - requestTimestamps[0]) + 5;
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    return enforceRateLimit();
  }

  requestTimestamps.push(Date.now());
}

async function get(path, params = {}) {
  const key = cacheKey(path, params);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  await enforceRateLimit();
  const response = await http.get(path, { params });

  cache.set(key, {
    data: response.data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return response.data;
}

async function getPools(page = 1) {
  return get(`/networks/${GECKO_NETWORK}/pools`, { page });
}

async function getJainePools(page = 1) {
  return get(`/networks/${GECKO_NETWORK}/dexes/${GECKO_JAINE_DEX}/pools`, { page });
}

async function getToken(address) {
  return get(`/networks/${GECKO_NETWORK}/tokens/${address}`);
}

async function getPoolOhlcv(poolAddress) {
  return get(`/networks/${GECKO_NETWORK}/pools/${poolAddress}/ohlcv/hour`);
}

module.exports = {
  get,
  getPools,
  getJainePools,
  getToken,
  getPoolOhlcv,
};
