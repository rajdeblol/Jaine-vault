const axios = require('axios');

const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const CACHE_TTL_MS = 30_000;
const MAX_CALLS_PER_MINUTE = 10;
const GECKO_NETWORK = process.env.GECKO_NETWORK || 'zero-gravity';
const GECKO_JAINE_DEX = process.env.GECKO_JAINE_DEX || 'jaine';
const GECKO_NETWORKS = process.env.GECKO_NETWORKS || '';
const GECKO_JAINE_DEXES = process.env.GECKO_JAINE_DEXES || '';

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

function unique(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function getNetworkCandidates() {
  const envList = GECKO_NETWORKS.split(',');
  return unique([GECKO_NETWORK, ...envList, 'zero-gravity', '0g', 'zg', 'zog']);
}

function getDexCandidates() {
  const envList = GECKO_JAINE_DEXES.split(',');
  return unique([GECKO_JAINE_DEX, ...envList, 'jaine']);
}

function isNotFound(error) {
  return Number(error?.response?.status) === 404;
}

async function getAcrossNetworks(pathBuilder, params = {}) {
  const networks = getNetworkCandidates();
  let lastError = null;

  for (const network of networks) {
    try {
      const data = await get(pathBuilder(network), params);
      return {
        ...data,
        _meta: {
          network,
        },
      };
    } catch (error) {
      lastError = error;
      if (isNotFound(error)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No Gecko network candidates available');
}

async function getAcrossNetworkDex(pathBuilder, params = {}) {
  const networks = getNetworkCandidates();
  const dexes = getDexCandidates();
  let lastError = null;

  for (const network of networks) {
    for (const dex of dexes) {
      try {
        const data = await get(pathBuilder(network, dex), params);
        return {
          ...data,
          _meta: {
            network,
            dex,
          },
        };
      } catch (error) {
        lastError = error;
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No Gecko network/dex candidates available');
}

async function getPools(page = 1) {
  return getAcrossNetworks((network) => `/networks/${network}/pools`, { page });
}

async function getJainePools(page = 1) {
  return getAcrossNetworkDex((network, dex) => `/networks/${network}/dexes/${dex}/pools`, { page });
}

async function getToken(address) {
  return getAcrossNetworks((network) => `/networks/${network}/tokens/${address}`);
}

async function getPoolOhlcv(poolAddress) {
  return getAcrossNetworks((network) => `/networks/${network}/pools/${poolAddress}/ohlcv/hour`);
}

module.exports = {
  get,
  getPools,
  getJainePools,
  getToken,
  getPoolOhlcv,
};
