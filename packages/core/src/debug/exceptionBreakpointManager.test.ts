/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ExceptionBreakpointManager } from './exceptionBreakpointManager.js';
import type { ExceptionFilter } from './exceptionBreakpointManager.js';

const MOCK_FILTERS: ExceptionFilter[] = [
    {
        filterId: 'all',
        label: 'All Exceptions',
        description: 'Break on all thrown exceptions',
        defaultEnabled: false,
        supportsCondition: true,
        conditionDescription: 'Exception type or message pattern',
    },
    {
        filterId: 'uncaught',
        label: 'Uncaught Exceptions',
        description: 'Break only on uncaught exceptions',
        defaultEnabled: true,
        supportsCondition: false,
    },
    {
        filterId: 'userUnhandled',
        label: 'User-Unhandled',
        description: 'Break on exceptions not handled in user code',
        defaultEnabled: false,
        supportsCondition: true,
    },
];

describe('ExceptionBreakpointManager', () => {
    describe('registerFilters', () => {
        it('should register available filters', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            expect(mgr.getAvailableFilters()).toHaveLength(3);
        });

        it('should auto-enable default filters', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            const active = mgr.getActive();
            expect(active).toHaveLength(1);
            expect(active[0].filterId).toBe('uncaught');
        });
    });

    describe('enable/disable', () => {
        it('should enable a filter', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            expect(mgr.enable('all')).toBe(true);
            expect(mgr.getActive()).toHaveLength(2);
        });

        it('should reject unknown filter', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            expect(mgr.enable('nonexistent')).toBe(false);
        });

        it('should enable with condition', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            expect(mgr.enable('all', 'TypeError')).toBe(true);
            const active = mgr.getActive();
            const allBp = active.find((bp) => bp.filterId === 'all');
            expect(allBp?.condition).toBe('TypeError');
        });

        it('should reject condition on unsupported filter', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            expect(mgr.enable('uncaught', 'SomeCondition')).toBe(false);
        });

        it('should disable a filter', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            mgr.disable('uncaught');
            expect(mgr.getActive()).toHaveLength(0);
        });
    });

    describe('buildRequest', () => {
        it('should build DAP request args', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            mgr.enable('all', 'TypeError');

            const req = mgr.buildRequest();
            expect(req.filters).toContain('uncaught');
            expect(req.filterOptions).toHaveLength(1);
            expect(req.filterOptions[0].filterId).toBe('all');
            expect(req.filterOptions[0].condition).toBe('TypeError');
        });
    });

    describe('exception history', () => {
        it('should record and retrieve exceptions', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.recordException({
                exceptionId: 'TypeError',
                description: 'Cannot read property x of null',
                breakMode: 'always',
            });

            expect(mgr.getHistory()).toHaveLength(1);
            expect(mgr.getLastException()?.exceptionId).toBe('TypeError');
        });

        it('should track frequency', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.recordException({ exceptionId: 'TypeError', breakMode: 'always' });
            mgr.recordException({ exceptionId: 'TypeError', breakMode: 'always' });
            mgr.recordException({ exceptionId: 'RangeError', breakMode: 'always' });

            const freq = mgr.getExceptionFrequency();
            expect(freq[0].exceptionId).toBe('TypeError');
            expect(freq[0].count).toBe(2);
        });

        it('should cap history at max', () => {
            const mgr = new ExceptionBreakpointManager(3);
            for (let i = 0; i < 5; i++) {
                mgr.recordException({ exceptionId: `Error${String(i)}`, breakMode: 'always' });
            }
            expect(mgr.getHistory()).toHaveLength(3);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown', () => {
            const mgr = new ExceptionBreakpointManager();
            mgr.registerFilters(MOCK_FILTERS);
            mgr.recordException({
                exceptionId: 'TypeError',
                breakMode: 'always',
                details: { typeName: 'TypeError', message: 'null is not an object' },
            });

            const md = mgr.toMarkdown();
            expect(md).toContain('Exception Breakpoints');
            expect(md).toContain('uncaught');
            expect(md).toContain('TypeError');
        });
    });
});
