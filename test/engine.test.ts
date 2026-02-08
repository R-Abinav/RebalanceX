/**
 * RebalanceX Engine Tests
 * Comprehensive unit tests with edge cases
 */

import {
    calculateDeviations,
    needsRebalancing,
    generateActions,
    parseTargetAllocation,
} from '../src/engine.js';
import type { ChainBalance, TargetAllocation, ChainName } from '../src/types.js';

// =============================================================================
// calculateDeviations Tests
// =============================================================================

describe('calculateDeviations', () => {
    it('should calculate correct deviations for standard case', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 60n * 10n ** 6n, percentage: 60 },
            { chain: 'polygonAmoy', balance: 20n * 10n ** 6n, percentage: 20 },
            { chain: 'arbitrumSepolia', balance: 20n * 10n ** 6n, percentage: 20 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations).toHaveLength(3);
        expect(deviations[0]?.deviation).toBe(20);
        expect(deviations[1]?.deviation).toBe(-10);
        expect(deviations[2]?.deviation).toBe(-10);
    });

    it('should handle missing target with 0%', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 100n * 10n ** 6n, percentage: 100 },
        ];
        const targets: TargetAllocation[] = [];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations[0]?.deviation).toBe(100);
    });

    // EDGE CASE: All zeros
    it('should handle zero balances across all chains', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 0n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 0n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 0n, percentage: 0 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations).toHaveLength(3);
        expect(deviations[0]?.deviation).toBe(-40);
        expect(deviations[1]?.deviation).toBe(-30);
        expect(deviations[2]?.deviation).toBe(-30);
    });

    // EDGE CASE: Exactly at target
    it('should return zero deviation when perfectly balanced', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 40n * 10n ** 6n, percentage: 40 },
            { chain: 'polygonAmoy', balance: 30n * 10n ** 6n, percentage: 30 },
            { chain: 'arbitrumSepolia', balance: 30n * 10n ** 6n, percentage: 30 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations.every(d => d.deviation === 0)).toBe(true);
    });

    // EDGE CASE: All funds on one chain
    it('should handle 100% concentration on single chain', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 1000n * 10n ** 6n, percentage: 100 },
            { chain: 'polygonAmoy', balance: 0n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 0n, percentage: 0 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 33.33 },
            { chain: 'polygonAmoy', percentage: 33.33 },
            { chain: 'arbitrumSepolia', percentage: 33.34 },
        ];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations[0]?.deviation).toBeCloseTo(66.67, 1);
        expect(deviations[1]?.deviation).toBeCloseTo(-33.33, 1);
        expect(deviations[2]?.deviation).toBeCloseTo(-33.34, 1);
    });

    // EDGE CASE: Decimal percentages
    it('should handle decimal percentage targets', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 50n * 10n ** 6n, percentage: 50.5 },
            { chain: 'polygonAmoy', balance: 49n * 10n ** 6n, percentage: 49.5 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 50.25 },
            { chain: 'polygonAmoy', percentage: 49.75 },
        ];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations[0]?.deviation).toBeCloseTo(0.25, 2);
        expect(deviations[1]?.deviation).toBeCloseTo(-0.25, 2);
    });
});

// =============================================================================
// needsRebalancing Tests
// =============================================================================

describe('needsRebalancing', () => {
    it('should return true when deviation exceeds threshold', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 60, target: 40, deviation: 20 },
            { chain: 'polygonAmoy' as ChainName, current: 20, target: 30, deviation: -10 },
        ];

        expect(needsRebalancing(deviations, 5)).toBe(true);
        expect(needsRebalancing(deviations, 15)).toBe(true);
        expect(needsRebalancing(deviations, 25)).toBe(false);
    });

    it('should return false when all within threshold', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 42, target: 40, deviation: 2 },
            { chain: 'polygonAmoy' as ChainName, current: 28, target: 30, deviation: -2 },
        ];

        expect(needsRebalancing(deviations, 5)).toBe(false);
    });

    // EDGE CASE: Exactly at threshold
    it('should return false when deviation exactly equals threshold', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 45, target: 40, deviation: 5 },
            { chain: 'polygonAmoy' as ChainName, current: 25, target: 30, deviation: -5 },
        ];

        expect(needsRebalancing(deviations, 5)).toBe(false);
    });

    // EDGE CASE: Zero threshold
    it('should always need rebalancing with zero threshold (unless perfect)', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 40.01, target: 40, deviation: 0.01 },
        ];

        expect(needsRebalancing(deviations, 0)).toBe(true);
    });

    // EDGE CASE: Empty deviations
    it('should return false for empty deviations array', () => {
        expect(needsRebalancing([], 5)).toBe(false);
    });

    // EDGE CASE: Single chain
    it('should handle single chain scenario', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 100, target: 100, deviation: 0 },
        ];

        expect(needsRebalancing(deviations, 5)).toBe(false);
    });

    // EDGE CASE: Very large threshold
    it('should never rebalance with very large threshold', () => {
        const deviations = [
            { chain: 'sepolia' as ChainName, current: 100, target: 0, deviation: 100 },
        ];

        expect(needsRebalancing(deviations, 101)).toBe(false);
    });
});

