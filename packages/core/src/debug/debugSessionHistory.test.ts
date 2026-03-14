/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugSessionHistory } from './debugSessionHistory.js';

describe('DebugSessionHistory', () => {
    describe('record', () => {
        it('should record debug actions', () => {
            const history = new DebugSessionHistory();
            history.record('debug_launch', { program: 'app.js' }, 'success');
            history.record('debug_set_breakpoint', { file: 'main.js', line: 10 }, 'verified');

            expect(history.length).toBe(2);
            expect(history.getActions()).toHaveLength(2);
        });

        it('should enforce max history size', () => {
            const history = new DebugSessionHistory();
            for (let i = 0; i < 110; i++) {
                history.record('debug_step', { action: 'next' }, `step ${String(i)}`);
            }

            expect(history.length).toBe(100);
        });
    });

    describe('getRecent', () => {
        it('should return the last N actions', () => {
            const history = new DebugSessionHistory();
            history.record('action1', {}, 'r1');
            history.record('action2', {}, 'r2');
            history.record('action3', {}, 'r3');

            const recent = history.getRecent(2);
            expect(recent).toHaveLength(2);
            expect(recent[0].action).toBe('action2');
            expect(recent[1].action).toBe('action3');
        });
    });

    describe('detectLoop', () => {
        it('should not detect loop with different actions', () => {
            const history = new DebugSessionHistory();
            history.record('debug_step', { action: 'next' }, 'ok');
            history.record('debug_get_stacktrace', {}, 'ok');
            history.record('debug_get_variables', {}, 'ok');

            expect(history.detectLoop().detected).toBe(false);
        });

        it('should detect loop when same action with same params repeats', () => {
            const history = new DebugSessionHistory();
            const params = { action: 'next' };
            history.record('debug_step', params, 'stepped');
            history.record('debug_step', params, 'stepped');
            history.record('debug_step', params, 'stepped');

            const result = history.detectLoop();
            expect(result.detected).toBe(true);
            expect(result.pattern).toBe('debug_step');
            expect(result.repeatCount).toBe(3);
            expect(result.suggestion).toBeDefined();
        });

        it('should not detect loop when same action but different params', () => {
            const history = new DebugSessionHistory();
            history.record('debug_evaluate', { expression: 'x' }, '1');
            history.record('debug_evaluate', { expression: 'y' }, '2');
            history.record('debug_evaluate', { expression: 'z' }, '3');

            expect(history.detectLoop().detected).toBe(false);
        });

        it('should not detect loop with too few actions', () => {
            const history = new DebugSessionHistory();
            history.record('debug_step', {}, 'ok');

            expect(history.detectLoop().detected).toBe(false);
        });

        it('should suggest escape strategies for known action types', () => {
            const history = new DebugSessionHistory();
            const params = { action: 'next' };
            history.record('debug_step', params, 'stepped');
            history.record('debug_step', params, 'stepped');
            history.record('debug_step', params, 'stepped');

            const result = history.detectLoop();
            expect(result.suggestion).toContain('debug_evaluate');
        });

        it('should provide generic suggestion for unknown action types', () => {
            const history = new DebugSessionHistory();
            history.record('unknown_action', {}, 'ok');
            history.record('unknown_action', {}, 'ok');
            history.record('unknown_action', {}, 'ok');

            const result = history.detectLoop();
            expect(result.detected).toBe(true);
            expect(result.suggestion).toContain('different');
        });
    });

    describe('clear', () => {
        it('should clear all history', () => {
            const history = new DebugSessionHistory();
            history.record('action1', {}, 'r1');
            history.record('action2', {}, 'r2');
            history.clear();

            expect(history.length).toBe(0);
            expect(history.getActions()).toHaveLength(0);
        });
    });

    describe('getSummary', () => {
        it('should generate empty summary for no actions', () => {
            const history = new DebugSessionHistory();
            expect(history.getSummary()).toContain('No debug actions');
        });

        it('should generate action frequency summary', () => {
            const history = new DebugSessionHistory();
            history.record('debug_step', {}, 'ok');
            history.record('debug_step', {}, 'ok');
            history.record('debug_get_variables', {}, 'ok');

            const summary = history.getSummary();
            expect(summary).toContain('3 actions');
            expect(summary).toContain('debug_step');
            expect(summary).toContain('2 times');
        });

        it('should include loop warning when loop detected', () => {
            const history = new DebugSessionHistory();
            const params = { action: 'next' };
            history.record('debug_step', params, 'ok');
            history.record('debug_step', params, 'ok');
            history.record('debug_step', params, 'ok');

            const summary = history.getSummary();
            expect(summary).toContain('Loop detected');
            expect(summary).toContain('Suggestion');
        });
    });
});
