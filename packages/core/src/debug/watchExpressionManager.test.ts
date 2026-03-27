/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WatchExpressionManager } from './watchExpressionManager.js';
import type { DAPClient } from './dapClient.js';

// ---------------------------------------------------------------------------
// Mock DAPClient
// ---------------------------------------------------------------------------

function createMockClient(
    evaluateResults: Record<string, { result: string; type: string }>,
): DAPClient {
    return {
        evaluate: vi.fn(async (expression: string) => {
            const result = evaluateResults[expression];
            if (!result) {
                throw new Error(`Cannot evaluate: ${expression}`);
            }
            return result;
        }),
    } as unknown as DAPClient;
}

describe('WatchExpressionManager', () => {
    let manager: WatchExpressionManager;

    beforeEach(() => {
        manager = new WatchExpressionManager();
    });

    describe('add and remove', () => {
        it('should add watch expressions', () => {
            manager.add('x');
            manager.add('arr.length', 'array length');

            expect(manager.getExpressions()).toHaveLength(2);
            expect(manager.getExpressions()).toContain('x');
            expect(manager.getExpressions()).toContain('arr.length');
        });

        it('should not duplicate watch expressions', () => {
            manager.add('x');
            manager.add('x');

            expect(manager.getExpressions()).toHaveLength(1);
        });

        it('should remove watch expressions', () => {
            manager.add('x');
            manager.add('y');

            expect(manager.remove('x')).toBe(true);
            expect(manager.getExpressions()).toHaveLength(1);
            expect(manager.getExpressions()).toContain('y');
        });

        it('should return false when removing non-existent expression', () => {
            expect(manager.remove('x')).toBe(false);
        });
    });

    describe('evaluateAll', () => {
        it('should evaluate all watch expressions', async () => {
            manager.add('x');
            manager.add('y');

            const client = createMockClient({
                x: { result: '42', type: 'number' },
                y: { result: '"hello"', type: 'string' },
            });

            const snapshot = await manager.evaluateAll(client, 1);

            expect(snapshot.watches).toHaveLength(2);
            expect(snapshot.watches[0].currentValue).toBe('42');
            expect(snapshot.watches[1].currentValue).toBe('"hello"');
            expect(snapshot.step).toBe(1);
        });

        it('should detect value changes between evaluations', async () => {
            manager.add('counter');

            const client1 = createMockClient({
                counter: { result: '1', type: 'number' },
            });
            await manager.evaluateAll(client1, 1);

            const client2 = createMockClient({
                counter: { result: '2', type: 'number' },
            });
            const snapshot = await manager.evaluateAll(client2, 1);

            expect(snapshot.watches[0].changed).toBe(true);
            expect(snapshot.watches[0].previousValue).toBe('1');
            expect(snapshot.watches[0].currentValue).toBe('2');
        });

        it('should not report change when value is the same', async () => {
            manager.add('x');

            const client = createMockClient({
                x: { result: '42', type: 'number' },
            });

            await manager.evaluateAll(client, 1);
            const snapshot = await manager.evaluateAll(client, 1);

            expect(snapshot.watches[0].changed).toBe(false);
        });

        it('should handle evaluation errors gracefully', async () => {
            manager.add('nonexistent');

            const client = createMockClient({});
            const snapshot = await manager.evaluateAll(client, 1);

            expect(snapshot.watches[0].currentValue).toBe('<error>');
            expect(snapshot.watches[0].currentType).toBe('error');
        });

        it('should increment step counter on each evaluation', async () => {
            manager.add('x');
            const client = createMockClient({
                x: { result: '1', type: 'number' },
            });

            await manager.evaluateAll(client, 1);
            await manager.evaluateAll(client, 1);
            const snapshot = await manager.evaluateAll(client, 1);

            expect(snapshot.step).toBe(3);
            expect(manager.getStep()).toBe(3);
        });
    });

    describe('getHistory', () => {
        it('should track value history', async () => {
            manager.add('x');

            const values = ['1', '2', '3'];
            for (const v of values) {
                const client = createMockClient({
                    x: { result: v, type: 'number' },
                });
                await manager.evaluateAll(client, 1);
            }

            const history = manager.getHistory('x');
            expect(history).toHaveLength(3);
            expect(history.map((h) => h.value)).toEqual(['1', '2', '3']);
        });

        it('should return empty array for unknown expression', () => {
            expect(manager.getHistory('nonexistent')).toHaveLength(0);
        });
    });

    describe('clear', () => {
        it('should clear all watches and reset step counter', () => {
            manager.add('x');
            manager.add('y');
            manager.clear();

            expect(manager.getExpressions()).toHaveLength(0);
            expect(manager.getStep()).toBe(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with watch values', async () => {
            manager.add('count', 'counter');
            manager.add('name');

            const client = createMockClient({
                count: { result: '5', type: 'number' },
                name: { result: '"Alice"', type: 'string' },
            });

            const snapshot = await manager.evaluateAll(client, 1);
            const markdown = manager.toMarkdown(snapshot);

            expect(markdown).toContain('Watch Expressions');
            expect(markdown).toContain('counter');
            expect(markdown).toContain('**5**');
        });

        it('should show change markers when values change', async () => {
            manager.add('x');

            const client1 = createMockClient({ x: { result: '1', type: 'number' } });
            await manager.evaluateAll(client1, 1);

            const client2 = createMockClient({ x: { result: '2', type: 'number' } });
            const snapshot = await manager.evaluateAll(client2, 1);

            const markdown = manager.toMarkdown(snapshot);
            expect(markdown).toContain('🔄');
            expect(markdown).toContain('was: 1');
            expect(markdown).toContain('1 value(s) changed');
        });

        it('should handle empty watches', () => {
            const snapshot = { watches: [], step: 0 };
            expect(manager.toMarkdown(snapshot)).toContain('No watch expressions');
        });
    });
});
