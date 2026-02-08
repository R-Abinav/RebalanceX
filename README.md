# RebalanceX

**Autonomous multi-chain USDC treasury rebalancer using Circle CCTP + Uniswap v4**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-ISC-yellow)](./LICENSE)

## Problem

Manual treasury rebalancing across chains is:
- 🐌 **Slow** - Requires constant monitoring
- 💸 **Expensive** - Gas fees on multiple chains
- ⚠️ **Error-prone** - Manual coordination is risky

## Solution

RebalanceX is a **CLI agent** that automatically maintains target USDC allocations:
- 📊 **Monitors** balances across Sepolia, Polygon Amoy, Arbitrum Sepolia
- 🧮 **Calculates** deviations from target allocation
- 🔄 **Executes** cross-chain transfers via Circle CCTP (burn-and-mint)
- 📝 **Logs** all decisions and transactions

## Quick Start

```bash
# Clone and install
git clone https://github.com/R-Abinav/RebalanceX.git
cd RebalanceX
npm install

# Configure environment
cp .env.example .env
# Edit .env with your private key and RPC URLs

# Run in dry-run mode (no execution)
npm run dev -- --target "40,30,30" --threshold 5 --dry-run

# Run for real on testnet
npm run dev -- --target "40,30,30" --threshold 5 --once
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --target` | Target allocation (e.g., "40,30,30") | `40,30,30` |
| `-T, --threshold` | Rebalance threshold % | `5` |
| `-i, --interval` | Check interval (seconds) | `60` |
| `-d, --dry-run` | Simulate without executing | `false` |
| `-o, --once` | Run once and exit | `false` |
| `-c, --chains` | Comma-separated chains | `sepolia,polygonAmoy,arbitrumSepolia` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Interface                         │
│                     (index.ts)                           │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────┐           ┌─────────────────┐
│   Monitor     │           │    Engine       │
│ (monitor.ts)  │──────────▶│  (engine.ts)    │
│ Fetch USDC    │           │  Calculate      │
│ balances      │           │  deviations     │
└───────────────┘           └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  Arc Executor   │
                            │  (arc.ts)       │
                            │  CCTP transfers │
                            └─────────────────┘
```

## Testing

```bash
# Run unit tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

## Environment Variables

See [.env.example](.env.example) for all required variables:
- `PRIVATE_KEY` - Wallet private key
- `SEPOLIA_RPC_URL` - Sepolia RPC endpoint
- `POLYGON_AMOY_RPC_URL` - Polygon Amoy RPC endpoint
- `ARBITRUM_SEPOLIA_RPC_URL` - Arbitrum Sepolia RPC endpoint

## Testnets

Get testnet USDC from [Circle Faucet](https://faucet.circle.com/)

| Chain | USDC Address |
|-------|--------------|
| Sepolia | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Polygon Amoy | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| Arbitrum Sepolia | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

## Stack

- **Runtime**: Node.js + TypeScript
- **Blockchain**: ethers.js v6
- **Cross-chain**: Circle CCTP (burn-and-mint)
- **CLI**: Commander.js
- **Logging**: Winston
- **Testing**: Jest

## License

ISC
