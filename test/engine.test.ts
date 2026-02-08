/**
 * RebalanceX Engine Tests
 * Unit tests for rebalancing logic
 */

import {
    calculateDeviations,
    needsRebalancing,
    generateActions,
    parseTargetAllocation,
} from '../src/engine.js';
import type { ChainBalance, TargetAllocation, ChainName } from '../src/types.js';

describe('calculateDeviations', () => {
    it('should calculate correct deviations', () => {
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
        expect(deviations[0]?.deviation).toBe(20);  // sepolia: 60 - 40 = +20
        expect(deviations[1]?.deviation).toBe(-10); // polygonAmoy: 20 - 30 = -10
        expect(deviations[2]?.deviation).toBe(-10); // arbitrumSepolia: 20 - 30 = -10
    });

    it('should handle missing target with 0%', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 100n * 10n ** 6n, percentage: 100 },
        ];
        const targets: TargetAllocation[] = [];

        const deviations = calculateDeviations(balances, targets);

        expect(deviations[0]?.deviation).toBe(100); // 100 - 0 = 100
    });
});

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
});

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
});

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
});
