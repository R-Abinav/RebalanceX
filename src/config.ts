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
export const CHAINS: Record<ChainName, ChainConfig> = {
    sepolia: {
        name: 'sepolia',
        chainId: 11155111,
        rpcUrl: getEnv('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com'),
        usdcAddress: getEnv('SEPOLIA_USDC', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
        tokenMessenger: getEnv('SEPOLIA_TOKEN_MESSENGER', '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'),
        messageTransmitter: getEnv('SEPOLIA_MESSAGE_TRANSMITTER', '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD'),
        cctpDomain: 0,
    },
    polygonAmoy: {
        name: 'polygonAmoy',
        chainId: 80002,
        rpcUrl: getEnv('POLYGON_AMOY_RPC_URL', 'https://rpc-amoy.polygon.technology'),
        usdcAddress: getEnv('POLYGON_AMOY_USDC', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'),
        tokenMessenger: getEnv('POLYGON_AMOY_TOKEN_MESSENGER', '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'),
        messageTransmitter: getEnv('POLYGON_AMOY_MESSAGE_TRANSMITTER', '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD'),
        cctpDomain: 7,
    },
    arbitrumSepolia: {
        name: 'arbitrumSepolia',
        chainId: 421614,
        rpcUrl: getEnv('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
        usdcAddress: getEnv('ARBITRUM_SEPOLIA_USDC', '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'),
        tokenMessenger: getEnv('ARBITRUM_SEPOLIA_TOKEN_MESSENGER', '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'),
        messageTransmitter: getEnv('ARBITRUM_SEPOLIA_MESSAGE_TRANSMITTER', '0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872'),
        cctpDomain: 3,
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
    sepolia: 40,
    polygonAmoy: 30,
    arbitrumSepolia: 30,
};

// Default threshold percentage
export const DEFAULT_THRESHOLD = 5;

// Default check interval in seconds
export const DEFAULT_INTERVAL = 60;
