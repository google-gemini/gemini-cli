/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance Profiler — Timing Analysis Between Debug Stops.
 *
 * When debugging, timing matters. A function that takes 200ms might
 * be the root cause of a performance issue. This module tracks:
 *
 *   1. Time between debug stops (breakpoint → breakpoint)
 *   2. Time spent in each function frame
 *   3. Cumulative time per function across multiple stops
 *   4. Flags functions that exceed a configurable threshold
 *
 * This transforms the debug companion from "find bugs" to
 * "find bugs AND performance bottlenecks" — a killer combo.
 *
 * Usage flow:
 *   - Agent calls markStop() each time the debugger stops
 *   - Profiler calculates delta from previous stop
 *   - After stepping through a function, getReport() shows timing
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimingEntry {
    /** Function name */
    functionName: string;
    /** Source file */
    file: string;
    /** Line number */
    line: number;
    /** Time of this stop (ms since epoch) */
    timestamp: number;
    /** Duration since previous stop (ms) */
    duration: number;
    /** Stop reason (breakpoint, step, exception) */
    reason: string;
}

export interface FunctionTiming {
    /** Function name */
    functionName: string;
    /** Total time spent (ms) */
    totalTime: number;
    /** Number of stops in this function */
    hitCount: number;
    /** Average time per stop (ms) */
    averageTime: number;
    /** Whether this function is flagged as slow */
    isSlow: boolean;
}

export interface PerformanceReport {
    /** All timing entries */
    entries: TimingEntry[];
    /** Per-function aggregation */
    functions: FunctionTiming[];
    /** Total debug session time */
    totalTime: number;
    /** Number of slow functions detected */
    slowFunctionCount: number;
}

// ---------------------------------------------------------------------------
// PerformanceProfiler
// ---------------------------------------------------------------------------

/**
 * Tracks timing between debug stops to identify performance bottlenecks.
 */
export class PerformanceProfiler {
    private readonly entries: TimingEntry[] = [];
    private readonly slowThresholdMs: number;
    private lastStopTime: number | null = null;

    constructor(slowThresholdMs: number = 100) {
        this.slowThresholdMs = slowThresholdMs;
    }

    /**
     * Record a debug stop with timing.
     */
    markStop(
        functionName: string,
        file: string,
        line: number,
        reason: string = 'step',
    ): TimingEntry {
        const now = Date.now();
        const duration = this.lastStopTime !== null ? now - this.lastStopTime : 0;

        const entry: TimingEntry = {
            functionName,
            file,
            line,
            timestamp: now,
            duration,
            reason,
        };

        this.entries.push(entry);
        this.lastStopTime = now;

        return entry;
    }

    /**
     * Get all timing entries.
     */
    getEntries(): TimingEntry[] {
        return [...this.entries];
    }

    /**
     * Get per-function timing aggregation.
     */
    getFunctionTimings(): FunctionTiming[] {
        const funcMap = new Map<string, { totalTime: number; hitCount: number }>();

        for (const entry of this.entries) {
            const key = entry.functionName;
            const existing = funcMap.get(key);
            if (existing) {
                existing.totalTime += entry.duration;
                existing.hitCount += 1;
            } else {
                funcMap.set(key, { totalTime: entry.duration, hitCount: 1 });
            }
        }

        const timings: FunctionTiming[] = [];
        for (const [name, data] of funcMap) {
            timings.push({
                functionName: name,
                totalTime: data.totalTime,
                hitCount: data.hitCount,
                averageTime: data.hitCount > 0 ? data.totalTime / data.hitCount : 0,
                isSlow: data.totalTime > this.slowThresholdMs,
            });
        }

        // Sort by total time descending
        timings.sort((a, b) => b.totalTime - a.totalTime);
        return timings;
    }

    /**
     * Get the full performance report.
     */
    getReport(): PerformanceReport {
        const functions = this.getFunctionTimings();
        const totalTime = this.entries.reduce((sum, e) => sum + e.duration, 0);

        return {
            entries: [...this.entries],
            functions,
            totalTime,
            slowFunctionCount: functions.filter((f) => f.isSlow).length,
        };
    }

    /**
     * Get slow functions exceeding the threshold.
     */
    getSlowFunctions(): FunctionTiming[] {
        return this.getFunctionTimings().filter((f) => f.isSlow);
    }

    /**
     * Clear all timing data.
     */
    clear(): void {
        this.entries.length = 0;
        this.lastStopTime = null;
    }

    /**
     * Generate LLM-friendly markdown performance report.
     */
    toMarkdown(): string {
        const report = this.getReport();

        if (report.entries.length === 0) {
            return 'No performance data collected.';
        }

        const lines: string[] = [];
        lines.push('### ⏱️ Performance Profile');
        lines.push('');
        lines.push(`**Total time**: ${String(report.totalTime)}ms across ${String(report.entries.length)} stops`);

        if (report.slowFunctionCount > 0) {
            lines.push(`**⚠️ ${String(report.slowFunctionCount)} slow function(s)** detected (>${String(this.slowThresholdMs)}ms)`);
        }

        lines.push('');
        lines.push('| Function | Total (ms) | Hits | Avg (ms) | Status |');
        lines.push('|----------|-----------|------|---------|--------|');

        for (const f of report.functions.slice(0, 10)) {
            const status = f.isSlow ? '🔴 Slow' : '🟢 OK';
            lines.push(
                `| \`${f.functionName}\` | ${String(Math.round(f.totalTime))} | ${String(f.hitCount)} | ${String(Math.round(f.averageTime))} | ${status} |`,
            );
        }

        return lines.join('\n');
    }
}
