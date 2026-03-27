/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { DebugSessionStateMachine, DebugState } from './debugSessionStateMachine.js';

describe('DebugSessionStateMachine', () => {
    describe('initial state', () => {
        it('should start in Idle', () => {
            const sm = new DebugSessionStateMachine();
            expect(sm.state).toBe(DebugState.Idle);
            expect(sm.isActive).toBe(false);
            expect(sm.isStopped).toBe(false);
            expect(sm.isRunning).toBe(false);
        });
    });

    describe('valid transitions', () => {
        it('should transition through launch lifecycle', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'user launched debug');
            expect(sm.state).toBe(DebugState.Connecting);
            expect(sm.isActive).toBe(true);

            sm.transition(DebugState.Initializing, 'DAP initialize');
            expect(sm.state).toBe(DebugState.Initializing);

            sm.transition(DebugState.Stopped, 'entry breakpoint');
            expect(sm.state).toBe(DebugState.Stopped);
            expect(sm.isStopped).toBe(true);
        });

        it('should transition through step cycle', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'entry');

            sm.transition(DebugState.Stepping, 'next');
            expect(sm.isRunning).toBe(true);
            expect(sm.isStopped).toBe(false);

            sm.transition(DebugState.Stopped, 'step completed');
            expect(sm.isStopped).toBe(true);
        });

        it('should handle continue → stopped cycle', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'breakpoint');

            sm.transition(DebugState.Running, 'continue');
            expect(sm.isRunning).toBe(true);

            sm.transition(DebugState.Stopped, 'breakpoint hit');
            expect(sm.isStopped).toBe(true);
        });

        it('should handle disconnect', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'entry');
            sm.transition(DebugState.Disconnecting, 'user disconnect');
            sm.transition(DebugState.Idle, 'disconnected');

            expect(sm.state).toBe(DebugState.Idle);
            expect(sm.isActive).toBe(false);
        });
    });

    describe('invalid transitions', () => {
        it('should reject Idle → Stopped', () => {
            const sm = new DebugSessionStateMachine();
            expect(() => sm.transition(DebugState.Stopped, 'bad')).toThrow(
                /Invalid state transition/,
            );
        });

        it('should reject Running → Stepping', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'entry');
            sm.transition(DebugState.Running, 'continue');

            expect(() => sm.transition(DebugState.Stepping, 'bad')).toThrow(
                /Invalid state transition/,
            );
        });

        it('should reject Stepping → Disconnecting', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'entry');
            sm.transition(DebugState.Stepping, 'next');

            expect(() => sm.transition(DebugState.Disconnecting, 'bad')).toThrow(
                /Invalid state transition/,
            );
        });
    });

    describe('canTransition', () => {
        it('should check valid transitions', () => {
            const sm = new DebugSessionStateMachine();
            expect(sm.canTransition(DebugState.Connecting)).toBe(true);
            expect(sm.canTransition(DebugState.Stopped)).toBe(false);
        });
    });

    describe('listeners', () => {
        it('should fire on state change', () => {
            const sm = new DebugSessionStateMachine();
            const listener = vi.fn();
            sm.onStateChange(listener);

            sm.transition(DebugState.Connecting, 'launch');
            expect(listener).toHaveBeenCalledWith(
                DebugState.Idle,
                DebugState.Connecting,
                'launch',
            );
        });

        it('should support unsubscribe', () => {
            const sm = new DebugSessionStateMachine();
            const listener = vi.fn();
            const unsub = sm.onStateChange(listener);

            sm.transition(DebugState.Connecting, 'launch');
            unsub();
            sm.transition(DebugState.Initializing, 'init');

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('history', () => {
        it('should track transition history', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');

            const h = sm.getHistory();
            expect(h).toHaveLength(2);
            expect(h[0].from).toBe(DebugState.Idle);
            expect(h[0].to).toBe(DebugState.Connecting);
        });

        it('should cap history at max', () => {
            const sm = new DebugSessionStateMachine(3);
            sm.transition(DebugState.Connecting, '1');
            sm.transition(DebugState.Initializing, '2');
            sm.transition(DebugState.Stopped, '3');
            sm.transition(DebugState.Running, '4');

            expect(sm.getHistory()).toHaveLength(3);
        });
    });

    describe('forceReset', () => {
        it('should reset to Idle from any state', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');

            sm.forceReset();
            expect(sm.state).toBe(DebugState.Idle);
        });
    });

    describe('error recovery', () => {
        it('should transition to Error from any active state', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Error, 'adapter crashed');
            expect(sm.state).toBe(DebugState.Error);
            expect(sm.isActive).toBe(false);
        });

        it('should recover from Error to Connecting', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Error, 'crash');
            sm.transition(DebugState.Connecting, 'retry');
            expect(sm.state).toBe(DebugState.Connecting);
        });
    });

    describe('toContext', () => {
        it('should generate LLM context', () => {
            const sm = new DebugSessionStateMachine();
            sm.transition(DebugState.Connecting, 'launch');
            sm.transition(DebugState.Initializing, 'init');
            sm.transition(DebugState.Stopped, 'breakpoint');
            sm.stopReason = 'breakpoint';

            const ctx = sm.toContext();
            expect(ctx).toContain('stopped');
            expect(ctx).toContain('breakpoint');
        });
    });
});
