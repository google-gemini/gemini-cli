/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AdapterProcessManager } from './adapterProcessManager.js';

describe('AdapterProcessManager', () => {
    describe('checkAvailability', () => {
        it('should check Node.js availability', async () => {
            const mgr = new AdapterProcessManager();
            const result = await mgr.checkAvailability('node');
            // Node.js should be available in test environment
            expect(result.available).toBe(true);
            expect(result.version).toBeDefined();
        });

        it('should return available for custom language', async () => {
            const mgr = new AdapterProcessManager();
            const result = await mgr.checkAvailability('custom');
            expect(result.available).toBe(true);
        });
    });

    describe('list and get', () => {
        it('should start with empty list', () => {
            const mgr = new AdapterProcessManager();
            expect(mgr.list()).toHaveLength(0);
        });

        it('should return undefined for unknown adapter', () => {
            const mgr = new AdapterProcessManager();
            expect(mgr.get('nonexistent')).toBeUndefined();
        });
    });

    describe('isAlive', () => {
        it('should return false for unknown adapter', () => {
            const mgr = new AdapterProcessManager();
            expect(mgr.isAlive('nonexistent')).toBe(false);
        });
    });

    describe('toMarkdown', () => {
        it('should show empty state', () => {
            const mgr = new AdapterProcessManager();
            const md = mgr.toMarkdown();
            expect(md).toContain('No adapters running');
        });
    });

    describe('killAll', () => {
        it('should handle empty kill', async () => {
            const mgr = new AdapterProcessManager();
            await mgr.killAll();
            expect(mgr.list()).toHaveLength(0);
        });
    });
});
