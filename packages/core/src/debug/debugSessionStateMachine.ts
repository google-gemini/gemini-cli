/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Session State Machine — Production-grade lifecycle management.
 *
 * WHY THIS MATTERS:
 * Right now our debug session is a bare `let activeSession: DAPClient | null`.
 * That's fine for a toy demo but is a disaster in production because:
 *
 *   1. Race conditions: What if the LLM fires debug_step while we're
 *      still processing debug_launch? The singleton has no idea.
 *   2. Invalid transitions: What if the agent calls debug_evaluate
 *      while the program is running (not stopped)? Undefined behavior.
 *   3. No observability: We can't tell the LLM "the session is in state X"
 *      without tracking state.
 *   4. No error recovery: When an adapter crashes, we need to transition
 *      to an error state, not silently break.
 *
 * This implements a proper FSM with 7 states and validated transitions:
 *
 *   idle → connecting → initializing → stopped ⇄ running → disconnecting → idle
 *                                         ↑         ↓
 *                                       stepping ←←←
 *
 * Every state change emits an event, and invalid transitions throw
 * with a clear error message ("Cannot step while session is running").
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum DebugState {
    /** No debug session active */
    Idle = 'idle',
    /** TCP connection to adapter in progress */
    Connecting = 'connecting',
    /** DAP initialize/launch/attach sequence running */
    Initializing = 'initializing',
    /** Program paused at breakpoint/entry/exception */
    Stopped = 'stopped',
    /** Program executing between breakpoints */
    Running = 'running',
    /** Step operation in progress (next/stepIn/stepOut) */
    Stepping = 'stepping',
    /** Disconnect in progress, cleaning up */
    Disconnecting = 'disconnecting',
    /** Unrecoverable error */
    Error = 'error',
}

export interface StateTransition {
    from: DebugState;
    to: DebugState;
    timestamp: number;
    reason: string;
}

export type StateChangeListener = (
    from: DebugState,
    to: DebugState,
    reason: string,
) => void;

// ---------------------------------------------------------------------------
// Transition Rules
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DebugState, DebugState[]> = {
    [DebugState.Idle]: [DebugState.Connecting],
    [DebugState.Connecting]: [DebugState.Initializing, DebugState.Error, DebugState.Idle],
    [DebugState.Initializing]: [DebugState.Stopped, DebugState.Running, DebugState.Error, DebugState.Idle],
    [DebugState.Stopped]: [DebugState.Running, DebugState.Stepping, DebugState.Disconnecting, DebugState.Error],
    [DebugState.Running]: [DebugState.Stopped, DebugState.Disconnecting, DebugState.Error, DebugState.Idle],
    [DebugState.Stepping]: [DebugState.Stopped, DebugState.Error, DebugState.Idle],
    [DebugState.Disconnecting]: [DebugState.Idle, DebugState.Error],
    [DebugState.Error]: [DebugState.Idle, DebugState.Connecting],
};

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

export class DebugSessionStateMachine {
    private currentState: DebugState = DebugState.Idle;
    private readonly history: StateTransition[] = [];
    private readonly listeners: StateChangeListener[] = [];
    private readonly maxHistory: number;

    /** Reason for the current stop (e.g., 'breakpoint', 'exception', 'step') */
    stopReason: string = '';
    /** Thread ID that caused the stop */
    stoppedThreadId: number = 0;

    constructor(maxHistory: number = 50) {
        this.maxHistory = maxHistory;
    }

    /**
     * Get current state.
     */
    get state(): DebugState {
        return this.currentState;
    }

    /**
     * Transition to a new state.
     * @throws Error if the transition is invalid.
     */
    transition(to: DebugState, reason: string): void {
        const from = this.currentState;
        const validTargets = VALID_TRANSITIONS[from];

        if (!validTargets.includes(to)) {
            throw new Error(
                `Invalid state transition: ${from} → ${to}. ` +
                `Valid transitions from '${from}': [${validTargets.join(', ')}]. ` +
                `Reason attempted: ${reason}`,
            );
        }

        this.currentState = to;

        const transition: StateTransition = {
            from,
            to,
            timestamp: Date.now(),
            reason,
        };

        this.history.push(transition);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Notify listeners
        for (const listener of this.listeners) {
            try {
                listener(from, to, reason);
            } catch {
                // Don't let listener errors break state transitions
            }
        }
    }

    /**
     * Check if a transition is valid WITHOUT performing it.
     */
    canTransition(to: DebugState): boolean {
        return VALID_TRANSITIONS[this.currentState].includes(to);
    }

    /**
     * Is the session in a state where it can accept debug commands?
     */
    get isActive(): boolean {
        return this.currentState !== DebugState.Idle &&
               this.currentState !== DebugState.Error;
    }

    /**
     * Is the program paused and ready for inspection?
     */
    get isStopped(): boolean {
        return this.currentState === DebugState.Stopped;
    }

    /**
     * Is the program currently executing?
     */
    get isRunning(): boolean {
        return this.currentState === DebugState.Running ||
               this.currentState === DebugState.Stepping;
    }

    /**
     * Register a state change listener.
     */
    onStateChange(listener: StateChangeListener): () => void {
        this.listeners.push(listener);
        return () => {
            const idx = this.listeners.indexOf(listener);
            if (idx >= 0) this.listeners.splice(idx, 1);
        };
    }

    /**
     * Get transition history.
     */
    getHistory(): StateTransition[] {
        return [...this.history];
    }

    /**
     * Get time spent in each state.
     */
    getStateTimings(): Record<DebugState, number> {
        const timings: Record<string, number> = {};
        for (const state of Object.values(DebugState)) {
            timings[state] = 0;
        }

        for (let i = 1; i < this.history.length; i++) {
            const prev = this.history[i - 1];
            const curr = this.history[i];
            timings[prev.to] += curr.timestamp - prev.timestamp;
        }

        return timings as Record<DebugState, number>;
    }

    /**
     * Force reset to idle (for error recovery).
     */
    forceReset(): void {
        const from = this.currentState;
        this.currentState = DebugState.Idle;
        this.stopReason = '';
        this.stoppedThreadId = 0;

        this.history.push({
            from,
            to: DebugState.Idle,
            timestamp: Date.now(),
            reason: 'force_reset',
        });

        for (const listener of this.listeners) {
            try {
                listener(from, DebugState.Idle, 'force_reset');
            } catch {
                // Ignore
            }
        }
    }

    /**
     * Generate LLM context summary of session state.
     */
    toContext(): string {
        const parts: string[] = [];
        parts.push(`Session State: ${this.currentState}`);

        if (this.isStopped) {
            parts.push(`Stop Reason: ${this.stopReason || 'unknown'}`);
            if (this.stoppedThreadId) {
                parts.push(`Thread: ${String(this.stoppedThreadId)}`);
            }
        }

        const timings = this.getStateTimings();
        const totalStopped = timings[DebugState.Stopped];
        if (totalStopped > 0) {
            parts.push(`Time paused: ${String(Math.round(totalStopped / 1000))}s`);
        }

        return parts.join(' | ');
    }
}
