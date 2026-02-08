/**
 * RebalanceX Uniswap v4 Swap Executor
 * Token swaps using Uniswap v4 Universal Router
 * For rebalancing non-USDC tokens to USDC before cross-chain transfers
 */

import { ethers } from 'ethers';
import { CHAINS, getPrivateKey } from '../config.js';
import { logger } from '../logger.js';
import type { ChainConfig, ChainName } from '../types.js';

// =============================================================================
// Uniswap v4 Contract Addresses (Sepolia Testnet)
// =============================================================================

// Official Uniswap v4 contract addresses from https://docs.uniswap.org/contracts/v4/deployments
const UNISWAP_V4_ADDRESSES: Record<string, {
    poolManager: string;
    universalRouter: string;
    permit2: string;
    quoterV2: string;
}> = {
    sepolia: {
        poolManager: '0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A',
        universalRouter: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
        permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
        quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    },
};

// Supported chains for Uniswap v4 swaps
const SWAP_SUPPORTED_CHAINS: ChainName[] = ['sepolia'];

// Common token addresses (Sepolia)
const TOKENS: Record<string, Record<string, string>> = {
    sepolia: {
        USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    },
};

// =============================================================================
// ABIs (Minimal for our use case)
// =============================================================================

const QUOTER_V2_ABI = [
    'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const UNIVERSAL_ROUTER_ABI = [
    'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable',
];

const PERMIT2_ABI = [
    'function approve(address token, address spender, uint160 amount, uint48 expiration) external',
    'function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)',
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];

// =============================================================================
// Types
// =============================================================================

export interface SwapParams {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    minAmountOut: bigint;
    fee: number; // Pool fee tier (500, 3000, 10000)
    deadline?: number; // Unix timestamp
    recipient?: string;
}

export interface SwapResult {
    success: boolean;
    txHash?: string;
    amountIn?: bigint;
    amountOut?: bigint;
    error?: string;
}

export interface QuoteResult {
    amountOut: bigint;
    gasEstimate: bigint;
    sqrtPriceX96After: bigint;
}

// =============================================================================
// Wallet Management
// =============================================================================

const walletCache = new Map<string, ethers.Wallet>();

function getWallet(chain: ChainConfig): ethers.Wallet {
    const cached = walletCache.get(chain.name);
    if (cached) return cached;

    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const wallet = new ethers.Wallet(getPrivateKey(), provider);
    walletCache.set(chain.name, wallet);
    return wallet;
}

// =============================================================================
// Swap Support Check
// =============================================================================

export function isSwapSupported(chainName: ChainName): boolean {
    return SWAP_SUPPORTED_CHAINS.includes(chainName);
}

export function getUniswapAddresses(chainName: ChainName) {
    if (!isSwapSupported(chainName)) {
        throw new Error(`Uniswap v4 not supported on ${chainName}`);
    }
    return UNISWAP_V4_ADDRESSES[chainName];
}

// =============================================================================
// Quote Functions
// =============================================================================

export async function getQuote(
    chain: ChainConfig,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    fee = 3000 // Default to 0.3% fee tier
): Promise<QuoteResult> {
    if (!isSwapSupported(chain.name)) {
        throw new Error(`Swaps not supported on ${chain.name}`);
    }

    const addresses = getUniswapAddresses(chain.name);
    const wallet = getWallet(chain);

    const quoter = new ethers.Contract(
        addresses!.quoterV2,
        QUOTER_V2_ABI,
        wallet
    );

    try {
        const params = {
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
        };

        // Use getFunction for ethers v6 with strict type checking
        const quoteFunction = quoter.getFunction('quoteExactInputSingle');
        const result = await quoteFunction.staticCall(params);

        return {
            amountOut: result.amountOut as bigint,
            gasEstimate: result.gasEstimate as bigint,
            sqrtPriceX96After: result.sqrtPriceX96After as bigint,
        };
    } catch (error) {
        logger.error('Quote failed:', { error });
        throw error;
    }
}

// =============================================================================
// Token Approval
// =============================================================================

async function ensureApproval(
    chain: ChainConfig,
    tokenAddress: string,
    spender: string,
    amount: bigint
): Promise<void> {
    const wallet = getWallet(chain);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const currentAllowance = await token.getFunction('allowance')(wallet.address, spender) as bigint;

    if (currentAllowance >= amount) {
        logger.info('Sufficient allowance already exists', {
            token: tokenAddress,
            spender,
            allowance: currentAllowance.toString(),
        });
        return;
    }

    logger.info('Approving token spend', {
        token: tokenAddress,
        spender,
        amount: amount.toString(),
    });

    const tx = await token.getFunction('approve')(spender, amount);
    await tx.wait();

    logger.info('Token approved', { txHash: tx.hash });
}

// =============================================================================
// Swap Execution
// =============================================================================

/**
 * Execute a token swap on Uniswap v4
 * Uses Universal Router for optimal execution
 */
