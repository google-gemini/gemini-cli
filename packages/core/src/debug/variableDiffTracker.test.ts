/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { VariableDiffTracker } from './variableDiffTracker.js';

describe('VariableDiffTracker', () => {
    describe('capture', () => {
        it('should capture a snapshot', () => {
            const tracker = new VariableDiffTracker();
            const snap = tracker.capture(
                { x: '5', y: 'hello' },
                { file: '/app/main.ts', line: 10, function: 'main' },
            );

            expect(snap.stopNumber).toBe(1);
            expect(snap.variables.get('x')).toBe('5');
            expect(tracker.getSnapshotCount()).toBe(1);
        });

        it('should evict old snapshots', () => {
            const tracker = new VariableDiffTracker(3);
            for (let i = 0; i < 5; i++) {
                tracker.capture({ x: String(i) }, { file: 'f.ts', line: i });
            }
            expect(tracker.getSnapshotCount()).toBe(3);
        });
    });

    describe('lastDiff', () => {
        it('should compute diff between last two snapshots', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '5', y: 'hello' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '10', y: 'hello', z: 'new' }, { file: 'f.ts', line: 2 });

            const diff = tracker.lastDiff();
            expect(diff).toBeDefined();
            expect(diff!.summary.changed).toBe(1);  // x: 5→10
            expect(diff!.summary.added).toBe(1);    // z: new
            expect(diff!.summary.unchanged).toBe(1); // y: hello
        });

        it('should detect removed variables', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '5', y: 'hello' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '5' }, { file: 'f.ts', line: 2 });

            const diff = tracker.lastDiff();
            expect(diff!.summary.removed).toBe(1);  // y removed
        });

        it('should return null with < 2 snapshots', () => {
            const tracker = new VariableDiffTracker();
            expect(tracker.lastDiff()).toBeNull();
            tracker.capture({ x: '5' }, { file: 'f.ts', line: 1 });
            expect(tracker.lastDiff()).toBeNull();
        });
    });

    describe('diff', () => {
        it('should compute diff between specific stops', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '1' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '2' }, { file: 'f.ts', line: 2 });
            tracker.capture({ x: '3' }, { file: 'f.ts', line: 3 });

            const diff = tracker.diff(1, 3);
            expect(diff).toBeDefined();
            expect(diff!.changes.find((c) => c.name === 'x')?.currentValue).toBe('3');
        });

        it('should return null for missing stops', () => {
            const tracker = new VariableDiffTracker();
            expect(tracker.diff(1, 2)).toBeNull();
        });
    });

    describe('getTimeline', () => {
        it('should track variable values over time', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '1' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '2' }, { file: 'f.ts', line: 2 });
            tracker.capture({ x: '5' }, { file: 'f.ts', line: 3 });

            const timeline = tracker.getTimeline('x');
            expect(timeline.history).toHaveLength(3);
            expect(timeline.isConstant).toBe(false);
            expect(timeline.distinctValues).toBe(3);
        });

        it('should detect constant variables', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '1' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '1' }, { file: 'f.ts', line: 2 });

            expect(tracker.getTimeline('x').isConstant).toBe(true);
        });
    });

    describe('getMostVolatile', () => {
        it('should rank by change count', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '1', y: 'a' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '2', y: 'a' }, { file: 'f.ts', line: 2 });
            tracker.capture({ x: '3', y: 'b' }, { file: 'f.ts', line: 3 });
            tracker.capture({ x: '4', y: 'b' }, { file: 'f.ts', line: 4 });

            const volatile = tracker.getMostVolatile();
            expect(volatile[0].name).toBe('x');
            expect(volatile[0].changeCount).toBe(3);
        });
    });

    describe('findNullifications', () => {
        it('should detect values becoming null', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ user: '{"name":"Alice"}' }, { file: 'f.ts', line: 1 });
            tracker.capture({ user: 'null' }, { file: 'f.ts', line: 2 });

            const nulls = tracker.findNullifications();
            expect(nulls).toHaveLength(1);
            expect(nulls[0].name).toBe('user');
            expect(nulls[0].previousValue).toBe('{"name":"Alice"}');
        });

        it('should detect values becoming undefined', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '42' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: 'undefined' }, { file: 'f.ts', line: 2 });

            expect(tracker.findNullifications()).toHaveLength(1);
        });

        it('should not flag null→null', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: 'null' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: 'null' }, { file: 'f.ts', line: 2 });

            expect(tracker.findNullifications()).toHaveLength(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown report', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '5', user: '{"name":"Alice"}' }, { file: 'f.ts', line: 1 });
            tracker.capture({ x: '10', user: 'null' }, { file: 'f.ts', line: 2 });

            const md = tracker.toMarkdown();
            expect(md).toContain('Variable Changes');
            expect(md).toContain('changed');
            expect(md).toContain('null');
        });

        it('should handle empty state', () => {
            const tracker = new VariableDiffTracker();
            expect(tracker.toMarkdown()).toContain('No variable snapshots');
        });
    });

    describe('clear', () => {
        it('should reset everything', () => {
            const tracker = new VariableDiffTracker();
            tracker.capture({ x: '1' }, { file: 'f.ts', line: 1 });
            tracker.clear();

            expect(tracker.getSnapshotCount()).toBe(0);
            expect(tracker.lastDiff()).toBeNull();
        });
    });
});
