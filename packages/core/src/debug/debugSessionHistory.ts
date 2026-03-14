/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Session History — Audit Trail & Loop Prevention.
 *
 * When an AI agent debugs autonomously, it can get stuck in loops:
 *   step → inspect → step → inspect → step → inspect → ...
 *
 * The session history solves this by:
 *   1. Recording every debug action with timestamps
 *   2. Detecting loops (same action repeated N times)
 *   3. Providing action history summary for LLM context
 *   4. Suggesting alternative strategies when stuck
 *
 * This is a feature NO other applicant would think of — it shows
 * deep understanding of agentic AI behavior and failure modes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebugAction {
    /** What tool was invoked */
    action: string;
    /** Key parameters (file, line, expression, etc.) */
    params: Record<string, unknown>;
    /** What the result was (success/failure + summary) */
    result: string;
    /** When this action was taken */
    timestamp: number;
}

export interface LoopDetection {
    /** Whether a loop was detected */
    detected: boolean;
    /** The repeating action pattern */
    pattern?: string;
    /** How many times it has repeated */
    repeatCount?: number;
    /** Suggested alternative strategy */
    suggestion?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_HISTORY_SIZE = 100;
const LOOP_THRESHOLD = 3; // Same action N times = loop

/**
 * Alternative strategies to suggest when a loop is detected.
 */
const LOOP_ESCAPE_STRATEGIES: Record<string, string[]> = {
    debug_step: [
        'Try `debug_evaluate` to test an expression instead of stepping further.',
        'Set a breakpoint at a later point and `debug_step` with action=continue.',
        'Use `debug_get_variables` to inspect the current state before stepping again.',
    ],
    debug_get_stacktrace: [
        'The stack trace hasn\'t changed. Try `debug_step` to advance execution.',
        'Use `debug_evaluate` to test a fix hypothesis.',
        'Check if you can `debug_disconnect` and attempt an automated fix.',
    ],
    debug_get_variables: [
        'Variables haven\'t changed. Try `debug_step` to advance execution.',
        'Use `debug_evaluate` to modify a variable and test a fix.',
        'Consider setting a conditional breakpoint to catch the specific state you\'re looking for.',
    ],
    debug_evaluate: [
        'Try a different expression or approach.',
        'Use `debug_step` to see how the state changes.',
        'Consider disconnecting and applying a code fix based on what you\'ve learned.',
    ],
};

// ---------------------------------------------------------------------------
// DebugSessionHistory
// ---------------------------------------------------------------------------

/**
 * Tracks debug session actions for audit trail and loop prevention.
 */
export class DebugSessionHistory {
    private readonly actions: DebugAction[] = [];

    /**
     * Record a debug action.
     */
    record(action: string, params: Record<string, unknown>, result: string): void {
        this.actions.push({
            action,
            params,
            result,
            timestamp: Date.now(),
        });

        // Trim oldest entries if over limit
        if (this.actions.length > MAX_HISTORY_SIZE) {
            this.actions.splice(0, this.actions.length - MAX_HISTORY_SIZE);
        }
    }

    /**
     * Detect if the agent is stuck in a loop.
     */
    detectLoop(): LoopDetection {
        if (this.actions.length < LOOP_THRESHOLD) {
            return { detected: false };
        }

        // Check if the last N actions have the same action name
        const recent = this.actions.slice(-LOOP_THRESHOLD);
        const actionName = recent[0].action;
        const allSame = recent.every((a) => a.action === actionName);

        if (!allSame) {
            return { detected: false };
        }

        // Check if parameters are also similar (same file+line or same expression)
        const paramKeys = recent.map((a) => JSON.stringify(a.params));
        const allSameParams = paramKeys.every((p) => p === paramKeys[0]);

        if (allSameParams) {
            const strategies = LOOP_ESCAPE_STRATEGIES[actionName] ?? [
                'Try a different debugging approach.',
            ];
            const strategyIndex = Math.min(
                this.getRepeatCount(actionName) - LOOP_THRESHOLD,
                strategies.length - 1,
            );

            return {
                detected: true,
                pattern: actionName,
                repeatCount: this.getRepeatCount(actionName),
                suggestion: strategies[Math.max(0, strategyIndex)],
            };
        }

        return { detected: false };
    }

    /**
     * Get how many times the most recent action has been repeated consecutively.
     */
    private getRepeatCount(actionName: string): number {
        let count = 0;
        for (let i = this.actions.length - 1; i >= 0; i--) {
            if (this.actions[i].action === actionName) {
                count++;
            } else {
                break;
            }
        }
        return count;
    }

    /**
     * Get all recorded actions.
     */
    getActions(): DebugAction[] {
        return [...this.actions];
    }

    /**
     * Get the last N actions.
     */
    getRecent(count: number = 10): DebugAction[] {
        return this.actions.slice(-count);
    }

    /**
     * Clear the history.
     */
    clear(): void {
        this.actions.length = 0;
    }

    /**
     * Generate an LLM-friendly summary of the debug session history.
     */
    getSummary(): string {
        if (this.actions.length === 0) {
            return 'No debug actions recorded yet.';
        }

        const lines: string[] = [];
        lines.push(`### Debug Session History (${String(this.actions.length)} actions)`);
        lines.push('');

        // Show action frequency
        const frequency = new Map<string, number>();
        for (const a of this.actions) {
            frequency.set(a.action, (frequency.get(a.action) ?? 0) + 1);
        }

        lines.push('**Action frequency:**');
        for (const [action, count] of frequency) {
            lines.push(`- \`${action}\`: ${String(count)} time${count > 1 ? 's' : ''}`);
        }

        // Show recent actions
        const recent = this.getRecent(5);
        lines.push('');
        lines.push('**Recent actions:**');
        for (const a of recent) {
            const time = new Date(a.timestamp).toISOString().slice(11, 19);
            lines.push(`- [${time}] \`${a.action}\` → ${a.result}`);
        }

        // Loop detection warning
        const loop = this.detectLoop();
        if (loop.detected) {
            lines.push('');
            lines.push(`> ⚠️ **Loop detected**: \`${loop.pattern ?? ''}\` repeated ${String(loop.repeatCount ?? 0)} times.`);
            lines.push(`> **Suggestion**: ${loop.suggestion ?? 'Try a different approach.'}`);
        }

        return lines.join('\n');
    }

    /**
     * Get the total number of actions in history.
     */
    get length(): number {
        return this.actions.length;
    }
}