export async function executeSwap(
    chain: ChainConfig,
    params: SwapParams,
    dryRun = false
): Promise<SwapResult> {
    if (!isSwapSupported(chain.name)) {
        return {
            success: false,
            error: `Swaps not supported on ${chain.name}`,
        };
    }

    const addresses = getUniswapAddresses(chain.name);
    const wallet = getWallet(chain);

    logger.info('');
    logger.info('═'.repeat(60));
    logger.info('UNISWAP V4 SWAP');
    logger.info('═'.repeat(60));
    logger.info(`Token In: ${params.tokenIn}`);
    logger.info(`Token Out: ${params.tokenOut}`);
    logger.info(`Amount In: ${ethers.formatUnits(params.amountIn, 6)}`);
    logger.info(`Min Amount Out: ${ethers.formatUnits(params.minAmountOut, 6)}`);
    logger.info(`Chain: ${chain.name}`);
    logger.info('═'.repeat(60));

    if (dryRun) {
        logger.info('[DRY RUN] Would execute swap, skipping...');
        return {
            success: true,
            amountIn: params.amountIn,
            amountOut: params.minAmountOut,
        };
    }

    try {
        // Step 1: Approve Permit2 to spend tokens
        await ensureApproval(
            chain,
            params.tokenIn,
            addresses!.permit2,
            params.amountIn
        );

        // Step 2: Approve Universal Router via Permit2
        const permit2 = new ethers.Contract(
            addresses!.permit2,
            PERMIT2_ABI,
            wallet
        );

        const expiration = Math.floor(Date.now() / 1000) + 86400; // 24 hours
        const permit2Tx = await permit2.getFunction('approve')(
            params.tokenIn,
            addresses!.universalRouter,
            params.amountIn,
            expiration
        );
        await permit2Tx.wait();
        logger.info('Permit2 approval set', { txHash: permit2Tx.hash });

        // Step 3: Encode swap command for Universal Router
        const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 1200; // 20 min default
        const recipient = params.recipient ?? wallet.address;

        // Build the swap path encoding
        const pathEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint24', 'address'],
            [params.tokenIn, params.fee, params.tokenOut]
        );

        // Encode the swap input
        const swapInput = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256', 'uint256', 'bytes', 'bool'],
            [recipient, params.amountIn, params.minAmountOut, pathEncoded, true]
        );

        const router = new ethers.Contract(
            addresses!.universalRouter,
            UNIVERSAL_ROUTER_ABI,
            wallet
        );

        // Execute the swap
        // Command 0x00 = V3_SWAP_EXACT_IN (for compatibility)
        const commands = '0x00';
        const inputs = [swapInput];

        const tx = await router.getFunction('execute')(commands, inputs, deadline);
        await tx.wait();

        logger.info('✅ Swap executed successfully', { txHash: tx.hash });

        return {
            success: true,
            txHash: tx.hash,
            amountIn: params.amountIn,
            amountOut: params.minAmountOut,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('❌ Swap failed:', { error: errorMessage });

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate minimum amount out with slippage protection
 */
export function calculateMinAmountOut(
    expectedAmount: bigint,
    slippageBps: number // Basis points (e.g., 50 = 0.5%)
): bigint {
    const slippageFactor = 10000n - BigInt(slippageBps);
    return (expectedAmount * slippageFactor) / 10000n;
}

/**
 * Get a quote and calculate swap with slippage
 */
export async function getSwapQuoteWithSlippage(
    chain: ChainConfig,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    slippageBps = 50, // Default 0.5% slippage
    fee = 3000
): Promise<{ quote: QuoteResult; minAmountOut: bigint }> {
    const quote = await getQuote(chain, tokenIn, tokenOut, amountIn, fee);
    const minAmountOut = calculateMinAmountOut(quote.amountOut, slippageBps);

    logger.info('Quote received', {
        amountIn: amountIn.toString(),
        expectedAmountOut: quote.amountOut.toString(),
        minAmountOut: minAmountOut.toString(),
        slippageBps,
    });

    return { quote, minAmountOut };
}

/**
 * Swap tokens to USDC for rebalancing
 * Useful when the treasury holds non-USDC tokens
 */
export async function swapToUSDC(
    chain: ChainConfig,
    tokenIn: string,
    amountIn: bigint,
    slippageBps = 100, // 1% default for volatile tokens
    dryRun = false
): Promise<SwapResult> {
    if (!isSwapSupported(chain.name)) {
        return {
            success: false,
            error: `Swaps not supported on ${chain.name}`,
        };
    }

    const usdcAddress = chain.usdcAddress;

    try {
        const { minAmountOut } = await getSwapQuoteWithSlippage(
            chain,
            tokenIn,
            usdcAddress,
            amountIn,
            slippageBps
        );

        return executeSwap(chain, {
            tokenIn,
            tokenOut: usdcAddress,
            amountIn,
            minAmountOut,
            fee: 3000,
        }, dryRun);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: errorMessage,
        };
    }
}

// =============================================================================
// Exports
// =============================================================================

export {
    UNISWAP_V4_ADDRESSES,
    TOKENS,
    SWAP_SUPPORTED_CHAINS,
    getWallet as getSwapWallet,
};
