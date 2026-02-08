/**
 * RebalanceX Arc/CCTP Executor
 * Cross-chain USDC transfers using Circle's CCTP
 * Enhanced with retry logic, gas estimation, and robust error handling
 */

import { ethers } from 'ethers';
import {
    CHAINS,
    ERC20_ABI,
    TOKEN_MESSENGER_ABI,
    MESSAGE_TRANSMITTER_ABI,
    ATTESTATION_API_URL,
    getPrivateKey,
} from '../config.js';
import { logger, logTransaction, logError } from '../logger.js';
import type { ChainConfig, RebalanceAction, TransferResult } from '../types.js';

// =============================================================================
// Configuration
// =============================================================================

const RETRY_CONFIG = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

const ATTESTATION_CONFIG = {
    maxAttempts: 120,        // 20 minutes at 10s intervals
    intervalMs: 10000,
    fastIntervalMs: 5000,    // faster polling initially
    fastPollAttempts: 12,    // 1 minute of fast polling
};

const GAS_CONFIG = {
    bufferPercent: 20,       // add 20% buffer to estimated gas
    maxGasLimit: 500000n,    // max gas limit for transactions
};

// =============================================================================
// Wallet Management
// =============================================================================

const walletCache = new Map<string, ethers.Wallet>();

function getWallet(chain: ChainConfig): ethers.Wallet {
    let wallet = walletCache.get(chain.name);
    if (!wallet) {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
        wallet = new ethers.Wallet(getPrivateKey(), provider);
        walletCache.set(chain.name, wallet);
    }
    return wallet;
}

function addressToBytes32(address: string): string {
    return ethers.zeroPadValue(address, 32);
}

// =============================================================================
// Retry Logic with Exponential Backoff
// =============================================================================

interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = RETRY_CONFIG.maxAttempts,
        initialDelayMs = RETRY_CONFIG.initialDelayMs,
        maxDelayMs = RETRY_CONFIG.maxDelayMs,
        backoffMultiplier = RETRY_CONFIG.backoffMultiplier,
        onRetry,
    } = options;

    let lastError: Error | undefined;
    let delayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxAttempts) {
                logger.error(`${operationName} failed after ${maxAttempts} attempts`, {
                    error: lastError.message,
                });
                throw lastError;
            }

            // Check if error is retryable
            if (!isRetryableError(lastError)) {
                logger.error(`${operationName} failed with non-retryable error`, {
                    error: lastError.message,
                });
                throw lastError;
            }

            logger.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`, {
                error: lastError.message,
            });

            onRetry?.(attempt, lastError, delayMs);

            await sleep(delayMs);
            delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
        }
    }

    throw lastError ?? new Error(`${operationName} failed unexpectedly`);
}

function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Non-retryable errors
    const nonRetryable = [
        'insufficient funds',
        'nonce too low',
        'replacement transaction underpriced',
        'already known',
        'invalid signature',
        'execution reverted',
    ];

    if (nonRetryable.some(msg => message.includes(msg))) {
        return false;
    }

    // Retryable errors
    const retryable = [
        'timeout',
        'network error',
        'rate limit',
        'server error',
        '502',
        '503',
        '504',
        'ETIMEDOUT',
        'ECONNRESET',
        'ENOTFOUND',
    ];

    return retryable.some(msg => message.includes(msg)) || true; // default to retryable
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Gas Estimation
// =============================================================================

interface GasEstimate {
    gasLimit: bigint;
    gasPrice: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    estimatedCost: bigint;
}

async function estimateGas(
    chain: ChainConfig,
    contract: ethers.Contract,
    method: string,
    args: unknown[]
): Promise<GasEstimate> {
    const wallet = getWallet(chain);
    const provider = wallet.provider;

    if (!provider) {
        throw new Error('No provider available');
    }

    // Estimate gas for the transaction
    const gasEstimate = await contract.getFunction(method).estimateGas(...args);

    // Add buffer
    const gasLimit = (gasEstimate * BigInt(100 + GAS_CONFIG.bufferPercent)) / 100n;
    const finalGasLimit = gasLimit > GAS_CONFIG.maxGasLimit ? GAS_CONFIG.maxGasLimit : gasLimit;

    // Get current gas prices
    const feeData = await provider.getFeeData();

    const result: GasEstimate = {
        gasLimit: finalGasLimit,
        gasPrice: feeData.gasPrice ?? 0n,
        estimatedCost: 0n,
    };

    // EIP-1559 support
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        result.maxFeePerGas = feeData.maxFeePerGas;
        result.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        result.estimatedCost = finalGasLimit * feeData.maxFeePerGas;
    } else {
        result.estimatedCost = finalGasLimit * (feeData.gasPrice ?? 0n);
    }

    logger.debug(`Gas estimate for ${method} on ${chain.name}`, {
        gasLimit: finalGasLimit.toString(),
        estimatedCost: ethers.formatEther(result.estimatedCost),
    });

    return result;
}

// =============================================================================
// USDC Operations
// =============================================================================

async function approveUSDC(
    chain: ChainConfig,
    amount: bigint
): Promise<string> {
    const wallet = getWallet(chain);
    const usdc = new ethers.Contract(chain.usdcAddress, ERC20_ABI, wallet);

    // Check current allowance
    const allowance = await usdc.getFunction('allowance')(wallet.address, chain.tokenMessenger) as bigint;

    if (allowance >= amount) {
        logger.info(`Sufficient allowance on ${chain.name}`);
        return '';
    }

    logger.info(`Approving USDC on ${chain.name}...`);

    return withRetry(
        async () => {
            // Estimate gas first
            const gasEstimate = await estimateGas(chain, usdc, 'approve', [chain.tokenMessenger, amount]);

            const tx = await usdc.getFunction('approve')(chain.tokenMessenger, amount, {
                gasLimit: gasEstimate.gasLimit,
            });
            const receipt = await tx.wait();

            logTransaction('APPROVE', chain.name, receipt.hash, {
                amount: amount.toString(),
                gasUsed: receipt.gasUsed?.toString(),
            });
            return receipt.hash as string;
        },
        `USDC Approval on ${chain.name}`,
        { maxAttempts: 3 }
    );
}

async function burnUSDC(
    fromChain: ChainConfig,
    toChain: ChainConfig,
    amount: bigint,
    recipient: string
): Promise<{ txHash: string; messageHash: string; messageBytes: string }> {
    const wallet = getWallet(fromChain);
    const tokenMessenger = new ethers.Contract(
        fromChain.tokenMessenger,
        TOKEN_MESSENGER_ABI,
        wallet
    );

    logger.info(`Burning ${ethers.formatUnits(amount, 6)} USDC on ${fromChain.name}...`);

    return withRetry(
        async () => {
            // Estimate gas
            const args = [
                amount,
                toChain.cctpDomain,
                addressToBytes32(recipient),
                fromChain.usdcAddress,
            ];
            const gasEstimate = await estimateGas(fromChain, tokenMessenger, 'depositForBurn', args);

            const tx = await tokenMessenger.getFunction('depositForBurn')(
                ...args,
                { gasLimit: gasEstimate.gasLimit }
            );

            const receipt = await tx.wait();

            // Extract message hash and bytes from MessageSent event
            const messageTransmitter = new ethers.Contract(
                fromChain.messageTransmitter,
                MESSAGE_TRANSMITTER_ABI,
                wallet.provider
            );

            let messageHash = '';
            let messageBytes = '';

            // Look for MessageSent event in logs
            const messageSentTopic = ethers.id('MessageSent(bytes)');

            for (const log of receipt.logs) {
                if (log.topics[0] === messageSentTopic) {
                    // Decode the message bytes
                    const abiCoder = new ethers.AbiCoder();
                    const decoded = abiCoder.decode(['bytes'], log.data);
                    messageBytes = decoded[0] as string;
                    messageHash = ethers.keccak256(messageBytes);
                    break;
                }
            }

            // Fallback: use tx hash as message identifier
            if (!messageHash) {
                messageHash = receipt.hash;
                logger.warn('Could not extract MessageSent event, using tx hash');
            }

            logTransaction('BURN', fromChain.name, receipt.hash, {
                amount: ethers.formatUnits(amount, 6),
                destination: toChain.name,
                messageHash,
                gasUsed: receipt.gasUsed?.toString(),
            });

            return { txHash: receipt.hash as string, messageHash, messageBytes };
        },
        `USDC Burn on ${fromChain.name}`,
        { maxAttempts: 3 }
    );
}

// =============================================================================
// Attestation Polling (Enhanced)
// =============================================================================

interface AttestationResult {
    attestation: string;
    message: string;
}

async function waitForAttestation(
    messageHash: string,
    options: Partial<typeof ATTESTATION_CONFIG> = {}
): Promise<AttestationResult> {
    const config = { ...ATTESTATION_CONFIG, ...options };

    logger.info(`Waiting for attestation...`, { messageHash: messageHash.slice(0, 20) + '...' });

    let attempt = 0;

    while (attempt < config.maxAttempts) {
        attempt++;

        // Use faster polling for first minute
        const intervalMs = attempt <= config.fastPollAttempts
            ? config.fastIntervalMs
            : config.intervalMs;

        try {
            const response = await fetch(`${ATTESTATION_API_URL}/${messageHash}`);

            if (!response.ok) {
                if (response.status === 404) {
                    logger.debug(`Attestation not ready (attempt ${attempt}/${config.maxAttempts})`);
                } else {
                    logger.warn(`Attestation API returned ${response.status}`);
                }
            } else {
                const data = await response.json() as {
                    status: string;
                    attestation?: string;
                    message?: string;
                };

                if (data.status === 'complete' && data.attestation && data.message) {
                    const waitTimeMinutes = ((attempt - 1) * intervalMs / 1000 / 60).toFixed(1);
                    logger.info(`✅ Attestation received after ${waitTimeMinutes} minutes`, {
                        attempts: attempt,
                    });
                    return { attestation: data.attestation, message: data.message };
                }

                if (data.status === 'pending_confirmations') {
                    logger.debug(`Pending confirmations (attempt ${attempt})`);
                }
            }
        } catch (error) {
            logger.warn(`Attestation API error (attempt ${attempt})`, {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // Progress update every 6 attempts (1 minute)
        if (attempt % 6 === 0) {
            const elapsedMinutes = (attempt * intervalMs / 1000 / 60).toFixed(1);
            logger.info(`Still waiting for attestation... (${elapsedMinutes} min elapsed)`);
        }

        await sleep(intervalMs);
    }

    throw new Error(`Attestation timeout after ${config.maxAttempts} attempts (~${config.maxAttempts * config.intervalMs / 1000 / 60} minutes)`);
}

// =============================================================================
// Message Receiving
// =============================================================================

async function receiveMessage(
    toChain: ChainConfig,
    message: string,
    attestation: string
): Promise<string> {
    const wallet = getWallet(toChain);
    const messageTransmitter = new ethers.Contract(
        toChain.messageTransmitter,
        MESSAGE_TRANSMITTER_ABI,
        wallet
    );

    logger.info(`Receiving message on ${toChain.name}...`);

    return withRetry(
        async () => {
            // Estimate gas
            const gasEstimate = await estimateGas(
                toChain,
                messageTransmitter,
                'receiveMessage',
                [message, attestation]
            );

            const tx = await messageTransmitter.getFunction('receiveMessage')(
                message,
                attestation,
                { gasLimit: gasEstimate.gasLimit }
            );
            const receipt = await tx.wait();

            logTransaction('MINT', toChain.name, receipt.hash, {
                gasUsed: receipt.gasUsed?.toString(),
            });
            return receipt.hash as string;
        },
        `Message receive on ${toChain.name}`,
        { maxAttempts: 3 }
    );
}

// =============================================================================
// Main Transfer Execution
// =============================================================================

export async function executeTransfer(
    action: RebalanceAction,
    dryRun = false
): Promise<TransferResult> {
    const { from, to, amount } = action;
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`CROSS-CHAIN TRANSFER`);
    logger.info(`${'='.repeat(60)}`);
    logger.info(`Amount: ${ethers.formatUnits(amount, 6)} USDC`);
    logger.info(`Route: ${from.name} → ${to.name}`);
    logger.info(`${'='.repeat(60)}\n`);

    if (dryRun) {
        logger.info('[DRY RUN] Would execute transfer, skipping...');
        return { success: true };
    }

    try {
        const wallet = getWallet(from);

        // Step 1: Approve
        logger.info('Step 1/4: Approving USDC...');
        await approveUSDC(from, amount);

        // Step 2: Burn on source chain
        logger.info('Step 2/4: Burning USDC on source chain...');
        const { txHash: burnTxHash, messageHash, messageBytes } = await burnUSDC(
            from,
            to,
            amount,
            wallet.address
        );

        // Step 3: Wait for attestation
        logger.info('Step 3/4: Waiting for Circle attestation...');
        const { attestation, message } = await waitForAttestation(messageHash);

        // Step 4: Mint on destination chain
        logger.info('Step 4/4: Minting USDC on destination chain...');
        const mintTxHash = await receiveMessage(to, message, attestation);

        const elapsedMs = Date.now() - startTime;
        const elapsedMinutes = (elapsedMs / 1000 / 60).toFixed(1);

        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`✅ TRANSFER COMPLETE`);
        logger.info(`${'='.repeat(60)}`);
        logger.info(`Duration: ${elapsedMinutes} minutes`);
        logger.info(`Burn TX: ${burnTxHash}`);
        logger.info(`Mint TX: ${mintTxHash}`);
        logger.info(`${'='.repeat(60)}\n`);

        return {
            success: true,
            burnTxHash,
            mintTxHash,
            messageHash,
        };
    } catch (error) {
        const elapsedMs = Date.now() - startTime;

        logError('Transfer failed', error, {
            from: from.name,
            to: to.name,
            amount: amount.toString(),
            elapsedMs,
        });

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// =============================================================================
// Utility Exports
// =============================================================================

export function getWalletAddress(chain: ChainConfig): string {
    return getWallet(chain).address;
}

export async function checkBalance(chain: ChainConfig): Promise<bigint> {
    const wallet = getWallet(chain);
    const usdc = new ethers.Contract(chain.usdcAddress, ERC20_ABI, wallet);
    return await usdc.getFunction('balanceOf')(wallet.address) as bigint;
}

export async function getNativeBalance(chain: ChainConfig): Promise<bigint> {
    const wallet = getWallet(chain);
    const provider = wallet.provider;
    if (!provider) throw new Error('No provider');
    return await provider.getBalance(wallet.address);
}
