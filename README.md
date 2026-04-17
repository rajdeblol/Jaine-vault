# 0G DeFi Dashboard Backend

Node.js + Express backend using real on-chain data (0G RPC) and live GeckoTerminal APIs.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

If GeckoTerminal changes network/dex slugs, update `GECKO_NETWORK` / `GECKO_JAINE_DEX` in `.env`.

## Security Notes

- Store environment values in backend `.env` only.
- Never commit `.env` (it is ignored via `.gitignore`).
- Frontend code does not contain API keys or private keys.

## Endpoints

- `GET /` (JAINE Yield Hub frontend)
- `GET /health`
- `GET /positions/:walletAddress`
- `GET /pools`
- `GET /pools/jaine`
- `GET /token/:address`
- `GET /il-calculator?entryPrice=&currentPrice=&liquidity=&tickLower=&tickUpper=`
- `GET /ai/health`
- `POST /ai/agent/strategy`

## AI Agent Feature

`POST /ai/agent/strategy` builds a live strategy from:
- Gecko pool + JAINE pool data
- Optional wallet LP snapshot (if `walletAddress` is provided)
- Risk profile (`conservative`, `balanced`, `aggressive`)

OpenRouter + MiMo integration is supported via:
- `AI_PROVIDER=openrouter`
- `OPENROUTER_API_URL` (default: `https://openrouter.ai/api/v1/chat/completions`)
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (use: `xiaomi/mimo-v2-pro`)
- optional: `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`

Direct MiMo endpoint mode is also available via:
- `AI_PROVIDER=mimo`
- `MIMO_API_URL`, `MIMO_API_KEY`, `MIMO_MODEL`

If MiMo vars are not set, it falls back to `AI_URL` + `AI_KEY`.
If not configured, it returns a deterministic rule-based strategy from live data.
