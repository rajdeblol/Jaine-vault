require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const positionsRoute = require('./routes/positions');
const poolsRoute = require('./routes/pools');
const tokenRoute = require('./routes/token');
const ilRoute = require('./routes/il');
const aiRoute = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    network: '0G Chain Mainnet',
    chainId: 16661,
    timestamp: new Date().toISOString(),
  });
});

app.use('/positions', positionsRoute);
app.use('/pools', poolsRoute);
app.use('/token', tokenRoute);
app.use('/il-calculator', ilRoute);
app.use('/ai', aiRoute);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({
    error: 'Unhandled server error',
    details: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`0G DeFi backend running on port ${PORT}`);
});
