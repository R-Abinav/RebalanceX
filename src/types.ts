/**
 * RebalanceX Type Definitions
 */

// Supported chains
export type ChainName = 'sepolia' | 'polygonAmoy' | 'arbitrumSepolia' | 'arc';

// Chain configuration
export interface ChainConfig {
    name: ChainName;
    chainId: number;
    rpcUrl: string;
    usdcAddress: string;
    tokenMessenger: string;
    messageTransmitter: string;
    cctpDomain: number;
}

// Balance data per chain
export interface ChainBalance {
    chain: ChainName;
    balance: bigint;
    percentage: number;
}

// Target allocation
export interface TargetAllocation {
    chain: ChainName;
    percentage: number;
}

// Deviation from target
export interface Deviation {
    chain: ChainName;
    current: number;
    target: number;
    deviation: number; // positive = over-allocated, negative = under-allocated
}

// Rebalancing action
export interface RebalanceAction {
    from: ChainConfig;
    to: ChainConfig;
    amount: bigint;
    type: 'transfer';
}

// Transfer result
export interface TransferResult {
    success: boolean;
    burnTxHash?: string;
    mintTxHash?: string;
    messageHash?: string;
    error?: string;
}

// Agent options from CLI
export interface AgentOptions {
    target: string;       // e.g., "40,30,30"
    threshold: number;    // percentage threshold to trigger rebalance
    interval: number;     // seconds between checks
    dryRun: boolean;      // simulate without executing
}
