/**
 * RebalanceX Monitor Tests
 * Tests for balance fetching and allocation calculation
 */

import { calculateAllocations } from '../src/monitor.js';
import type { ChainBalance } from '../src/types.js';

// =============================================================================
// calculateAllocations Tests
// =============================================================================

describe('calculateAllocations', () => {
    it('should calculate correct percentages for standard balances', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 60n * 10n ** 6n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 20n * 10n ** 6n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 20n * 10n ** 6n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.percentage).toBe(60);
        expect(result[1]?.percentage).toBe(20);
        expect(result[2]?.percentage).toBe(20);
    });

    it('should handle zero total balance', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 0n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 0n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.percentage).toBe(0);
        expect(result[1]?.percentage).toBe(0);
    });

    it('should handle 100% on single chain', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 1000n * 10n ** 6n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 0n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 0n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.percentage).toBe(100);
        expect(result[1]?.percentage).toBe(0);
        expect(result[2]?.percentage).toBe(0);
    });

    it('should handle very small amounts', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 1n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 1n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.percentage).toBe(50);
        expect(result[1]?.percentage).toBe(50);
    });

    it('should handle very large amounts', () => {
        const billion = 1_000_000_000n * 10n ** 6n;
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: billion * 4n, percentage: 0 },
            { chain: 'polygonAmoy', balance: billion * 3n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: billion * 3n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.percentage).toBe(40);
        expect(result[1]?.percentage).toBe(30);
        expect(result[2]?.percentage).toBe(30);
    });

    it('should calculate precise decimal percentages', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 333333n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 333333n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 333334n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        // Each should be ~33.33%
        expect(result[0]?.percentage).toBeCloseTo(33.33, 0);
        expect(result[1]?.percentage).toBeCloseTo(33.33, 0);
        expect(result[2]?.percentage).toBeCloseTo(33.33, 0);
    });

    it('should preserve balance values', () => {
        const originalBalance = 12345678901234n;
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: originalBalance, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.balance).toBe(originalBalance);
    });

    it('should preserve chain names', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 100n, percentage: 0 },
            { chain: 'polygonAmoy', balance: 100n, percentage: 0 },
            { chain: 'arbitrumSepolia', balance: 100n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result[0]?.chain).toBe('sepolia');
        expect(result[1]?.chain).toBe('polygonAmoy');
        expect(result[2]?.chain).toBe('arbitrumSepolia');
    });

    it('should handle empty array', () => {
        const result = calculateAllocations([]);
        expect(result).toEqual([]);
    });

    it('should handle single chain', () => {
        const balances: ChainBalance[] = [
            { chain: 'sepolia', balance: 100n * 10n ** 6n, percentage: 0 },
        ];

        const result = calculateAllocations(balances);

        expect(result).toHaveLength(1);
        expect(result[0]?.percentage).toBe(100);
    });
});
