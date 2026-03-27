/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { DataBreakpointManager } from './dataBreakpointManager.js';
import type { DebugProtocol } from './dataBreakpointManager.js';
import type { Variable } from './dapClient.js';

function createMockClient(
    dataBreakpointResult: { dataId?: string; description?: string } | null = null,
): DebugProtocol {
    return {
        sendRequest: vi.fn(async () => {
            if (!dataBreakpointResult) {
                throw new Error('Not supported');
            }
            return dataBreakpointResult;
        }),
    };
}

describe('DataBreakpointManager', () => {
    describe('add and remove', () => {
        it('should add data breakpoints', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'count', 'write');

            expect(manager.getAll()).toHaveLength(1);
            expect(manager.getAll()[0].variableName).toBe('count');
        });

        it('should remove data breakpoints', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'count');
            expect(manager.remove('var_1')).toBe(true);
            expect(manager.getAll()).toHaveLength(0);
        });

        it('should track active state', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'count', 'write');
            manager.add('var_2', 'total', 'readWrite');

            const active = manager.getActive();
            expect(active).toHaveLength(2);
        });
    });

    describe('checkSupport', () => {
        it('should detect supported variables', async () => {
            const client = createMockClient({
                dataId: 'var_1_data',
                description: 'Watch count',
            });
            const manager = new DataBreakpointManager();

            const info = await manager.checkSupport(client, 1, 'count');
            expect(info.supported).toBe(true);
            expect(info.dataId).toBe('var_1_data');
        });

        it('should detect unsupported variables', async () => {
            const client = createMockClient(null);
            const manager = new DataBreakpointManager();

            const info = await manager.checkSupport(client, 1, 'count');
            expect(info.supported).toBe(false);
            expect(info.dataId).toBeNull();
        });
    });

    describe('buildDAPRequest', () => {
        it('should build DAP-compatible request', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'count', 'write');
            manager.add('var_2', 'total', 'readWrite', 'total > 100');

            const request = manager.buildDAPRequest();
            expect(request.breakpoints).toHaveLength(2);
            expect(request.breakpoints[0].dataId).toBe('var_1');
            expect(request.breakpoints[0].accessType).toBe('write');
            expect(request.breakpoints[1].condition).toBe('total > 100');
        });
    });

    describe('suggestWatchpoints', () => {
        it('should suggest interesting variables', () => {
            const variables: Variable[] = [
                { name: 'count', value: '5', type: 'number', variablesReference: 0 },
                { name: 'user', value: '{...}', type: 'object', variablesReference: 10 },
                { name: 'getName', value: 'function', type: 'function', variablesReference: 0 },
                { name: '__proto__', value: '{...}', type: 'object', variablesReference: 5 },
            ];

            const manager = new DataBreakpointManager();
            const suggestions = manager.suggestWatchpoints(variables);

            // Should include count and user, exclude function and __proto__
            expect(suggestions).toHaveLength(2);
            expect(suggestions.map((s) => s.name)).toContain('count');
            expect(suggestions.map((s) => s.name)).toContain('user');
        });
    });

    describe('clear', () => {
        it('should clear all data breakpoints', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'a');
            manager.add('var_2', 'b');
            manager.clear();

            expect(manager.getAll()).toHaveLength(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown for active watchpoints', () => {
            const manager = new DataBreakpointManager();
            manager.add('var_1', 'count', 'write');

            const md = manager.toMarkdown();
            expect(md).toContain('Data Breakpoints');
            expect(md).toContain('count');
            expect(md).toContain('write');
        });

        it('should show empty state', () => {
            const manager = new DataBreakpointManager();
            const md = manager.toMarkdown();
            expect(md).toContain('No data breakpoints');
        });
    });
});
