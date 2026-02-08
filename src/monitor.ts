/**
 * RebalanceX Balance Monitor
 * Fetches USDC balances across multiple chains
 */

import { ethers } from 'ethers';
import { CHAINS, ERC20_ABI } from './config.js';
import { logger, logBalance } from './logger.js';
import type { ChainBalance, ChainName, ChainConfig } from './types.js';

// Cache providers to avoid recreating
const providerCache = new Map<ChainName, ethers.JsonRpcProvider>();

/**
 * Get or create a provider for a chain
 */
function getProvider(chain: ChainConfig): ethers.JsonRpcProvider {
    let provider = providerCache.get(chain.name);
    if (!provider) {
        provider = new ethers.JsonRpcProvider(chain.rpcUrl);
        providerCache.set(chain.name, provider);
    }
    return provider;
}

/**
 * Fetch USDC balance for a single chain
 */
export async function getBalance(
    chain: ChainConfig,
    walletAddress: string
): Promise<bigint> {
    const provider = getProvider(chain);
    const usdc = new ethers.Contract(chain.usdcAddress, ERC20_ABI, provider);

    try {
        const balance = await usdc.getFunction('balanceOf')(walletAddress) as bigint;
        return balance;
    } catch (error) {
        logger.error(`Failed to fetch balance on ${chain.name}`, { error });
        return 0n;
    }
}

/**
 * Fetch USDC balances from all configured chains
 */
export async function getAllBalances(
    walletAddress: string,
    chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia']
): Promise<ChainBalance[]> {
    logger.info('Fetching balances from all chains...');

    const balancePromises = chains.map(async (chainName) => {
        const chain = CHAINS[chainName];
        const balance = await getBalance(chain, walletAddress);
        return { chain: chainName, balance };
    });

    const results = await Promise.all(balancePromises);
    // Return with placeholder percentage (calculated by calculateAllocations)
    return results.map(r => ({ ...r, percentage: 0 }));
}

/**
 * Calculate allocation percentages from balances
 */
export function calculateAllocations(balances: ChainBalance[]): ChainBalance[] {
    const total = balances.reduce((sum, b) => sum + b.balance, 0n);

    if (total === 0n) {
        return balances.map((b) => ({ ...b, percentage: 0 }));
    }

    return balances.map((b) => {
        // Calculate percentage with 2 decimal precision
        const percentage = Number((b.balance * 10000n) / total) / 100;
        logBalance(b.chain, ethers.formatUnits(b.balance, 6), percentage);
        return { ...b, percentage };
    });
}

/**
 * Get current state: balances with allocation percentages
 */
export async function getCurrentState(
    walletAddress: string,
    chains?: ChainName[]
): Promise<ChainBalance[]> {
    const balances = await getAllBalances(walletAddress, chains);
    return calculateAllocations(balances);
}