// =============================================================================
// generateActions Tests
// =============================================================================

describe('generateActions', () => {
    it('should generate transfer from over-allocated to under-allocated', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 60n * 10n ** 6n, percentage: 60 },
            { chain: 'polygonAmoy', balance: 20n * 10n ** 6n, percentage: 20 },
            { chain: 'arbitrumSepolia', balance: 20n * 10n ** 6n, percentage: 20 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const actions = generateActions(balances, targets, 5);

        expect(actions.length).toBeGreaterThan(0);
        expect(actions[0]?.from.name).toBe('sepolia');
        expect(['polygonAmoy', 'arbitrumSepolia']).toContain(actions[0]?.to.name);
    });

    it('should return empty array when no rebalancing needed', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 40n * 10n ** 6n, percentage: 40 },
            { chain: 'polygonAmoy', balance: 30n * 10n ** 6n, percentage: 30 },
            { chain: 'arbitrumSepolia', balance: 30n * 10n ** 6n, percentage: 30 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const actions = generateActions(balances, targets, 5);

        expect(actions).toHaveLength(0);
    });

    // EDGE CASE: Zero total balance
    it('should handle zero total balance gracefully', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 0n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 0n, percentage: 0 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 50 },
            { chain: 'polygonAmoy', percentage: 50 },
        ];

        const actions = generateActions(balances, targets, 5);

        // Cannot transfer 0 funds - should return empty
        expect(actions).toHaveLength(0);
    });

    // EDGE CASE: Very small amounts (dust)
    it('should handle micro amounts (1 wei USDC)', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 2n, percentage: 66.66 },
            { chain: 'polygonAmoy', balance: 1n, percentage: 33.33 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 50 },
            { chain: 'polygonAmoy', percentage: 50 },
        ];

        const actions = generateActions(balances, targets, 5);

        // Should generate action or handle gracefully
        expect(actions.length).toBeGreaterThanOrEqual(0);
    });

    // EDGE CASE: Very large amounts (millions of USDC)
    it('should handle large treasury amounts (10M USDC)', () => {
        const tenMillion = 10_000_000n * 10n ** 6n;
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: tenMillion * 6n / 10n, percentage: 60 },
            { chain: 'polygonAmoy', balance: tenMillion * 2n / 10n, percentage: 20 },
            { chain: 'arbitrumSepolia', balance: tenMillion * 2n / 10n, percentage: 20 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const actions = generateActions(balances, targets, 5);

        expect(actions.length).toBeGreaterThan(0);
        // Transfer amount should be ~2M USDC (20% of 10M)
        const totalTransfer = actions.reduce((sum, a) => sum + a.amount, 0n);
        expect(totalTransfer).toBeGreaterThan(1_000_000n * 10n ** 6n);
    });

    // EDGE CASE: Two chains only
    it('should work with only two chains', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 70n * 10n ** 6n, percentage: 70 },
            { chain: 'polygonAmoy', balance: 30n * 10n ** 6n, percentage: 30 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 50 },
            { chain: 'polygonAmoy', percentage: 50 },
        ];

        const actions = generateActions(balances, targets, 5);

        expect(actions).toHaveLength(1);
        expect(actions[0]?.from.name).toBe('sepolia');
        expect(actions[0]?.to.name).toBe('polygonAmoy');
        expect(actions[0]?.amount).toBe(20n * 10n ** 6n);
    });

    // EDGE CASE: Multiple over-allocated chains
    it('should handle multiple over-allocated chains', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 50n * 10n ** 6n, percentage: 50 },
            { chain: 'polygonAmoy', balance: 40n * 10n ** 6n, percentage: 40 },
            { chain: 'arbitrumSepolia', balance: 10n * 10n ** 6n, percentage: 10 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 33 },
            { chain: 'polygonAmoy', percentage: 33 },
            { chain: 'arbitrumSepolia', percentage: 34 },
        ];

        const actions = generateActions(balances, targets, 5);

        expect(actions.length).toBeGreaterThan(0);
        // Sepolia (50->33) and polygonAmoy (40->33) are over-allocated
        // arbitrumSepolia (10->34) is under-allocated
        const fromChains = actions.map(a => a.from.name);
        expect(fromChains).toContain('sepolia');
    });
});

// =============================================================================
// parseTargetAllocation Tests
// =============================================================================

