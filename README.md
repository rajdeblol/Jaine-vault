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
