/**
 * RebalanceX CLI Entry Point
 * Main agent loop with Commander.js CLI
 */

import { Command } from 'commander';
import { ethers } from 'ethers';
import { CHAINS, DEFAULT_THRESHOLD, DEFAULT_INTERVAL } from './config.js';
import { getCurrentState } from './monitor.js';
import { generateActions, parseTargetAllocation, needsRebalancing, calculateDeviations } from './engine.js';
import { executeTransfer, getWalletAddress } from './executors/arc.js';
import { logger } from './logger.js';
import type { ChainName, AgentOptions } from './types.js';

const program = new Command();

// CLI configuration
program
    .name('rebalancex')
    .description('Autonomous multi-chain USDC treasury rebalancer')
    .version('1.0.0')
    .option('-t, --target <allocation>', 'Target allocation percentages (e.g., "40,30,30")', '40,30,30')
    .option('-T, --threshold <percent>', 'Rebalance threshold in %', String(DEFAULT_THRESHOLD))
    .option('-i, --interval <seconds>', 'Check interval in seconds', String(DEFAULT_INTERVAL))
    .option('-d, --dry-run', 'Simulate without executing transfers', false)
    .option('-c, --chains <chains>', 'Comma-separated chain names', 'sepolia,polygonAmoy,arbitrumSepolia')
    .option('-o, --once', 'Run once and exit', false);

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main rebalancing cycle
 */
async function rebalanceCycle(
    walletAddress: string,
    chains: ChainName[],
    options: AgentOptions
): Promise<boolean> {
    logger.info('\n' + '─'.repeat(60));
    logger.info(`🔍 Checking balances at ${new Date().toISOString()}`);
    logger.info('─'.repeat(60));

    // Get current state
    const currentState = await getCurrentState(walletAddress, chains);

    // Parse targets
    const targets = parseTargetAllocation(options.target, chains);

    // Calculate deviations
    const deviations = calculateDeviations(currentState, targets);

    // Log current vs target
    logger.info('\n📊 Current vs Target Allocation:');
    for (const dev of deviations) {
        const status = Math.abs(dev.deviation) > options.threshold ? '⚠️' : '✅';
        logger.info(
            `  ${status} ${dev.chain}: ${dev.current.toFixed(2)}% → ${dev.target}% (${dev.deviation > 0 ? '+' : ''}${dev.deviation.toFixed(2)}%)`
        );
    }

    // Check if rebalancing needed
    if (!needsRebalancing(deviations, options.threshold)) {
        logger.info('\n✅ Portfolio is balanced. No action needed.');
        return false;
    }

    // Generate actions
    logger.info('\n🔧 Generating rebalancing actions...');
    const actions = generateActions(currentState, targets, options.threshold);

    if (actions.length === 0) {
        logger.info('No actions generated.');
        return false;
    }

    // Log actions
    logger.info(`\n📋 ${actions.length} action(s) to execute:`);
    for (const action of actions) {
        logger.info(
            `  • Transfer ${ethers.formatUnits(action.amount, 6)} USDC: ${action.from.name} → ${action.to.name}`
        );
    }

    // Execute actions
    if (options.dryRun) {
        logger.info('\n🏃 [DRY RUN] Simulating execution...');
    } else {
        logger.info('\n🚀 Executing transfers...');
    }

    let hasError = false;
    for (const action of actions) {
        const result = await executeTransfer(action, options.dryRun);
        if (!result.success) {
            logger.error(`❌ Transfer failed: ${result.error}`);
            hasError = true;
        }
    }

    return !hasError;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    program.parse();
    const opts = program.opts();

    const options: AgentOptions = {
        target: opts['target'] as string,
        threshold: parseFloat(opts['threshold'] as string),
        interval: parseInt(opts['interval'] as string, 10),
        dryRun: opts['dryRun'] as boolean,
    };

    const chainNames = (opts['chains'] as string).split(',') as ChainName[];
    const runOnce = opts['once'] as boolean;

    // Validate chains
    for (const chain of chainNames) {
        if (!CHAINS[chain]) {
            logger.error(`Unknown chain: ${chain}`);
            process.exit(1);
        }
    }

    // Get wallet address (assumes same address across all chains)
    const walletAddress = getWalletAddress(CHAINS[chainNames[0]!]!);

    logger.info('═'.repeat(60));
    logger.info('🔄 RebalanceX - Multi-Chain Treasury Rebalancer');
    logger.info('═'.repeat(60));
    logger.info(`📍 Wallet: ${walletAddress}`);
    logger.info(`🎯 Target: ${options.target}`);
    logger.info(`📏 Threshold: ${options.threshold}%`);
    logger.info(`⏱️  Interval: ${options.interval}s`);
    logger.info(`🔗 Chains: ${chainNames.join(', ')}`);
    logger.info(`🏃 Dry Run: ${options.dryRun}`);
    logger.info('═'.repeat(60));

    // Handle graceful shutdown
    let running = true;
    process.on('SIGINT', () => {
        logger.info('\n🛑 Shutting down gracefully...');
        running = false;
    });

    // Main loop
    while (running) {
        try {
            await rebalanceCycle(walletAddress, chainNames, options);
        } catch (error) {
            logger.error('Rebalance cycle failed:', error);
        }

        if (runOnce) {
            logger.info('\n👋 Single run complete. Exiting.');
            break;
        }

        logger.info(`\n⏳ Next check in ${options.interval} seconds...`);
        await sleep(options.interval * 1000);
    }
}

// Run
main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
});
