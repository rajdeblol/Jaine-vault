const axios = require('axios');

const AI_PROVIDER = process.env.AI_PROVIDER || 'openrouter';
const MIMO_API_URL = process.env.MIMO_API_URL || '';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2-pro';
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2-pro';
const OPENROUTER_HTTP_REFERER = process.env.OPENROUTER_HTTP_REFERER || '';
const OPENROUTER_X_TITLE = process.env.OPENROUTER_X_TITLE || '0G Jaine Vault';
const AI_URL = process.env.AI_URL || '';
const AI_KEY = process.env.AI_KEY || '';
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  'You are a professional institutional DeFi portfolio manager. Provide precise, risk-aware, execution-ready recommendations with concise rationale.';

function resolveEndpoint() {
  if (AI_PROVIDER === 'openrouter') {
    return {
      url: OPENROUTER_API_URL || AI_URL,
      key: OPENROUTER_API_KEY || AI_KEY,
      model: OPENROUTER_MODEL || MIMO_MODEL || process.env.AI_MODEL || 'xiaomi/mimo-v2-pro',
      provider: 'openrouter',
    };
  }

  if (AI_PROVIDER === 'mimo') {
    return {
      url: MIMO_API_URL || AI_URL,
      key: MIMO_API_KEY || AI_KEY,
      model: MIMO_MODEL || process.env.AI_MODEL || 'mimo-v2-pro',
      provider: 'mimo',
    };
  }

  return {
    url: AI_URL || MIMO_API_URL,
    key: AI_KEY || MIMO_API_KEY,
    model: process.env.AI_MODEL || MIMO_MODEL || 'gpt-4o-mini',
    provider: 'generic',
  };
}

function isAiConfigured() {
  const cfg = resolveEndpoint();
  return Boolean(cfg.url && cfg.key);
}

function normalizeAiText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const choiceText = payload.choices?.[0]?.message?.content;
  if (typeof choiceText === 'string' && choiceText.trim()) {
    return choiceText.trim();
  }

  const dataText = payload.data?.[0]?.content?.[0]?.text;
  if (typeof dataText === 'string' && dataText.trim()) {
    return dataText.trim();
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  return '';
}

async function generateStrategy({ context, userRequest }) {
  if (!isAiConfigured()) {
    return null;
  }
  const cfg = resolveEndpoint();

  const prompt = [
    'User request:',
    userRequest,
    '',
    'Live DeFi context (JSON):',
    JSON.stringify(context, null, 2),
    '',
    'Return strict JSON with keys:',
    '- summary: short executive summary',
    '- actions: array of concrete execution steps (at least 4)',
    '- risks: array of key portfolio and market risks',
    '- opportunities: array of high-conviction opportunities',
    '- confidence: number from 0 to 1',
    '',
    'Requirements:',
    '- Strategy must explicitly reflect riskProfile in context.',
    '- Use professional language appropriate for a portfolio manager.',
    '- Include allocation and rebalancing intent in actions.',
    '- Do not include markdown.',
  ].join('\n');

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  };

  const headers = {
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
  };
  if (cfg.provider === 'openrouter') {
    if (OPENROUTER_HTTP_REFERER) {
      headers['HTTP-Referer'] = OPENROUTER_HTTP_REFERER;
    }
    if (OPENROUTER_X_TITLE) {
      headers['X-Title'] = OPENROUTER_X_TITLE;
    }
  }

  async function requestOnce() {
    return axios.post(cfg.url, body, {
      headers,
      timeout: 20_000,
    });
  }

  let response;
  try {
    response = await requestOnce();
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 429) {
      const retryAfterHeader = Number(error?.response?.headers?.['retry-after'] || 0);
      const retryMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 1200;
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      response = await requestOnce();
    } else {
      throw error;
    }
  }

  const text = normalizeAiText(response.data);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_err) {
    return {
      summary: text,
      actions: [],
      risks: [],
      opportunities: [],
      confidence: 0.45,
    };
  }
}

module.exports = {
  resolveEndpoint,
  isAiConfigured,
  generateStrategy,
};
