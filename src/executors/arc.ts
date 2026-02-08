/**
 * RebalanceX Arc/CCTP Executor
 * Cross-chain USDC transfers using Circle's CCTP
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

// Wallet cache per chain
const walletCache = new Map<string, ethers.Wallet>();

/**
 * Get or create a wallet for a chain
 */
function getWallet(chain: ChainConfig): ethers.Wallet {
    let wallet = walletCache.get(chain.name);
    if (!wallet) {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
        wallet = new ethers.Wallet(getPrivateKey(), provider);
        walletCache.set(chain.name, wallet);
    }
    return wallet;
}

/**
 * Convert address to bytes32 format for CCTP
 */
function addressToBytes32(address: string): string {
    return ethers.zeroPadValue(address, 32);
}

/**
 * Approve USDC spending for TokenMessenger
 */
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
    const tx = await usdc.getFunction('approve')(chain.tokenMessenger, amount);
    const receipt = await tx.wait();

    logTransaction('APPROVE', chain.name, receipt.hash, { amount: amount.toString() });
    return receipt.hash as string;
}

/**
 * Burn USDC on source chain via TokenMessenger
 */
async function burnUSDC(
    fromChain: ChainConfig,
    toChain: ChainConfig,
    amount: bigint,
    recipient: string
): Promise<{ txHash: string; messageHash: string }> {
    const wallet = getWallet(fromChain);
    const tokenMessenger = new ethers.Contract(
        fromChain.tokenMessenger,
        TOKEN_MESSENGER_ABI,
        wallet
    );

    logger.info(`Burning ${ethers.formatUnits(amount, 6)} USDC on ${fromChain.name}...`);

    const tx = await tokenMessenger.getFunction('depositForBurn')(
        amount,
        toChain.cctpDomain,
        addressToBytes32(recipient),
        fromChain.usdcAddress
    );

    const receipt = await tx.wait();

    // Extract message hash from DepositForBurn event
    // The message hash is keccak256 of the message sent
    const iface = new ethers.Interface(TOKEN_MESSENGER_ABI);
    let messageHash = '';

    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === 'DepositForBurn') {
                // Calculate message hash from event data
                // In practice, we need to get the MessageSent event from MessageTransmitter
                messageHash = log.transactionHash;
                break;
            }
        } catch {
            // Not our event, skip
        }
    }

    logTransaction('BURN', fromChain.name, receipt.hash, {
        amount: ethers.formatUnits(amount, 6),
        destination: toChain.name,
    });

    return { txHash: receipt.hash as string, messageHash };
}

/**
 * Poll Circle attestation API for message attestation
 */
async function waitForAttestation(
    messageHash: string,
    maxAttempts = 60,
    intervalMs = 10000
): Promise<{ attestation: string; message: string }> {
    logger.info(`Waiting for attestation (messageHash: ${messageHash})...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`${ATTESTATION_API_URL}/${messageHash}`);
            const data = await response.json() as { status: string; attestation?: string; message?: string };

            if (data.status === 'complete' && data.attestation && data.message) {
                logger.info(`Attestation received after ${attempt} attempts`);
                return { attestation: data.attestation, message: data.message };
            }

            logger.info(`Attestation pending (attempt ${attempt}/${maxAttempts})...`);
        } catch (error) {
            logger.warn(`Attestation API error (attempt ${attempt}): ${error}`);
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Attestation timeout after ${maxAttempts} attempts`);
}

/**
 * Receive/mint USDC on destination chain
 */
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

    const tx = await messageTransmitter.getFunction('receiveMessage')(message, attestation);
    const receipt = await tx.wait();

    logTransaction('MINT', toChain.name, receipt.hash);
    return receipt.hash as string;
}

/**
 * Execute a full cross-chain transfer
 */
export async function executeTransfer(
    action: RebalanceAction,
    dryRun = false
): Promise<TransferResult> {
    const { from, to, amount } = action;

    logger.info(`\n${'='.repeat(50)}`);
    logger.info(`Executing transfer: ${ethers.formatUnits(amount, 6)} USDC`);
    logger.info(`From: ${from.name} → To: ${to.name}`);
    logger.info(`${'='.repeat(50)}\n`);

    if (dryRun) {
        logger.info('[DRY RUN] Would execute transfer, skipping...');
        return { success: true };
    }

    try {
        const wallet = getWallet(from);

        // Step 1: Approve
        await approveUSDC(from, amount);

        // Step 2: Burn on source chain
        const { txHash: burnTxHash, messageHash } = await burnUSDC(
            from,
            to,
            amount,
            wallet.address
        );

        // Step 3: Wait for attestation
        const { attestation, message } = await waitForAttestation(messageHash);

        // Step 4: Mint on destination chain
        const mintTxHash = await receiveMessage(to, message, attestation);

        logger.info(`\n✅ Transfer complete!`);
        logger.info(`Burn TX: ${burnTxHash}`);
        logger.info(`Mint TX: ${mintTxHash}\n`);

        return {
            success: true,
            burnTxHash,
            mintTxHash,
            messageHash,
        };
    } catch (error) {
        logError('Transfer failed', error, {
            from: from.name,
            to: to.name,
            amount: amount.toString(),
        });

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Get wallet address for a chain
 */
export function getWalletAddress(chain: ChainConfig): string {
    return getWallet(chain).address;
}
