const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://evmrpc.0g.ai';

const ADDRESSES = {
  w0g: '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  factory: '0x6F3945Ab27296D1D66D8EEb042ff1B4fb2E0CE70',
  positionManager: '0x5143ba6007C197b4cF66c20601b9dB97E0F98c6A',
  swapRouter: '0x18cCa38E51c4C339A6BD6e174025f08360FEEf30',
  quoterV2: '0x23b55293b7F06F6c332a0dDA3D88d8921218425B',
};

const provider = new ethers.JsonRpcProvider(RPC_URL, {
  name: '0g-mainnet',
  chainId: 16661,
});

const positionManagerAbi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)',
];

const factoryAbi = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

const poolAbi = [
  'function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)',
];

const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const positionManager = new ethers.Contract(ADDRESSES.positionManager, positionManagerAbi, provider);
const factory = new ethers.Contract(ADDRESSES.factory, factoryAbi, provider);

function isValidAddress(address) {
  return typeof address === 'string' && ethers.isAddress(address);
}

function normalizeAddress(address) {
  return ethers.getAddress(address);
}

async function getWalletPositionIds(walletAddress) {
  const count = await positionManager.balanceOf(walletAddress);
  const ids = [];

  for (let i = 0n; i < count; i += 1n) {
    const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
    ids.push(tokenId);
  }

  return ids;
}

async function getPosition(tokenId) {
  return positionManager.positions(tokenId);
}

async function getPoolAddress(token0, token1, fee) {
  return factory.getPool(token0, token1, fee);
}

async function getPoolCurrentTick(poolAddress) {
  const pool = new ethers.Contract(poolAddress, poolAbi, provider);
  const slot0 = await pool.slot0();
  return {
    sqrtPriceX96: slot0[0],
    tick: Number(slot0[1]),
  };
}

async function getTokenMeta(tokenAddress) {
  const token = new ethers.Contract(tokenAddress, erc20Abi, provider);

  const [decimals, symbol] = await Promise.all([
    token.decimals().catch(() => 18),
    token.symbol().catch(() => 'UNKNOWN'),
  ]);

  return { decimals: Number(decimals), symbol };
}

module.exports = {
  provider,
  ADDRESSES,
  isValidAddress,
  normalizeAddress,
  getWalletPositionIds,
  getPosition,
  getPoolAddress,
  getPoolCurrentTick,
  getTokenMeta,
};
