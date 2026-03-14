/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BreakpointStore } from './breakpointStore.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

describe('BreakpointStore', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = join(os.tmpdir(), `bp-store-test-${String(Date.now())}`);
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    describe('add and get', () => {
        it('should add and retrieve breakpoints', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({ file: '/app/src/main.ts', line: 42 });
            store.add({ file: '/app/src/main.ts', line: 55, condition: 'x > 10' });
            store.add({ file: '/app/src/utils.ts', line: 10 });

            expect(store.getAll()).toHaveLength(3);
            expect(store.getForFile('/app/src/main.ts')).toHaveLength(2);
            expect(store.getForFile('/app/src/utils.ts')).toHaveLength(1);
        });

        it('should update existing breakpoint at same location', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({ file: '/app/src/main.ts', line: 42 });
            store.add({ file: '/app/src/main.ts', line: 42, condition: 'x > 0' });

            const bps = store.getAll();
            expect(bps).toHaveLength(1);
            expect(bps[0].condition).toBe('x > 0');
        });
    });

    describe('remove', () => {
        it('should remove a specific breakpoint', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({ file: '/app/src/main.ts', line: 42 });
            store.add({ file: '/app/src/main.ts', line: 55 });

            const removed = store.remove('/app/src/main.ts', 42);
            expect(removed).toBe(true);
            expect(store.getAll()).toHaveLength(1);
        });

        it('should return false if breakpoint not found', () => {
            const store = new BreakpointStore(tmpDir);
            expect(store.remove('/nonexistent.ts', 1)).toBe(false);
        });
    });

    describe('save and load', () => {
        it('should persist and restore breakpoints across instances', () => {
            const store1 = new BreakpointStore(tmpDir);
            store1.add({ file: '/app/src/main.ts', line: 42 });
            store1.add({ file: '/app/src/utils.ts', line: 10, logMessage: 'x = {x}' });
            store1.save();

            const store2 = new BreakpointStore(tmpDir);
            const loaded = store2.load();
            expect(loaded).toBe(true);
            expect(store2.getAll()).toHaveLength(2);

            const bp = store2.getForFile('/app/src/utils.ts')[0];
            expect(bp.logMessage).toBe('x = {x}');
        });

        it('should return false when no store file exists', () => {
            const store = new BreakpointStore(join(tmpDir, 'nonexistent'));
            expect(store.load()).toBe(false);
        });
    });

    describe('clear', () => {
        it('should remove all breakpoints', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({ file: '/app/src/main.ts', line: 42 });
            store.add({ file: '/app/src/main.ts', line: 55 });
            store.clear();

            expect(store.getAll()).toHaveLength(0);
        });
    });

    describe('getSummary', () => {
        it('should generate LLM-friendly summary', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({ file: '/app/src/main.ts', line: 42 });
            store.add({ file: '/app/src/main.ts', line: 55 });
            store.add({ file: '/app/src/utils.ts', line: 10 });

            const summary = store.getSummary();
            expect(summary).toContain('3 saved breakpoint(s)');
            expect(summary).toContain('42, 55');
        });

        it('should handle empty store', () => {
            const store = new BreakpointStore(tmpDir);
            expect(store.getSummary()).toBe('No saved breakpoints.');
        });
    });

    describe('logpoint support', () => {
        it('should store logMessage for logpoints', () => {
            const store = new BreakpointStore(tmpDir);
            store.add({
                file: '/app/src/main.ts',
                line: 42,
                logMessage: 'x = {x}, y = {y}',
            });

            const bp = store.getAll()[0];
            expect(bp.logMessage).toBe('x = {x}, y = {y}');
        });
    });
});
