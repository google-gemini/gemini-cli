/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugTelemetryCollector } from './debugTelemetryCollector.js';

describe('DebugTelemetryCollector', () => {
    describe('recordToolUse', () => {
        it('should track tool invocations', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordToolUse('debug_launch', true, 100);
            collector.recordToolUse('debug_launch', true, 200);
            collector.recordToolUse('debug_launch', false, 50);

            const metric = collector.getToolMetric('debug_launch');
            expect(metric).toBeDefined();
            expect(metric!.invocations).toBe(3);
            expect(metric!.successes).toBe(2);
            expect(metric!.failures).toBe(1);
        });

        it('should calculate average duration', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordToolUse('debug_step', true, 100);
            collector.recordToolUse('debug_step', true, 200);

            const metric = collector.getToolMetric('debug_step');
            expect(metric!.avgDuration).toBe(150);
            expect(metric!.totalDuration).toBe(300);
        });
    });

    describe('recordSession', () => {
        it('should track sessions', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordSession({
                sessionId: 'sess-1',
                language: 'typescript',
                duration: 5000,
                toolInvocations: 10,
                outcome: 'fixed',
                errorPatterns: ['null-reference'],
            });

            expect(collector.getSummary().totalSessions).toBe(1);
        });
    });

    describe('getFixRate', () => {
        it('should calculate fix rate correctly', () => {
            const collector = new DebugTelemetryCollector();

            collector.recordSession({
                sessionId: '1', language: 'ts', duration: 1000,
                toolInvocations: 5, outcome: 'fixed', errorPatterns: [],
            });
            collector.recordSession({
                sessionId: '2', language: 'ts', duration: 2000,
                toolInvocations: 8, outcome: 'unresolved', errorPatterns: [],
            });
            collector.recordSession({
                sessionId: '3', language: 'ts', duration: 1500,
                toolInvocations: 6, outcome: 'fixed', errorPatterns: [],
            });

            expect(collector.getFixRate()).toBeCloseTo(66.67, 0);
        });

        it('should return 0 for no sessions', () => {
            const collector = new DebugTelemetryCollector();
            expect(collector.getFixRate()).toBe(0);
        });
    });

    describe('getTopPatterns', () => {
        it('should rank patterns by frequency', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordPattern('null-reference');
            collector.recordPattern('null-reference');
            collector.recordPattern('null-reference');
            collector.recordPattern('type-error');
            collector.recordPattern('async-await');
            collector.recordPattern('async-await');

            const top = collector.getTopPatterns(2);
            expect(top).toHaveLength(2);
            expect(top[0].pattern).toBe('null-reference');
            expect(top[0].count).toBe(3);
        });

        it('should also count patterns from sessions', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordSession({
                sessionId: '1', language: 'ts', duration: 1000,
                toolInvocations: 5, outcome: 'fixed',
                errorPatterns: ['null-reference', 'type-error'],
            });

            const top = collector.getTopPatterns();
            expect(top.length).toBeGreaterThan(0);
        });
    });

    describe('getSummary', () => {
        it('should produce a complete summary', () => {
            const collector = new DebugTelemetryCollector();

            collector.recordToolUse('debug_launch', true, 100);
            collector.recordToolUse('debug_step', true, 10);
            collector.recordSession({
                sessionId: '1', language: 'ts', duration: 3000,
                toolInvocations: 2, outcome: 'fixed',
                errorPatterns: ['null-reference'],
            });

            const summary = collector.getSummary();
            expect(summary.totalSessions).toBe(1);
            expect(summary.fixRate).toBe(100);
            expect(summary.totalInvocations).toBe(2);
            expect(summary.topTools.length).toBe(2);
        });
    });

    describe('clear', () => {
        it('should reset all data', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordToolUse('debug_launch', true);
            collector.recordSession({
                sessionId: '1', language: 'ts', duration: 1000,
                toolInvocations: 1, outcome: 'fixed', errorPatterns: [],
            });
            collector.recordPattern('test');

            collector.clear();

            expect(collector.getToolMetrics()).toHaveLength(0);
            expect(collector.getSummary().totalSessions).toBe(0);
            expect(collector.getTopPatterns()).toHaveLength(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown report', () => {
            const collector = new DebugTelemetryCollector();
            collector.recordToolUse('debug_launch', true, 100);
            collector.recordToolUse('debug_step', true, 10);
            collector.recordSession({
                sessionId: '1', language: 'ts', duration: 3000,
                toolInvocations: 2, outcome: 'fixed',
                errorPatterns: ['null-reference'],
            });

            const md = collector.toMarkdown();
            expect(md).toContain('Telemetry Report');
            expect(md).toContain('Fix Rate');
            expect(md).toContain('debug_launch');
        });

        it('should handle empty state', () => {
            const collector = new DebugTelemetryCollector();
            expect(collector.toMarkdown()).toContain('No telemetry');
        });
    });
});