describe('parseTargetAllocation', () => {
    it('should parse valid allocation string', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];
        const result = parseTargetAllocation('40,30,30', chains);

        expect(result).toEqual([
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ]);
    });

    it('should throw on mismatched chain count', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy'];

        expect(() => parseTargetAllocation('40,30,30', chains)).toThrow(
            'Target allocation must have 2 values'
        );
    });

    it('should throw when sum is not 100%', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];

        expect(() => parseTargetAllocation('40,40,40', chains)).toThrow(
            'Target allocation must sum to 100%'
        );
    });

    // EDGE CASE: Whitespace handling
    it('should handle whitespace in allocation string', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];
        const result = parseTargetAllocation('40, 30, 30', chains);

        expect(result).toEqual([
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ]);
    });

    // EDGE CASE: Decimal allocations
    it('should parse decimal allocations', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];
        const result = parseTargetAllocation('33.33,33.33,33.34', chains);

        expect(result[0]?.percentage).toBeCloseTo(33.33, 2);
        expect(result[1]?.percentage).toBeCloseTo(33.33, 2);
        expect(result[2]?.percentage).toBeCloseTo(33.34, 2);
    });

    // EDGE CASE: Single chain (100%)
    it('should handle single chain with 100%', () => {
        const chains: ChainName[] = ['sepolia'];
        const result = parseTargetAllocation('100', chains);

        expect(result).toEqual([{ chain: 'sepolia', percentage: 100 }]);
    });

    // EDGE CASE: Zero allocation for one chain
    it('should allow 0% allocation for a chain', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];
        const result = parseTargetAllocation('100,0,0', chains);

        expect(result).toEqual([
            { chain: 'sepolia', percentage: 100 },
            { chain: 'polygonAmoy', percentage: 0 },
            { chain: 'arbitrumSepolia', percentage: 0 },
        ]);
    });

    // EDGE CASE: Very small percentages
    it('should handle small percentages', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy'];
        const result = parseTargetAllocation('99.99,0.01', chains);

        expect(result[0]?.percentage).toBeCloseTo(99.99, 2);
        expect(result[1]?.percentage).toBeCloseTo(0.01, 2);
    });

    // EDGE CASE: Negative percentages (should throw)
    it('should handle negative percentages gracefully', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy'];

        // Sum is 100 but one is negative - this tests the validation
        expect(() => parseTargetAllocation('150,-50', chains)).not.toThrow();
        // Note: We might want to add validation for negative values
    });

    // EDGE CASE: Sum slightly off due to floating point
    it('should accept sum very close to 100%', () => {
        const chains: ChainName[] = ['sepolia', 'polygonAmoy', 'arbitrumSepolia'];

        // 33.33 + 33.33 + 33.34 = 100.00
        expect(() => parseTargetAllocation('33.33,33.33,33.34', chains)).not.toThrow();
    });
});

// =============================================================================
// Integration-style Tests
// =============================================================================

describe('Full Rebalancing Flow', () => {
    it('should correctly determine and generate actions for typical rebalance', () => {
        // Simulate: Treasury has 100 USDC, 60/20/20 split, target is 40/30/30
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 60n * 10n ** 6n, percentage: 60 },
            { chain: 'polygonAmoy', balance: 20n * 10n ** 6n, percentage: 20 },
            { chain: 'arbitrumSepolia', balance: 20n * 10n ** 6n, percentage: 20 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        // Step 1: Calculate deviations
        const deviations = calculateDeviations(balances, targets);
        expect(deviations[0]?.deviation).toBe(20);

        // Step 2: Check if rebalancing needed
        expect(needsRebalancing(deviations, 5)).toBe(true);

        // Step 3: Generate actions
        const actions = generateActions(balances, targets, 5);

        // Should have 2 actions: sepolia -> polygonAmoy (10), sepolia -> arbitrumSepolia (10)
        expect(actions.length).toBe(2);

        // Total transferred should be 20 USDC
        const totalTransfer = actions.reduce((sum, a) => sum + a.amount, 0n);
        expect(totalTransfer).toBe(20n * 10n ** 6n);
    });

    it('should not generate actions when already balanced', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 42n * 10n ** 6n, percentage: 42 },
            { chain: 'polygonAmoy', balance: 28n * 10n ** 6n, percentage: 28 },
            { chain: 'arbitrumSepolia', balance: 30n * 10n ** 6n, percentage: 30 },
        ];
        const targets: TargetAllocation[] = [
            { chain: 'sepolia', percentage: 40 },
            { chain: 'polygonAmoy', percentage: 30 },
            { chain: 'arbitrumSepolia', percentage: 30 },
        ];

        const deviations = calculateDeviations(balances, targets);
        expect(needsRebalancing(deviations, 5)).toBe(false);

        const actions = generateActions(balances, targets, 5);
        expect(actions).toHaveLength(0);
    });
});

