/**
 * RebalanceX Rebalancing Engine
 * Calculates deviations and generates rebalancing actions
 */

import { CHAINS } from './config.js';
import { logger, logDecision } from './logger.js';
import { ethers } from 'ethers';
import type {
    ChainBalance,
    ChainName,
    Deviation,
    RebalanceAction,
    TargetAllocation,
} from './types.js';

/**
 * Calculate deviation from target for each chain
 */
export function calculateDeviations(
    currentBalances: ChainBalance[],
    targets: TargetAllocation[]
): Deviation[] {
    return currentBalances.map((balance) => {
        const target = targets.find((t) => t.chain === balance.chain);
        const targetPct = target?.percentage ?? 0;
        const deviation = balance.percentage - targetPct;

        return {
            chain: balance.chain,
            current: balance.percentage,
            target: targetPct,
            deviation,
        };
    });
}

/**
 * Check if rebalancing is needed based on threshold
 */
export function needsRebalancing(
    deviations: Deviation[],
    threshold: number
): boolean {
    return deviations.some((d) => Math.abs(d.deviation) > threshold);
}

/**
 * Generate rebalancing actions to move funds from over-allocated to under-allocated chains
 */
export function generateActions(
    currentBalances: ChainBalance[],
    targets: TargetAllocation[],
    threshold: number
): RebalanceAction[] {
    const deviations = calculateDeviations(currentBalances, targets);

    // Sort by deviation: positive (over-allocated) first, negative (under-allocated) last
    const sorted = [...deviations].sort((a, b) => b.deviation - a.deviation);

    const actions: RebalanceAction[] = [];
    const adjustments = new Map<ChainName, number>();

    // Initialize adjustments (how much each chain is over/under by in absolute terms)
    const totalBalance = currentBalances.reduce((sum, b) => sum + b.balance, 0n);

    for (const dev of sorted) {
        if (Math.abs(dev.deviation) > threshold) {
            // Calculate the amount needed to reach target
            const balance = currentBalances.find((b) => b.chain === dev.chain);
            if (balance) {
                const targetAmount = (totalBalance * BigInt(Math.round(dev.target * 100))) / 10000n;
                const adjustment = balance.balance - targetAmount;
                adjustments.set(dev.chain, Number(adjustment));
            }
        }
    }

    // Match over-allocated chains with under-allocated chains
    const overAllocated = sorted.filter((d) => d.deviation > threshold);
    const underAllocated = sorted.filter((d) => d.deviation < -threshold).reverse();

    let overIndex = 0;
    let underIndex = 0;

    while (overIndex < overAllocated.length && underIndex < underAllocated.length) {
        const from = overAllocated[overIndex]!;
        const to = underAllocated[underIndex]!;

        const fromBalance = currentBalances.find((b) => b.chain === from.chain)!;
        const toBalance = currentBalances.find((b) => b.chain === to.chain)!;

        // Calculate how much to transfer
        const targetFrom = (totalBalance * BigInt(Math.round(from.target * 100))) / 10000n;
        const targetTo = (totalBalance * BigInt(Math.round(to.target * 100))) / 10000n;

        const excessFrom = fromBalance.balance - targetFrom;
        const deficitTo = targetTo - toBalance.balance;

        // Transfer the minimum of excess and deficit
        const transferAmount = excessFrom < deficitTo ? excessFrom : deficitTo;

        if (transferAmount > 0n) {
            const fromConfig = CHAINS[from.chain];
            const toConfig = CHAINS[to.chain];

            actions.push({
                from: fromConfig,
                to: toConfig,
                amount: transferAmount,
                type: 'transfer',
            });

            logDecision(
                'TRANSFER',
                from.chain,
                to.chain,
                ethers.formatUnits(transferAmount, 6)
            );

            // Update running balances for next iteration
            fromBalance.balance -= transferAmount;
            toBalance.balance += transferAmount;
        }

        // Move to next pair
        if (excessFrom <= deficitTo) overIndex++;
        if (deficitTo <= excessFrom) underIndex++;
    }

    if (actions.length === 0) {
        logger.info('No rebalancing needed - all chains within threshold');
    } else {
        logger.info(`Generated ${actions.length} rebalancing action(s)`);
    }

    return actions;
}

/**
 * Parse target allocation string from CLI (e.g., "40,30,30")
 */
export function parseTargetAllocation(
    targetStr: string,
    chains: ChainName[]
): TargetAllocation[] {
    const percentages = targetStr.split(',').map((s) => parseFloat(s.trim()));

    if (percentages.length !== chains.length) {
        throw new Error(
            `Target allocation must have ${chains.length} values, got ${percentages.length}`
        );
    }

    const sum = percentages.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`Target allocation must sum to 100%, got ${sum}%`);
    }

    return chains.map((chain, i) => ({
        chain,
        percentage: percentages[i]!,
    }));
}
