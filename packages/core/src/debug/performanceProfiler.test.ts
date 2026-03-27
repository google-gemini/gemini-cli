/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceProfiler } from './performanceProfiler.js';

describe('PerformanceProfiler', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('markStop', () => {
        it('should record timing entries', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('main', 'app.ts', 1);
            expect(profiler.getEntries()).toHaveLength(1);
        });

        it('should calculate duration between stops', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('func1', 'a.ts', 1);

            vi.advanceTimersByTime(150);
            const entry = profiler.markStop('func2', 'a.ts', 10);

            expect(entry.duration).toBe(150);
        });

        it('should have zero duration for first stop', () => {
            const profiler = new PerformanceProfiler();
            const entry = profiler.markStop('main', 'app.ts', 1);
            expect(entry.duration).toBe(0);
        });
    });

    describe('getFunctionTimings', () => {
        it('should aggregate by function name', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('init', 'a.ts', 1);

            vi.advanceTimersByTime(50);
            profiler.markStop('process', 'a.ts', 10);

            vi.advanceTimersByTime(200);
            profiler.markStop('process', 'a.ts', 15);

            const timings = profiler.getFunctionTimings();
            const processFunc = timings.find((t) => t.functionName === 'process');
            expect(processFunc).toBeDefined();
            expect(processFunc!.hitCount).toBe(2);
            expect(processFunc!.totalTime).toBe(250); // 50 + 200
        });

        it('should sort by total time descending', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('setup', 'a.ts', 1);

            vi.advanceTimersByTime(500);
            profiler.markStop('slow', 'a.ts', 5);

            vi.advanceTimersByTime(10);
            profiler.markStop('fast', 'a.ts', 10);

            const timings = profiler.getFunctionTimings();
            expect(timings[0].functionName).toBe('slow');
        });
    });

    describe('getSlowFunctions', () => {
        it('should flag functions exceeding threshold', () => {
            const profiler = new PerformanceProfiler(100);
            profiler.markStop('setup', 'a.ts', 1);

            vi.advanceTimersByTime(200);
            profiler.markStop('slow', 'a.ts', 5);

            vi.advanceTimersByTime(50);
            profiler.markStop('fast', 'a.ts', 10);

            const slow = profiler.getSlowFunctions();
            expect(slow.length).toBeGreaterThan(0);
            expect(slow[0].functionName).toBe('slow');
            expect(slow[0].isSlow).toBe(true);
        });

        it('should return empty when no slow functions', () => {
            const profiler = new PerformanceProfiler(1000);
            profiler.markStop('fast', 'a.ts', 1);

            vi.advanceTimersByTime(10);
            profiler.markStop('end', 'a.ts', 5);

            expect(profiler.getSlowFunctions()).toHaveLength(0);
        });
    });

    describe('getReport', () => {
        it('should generate full report', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('a', 'x.ts', 1);

            vi.advanceTimersByTime(100);
            profiler.markStop('b', 'x.ts', 5);

            const report = profiler.getReport();
            expect(report.entries).toHaveLength(2);
            expect(report.totalTime).toBe(100);
            expect(report.functions.length).toBeGreaterThan(0);
        });
    });

    describe('clear', () => {
        it('should reset all data', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('a', 'x.ts', 1);
            profiler.clear();

            expect(profiler.getEntries()).toHaveLength(0);
            expect(profiler.getReport().totalTime).toBe(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with timing table', () => {
            const profiler = new PerformanceProfiler();
            profiler.markStop('init', 'app.ts', 1);

            vi.advanceTimersByTime(200);
            profiler.markStop('compute', 'app.ts', 10);

            const md = profiler.toMarkdown();
            expect(md).toContain('Performance Profile');
            expect(md).toContain('compute');
            expect(md).toContain('Slow');
        });

        it('should handle empty state', () => {
            const profiler = new PerformanceProfiler();
            expect(profiler.toMarkdown()).toContain('No performance data');
        });
    });
});
