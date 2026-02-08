/**
 * RebalanceX Configuration
 * Chain configs, contract addresses, and environment loading
 */

import 'dotenv/config';
import type { ChainConfig, ChainName } from './types.js';

// ERC20 ABI for USDC balance and approve
export const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
] as const;

// CCTP TokenMessenger ABI
export const TOKEN_MESSENGER_ABI = [
    'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
    'event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)',
] as const;

// CCTP MessageTransmitter ABI
export const MESSAGE_TRANSMITTER_ABI = [
    'function receiveMessage(bytes message, bytes attestation) returns (bool success)',
    'event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)',
] as const;

// Helper to get env var with fallback
function getEnv(key: string, fallback?: string): string {
    const value = process.env[key];
    if (!value && !fallback) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value ?? fallback!;
}

// Chain configurations
// CCTP V2 Contract Addresses from https://developers.circle.com/cctp/evm-smart-contracts
// Domain IDs from https://developers.circle.com/cctp/concepts/supported-chains-and-domains
export const CHAINS: Record<ChainName, ChainConfig> = {
    sepolia: {
        name: 'sepolia',
        chainId: 11155111,
        rpcUrl: getEnv('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com'),
        usdcAddress: getEnv('SEPOLIA_USDC', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
        // CCTP V2 addresses (same across all testnets)
        tokenMessenger: getEnv('SEPOLIA_TOKEN_MESSENGER', '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'),
        messageTransmitter: getEnv('SEPOLIA_MESSAGE_TRANSMITTER', '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
        cctpDomain: 0, // Ethereum domain
    },
    polygonAmoy: {
        name: 'polygonAmoy',
        chainId: 80002,
        rpcUrl: getEnv('POLYGON_AMOY_RPC_URL', 'https://rpc-amoy.polygon.technology'),
        usdcAddress: getEnv('POLYGON_AMOY_USDC', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'),
        // CCTP V2 addresses (same across all testnets)
        tokenMessenger: getEnv('POLYGON_AMOY_TOKEN_MESSENGER', '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'),
        messageTransmitter: getEnv('POLYGON_AMOY_MESSAGE_TRANSMITTER', '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
        cctpDomain: 7, // Polygon domain
    },
    arbitrumSepolia: {
        name: 'arbitrumSepolia',
        chainId: 421614,
        rpcUrl: getEnv('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
        usdcAddress: getEnv('ARBITRUM_SEPOLIA_USDC', '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'),
        // CCTP V2 addresses (same across all testnets)
        tokenMessenger: getEnv('ARBITRUM_SEPOLIA_TOKEN_MESSENGER', '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'),
        messageTransmitter: getEnv('ARBITRUM_SEPOLIA_MESSAGE_TRANSMITTER', '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
        cctpDomain: 3, // Arbitrum domain
    },
    arc: {
        name: 'arc',
        chainId: 5042002,
        rpcUrl: getEnv('ARC_RPC_URL', 'https://rpc.testnet.arc.network'),
        // Arc native USDC (uses 18 decimals natively, 6 decimals via ERC-20 interface)
        usdcAddress: getEnv('ARC_USDC', '0x3600000000000000000000000000000000000000'),
        // CCTP V2 addresses for Arc
        tokenMessenger: getEnv('ARC_TOKEN_MESSENGER', '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'),
        messageTransmitter: getEnv('ARC_MESSAGE_TRANSMITTER', '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
        cctpDomain: 26, // Arc domain
    },
};

// Get wallet private key
export function getPrivateKey(): string {
    return getEnv('PRIVATE_KEY');
}

// Circle attestation API URL
export const ATTESTATION_API_URL = getEnv(
    'CIRCLE_ATTESTATION_URL',
    'https://iris-api-sandbox.circle.com/attestations'
);

// Default target allocations (can be overridden via CLI)
export const DEFAULT_TARGET_ALLOCATIONS = {
    sepolia: 25,
    polygonAmoy: 25,
    arbitrumSepolia: 25,
    arc: 25,
};

// Default threshold percentage
export const DEFAULT_THRESHOLD = 5;

// Default check interval in seconds
export const DEFAULT_INTERVAL = 60;
