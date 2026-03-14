/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Conditional Step Runner — Autonomous Stepping Until Condition Met.
 *
 * Instead of the agent manually stepping 50 times and checking each
 * time, this module provides "step until" functionality:
 *
 *   Agent: "Step until counter > 10"
 *   → Autonomously steps, evaluating the condition each time
 *   → Stops when condition is true (or max steps reached)
 *   → Returns the state at the stopping point
 *
 * This prevents the agent from flooding the context window with
 * repetitive step commands and makes debugging loops/iterations
 * much more efficient.
 *
 * Safety features:
 *   - Max step limit (default 50) prevents infinite stepping
 *   - Timeout (default 30s) prevents hanging
 *   - Records all intermediate states for analysis
 */



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepUntilOptions {
    /** The condition to check after each step */
    condition: string;
    /** Maximum number of steps before giving up */
    maxSteps?: number;
    /** Step type: 'next' (over), 'in', 'out' */
    stepType?: 'next' | 'in' | 'out';
    /** Thread ID to step */
    threadId?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
}

export interface StepUntilResult {
    /** Whether the condition was met */
    conditionMet: boolean;
    /** Number of steps taken */
    stepsTaken: number;
    /** The final condition value */
    finalValue: string;
    /** Why stepping stopped */
    reason: 'condition-met' | 'max-steps' | 'timeout' | 'error';
    /** Error message if reason is 'error' */
    error?: string;
    /** Values of the condition at each step */
    conditionHistory: Array<{ step: number; value: string }>;
}

/** Minimal interface for evaluating expressions in the debuggee. */
export interface ExpressionEvaluator {
    evaluate(expression: string, frameId?: number): Promise<{ result: string; type: string }>;
}

/** Minimal interface for stepping the debugger. */
export interface StepController {
    step(action: string, threadId?: number): Promise<void>;
    waitForStop(): Promise<{ reason: string; threadId: number }>;
}

// ---------------------------------------------------------------------------
// ConditionalStepRunner
// ---------------------------------------------------------------------------

/**
 * Autonomously steps through code until a condition is met.
 */
export class ConditionalStepRunner {
    private readonly defaultMaxSteps: number;
    private readonly defaultTimeoutMs: number;

    constructor(defaultMaxSteps: number = 50, defaultTimeoutMs: number = 30000) {
        this.defaultMaxSteps = defaultMaxSteps;
        this.defaultTimeoutMs = defaultTimeoutMs;
    }

    /**
     * Step until a condition evaluates to truthy, or limits are hit.
     */
    async run(
        evaluator: ExpressionEvaluator,
        stepper: StepController,
        options: StepUntilOptions,
    ): Promise<StepUntilResult> {
        const maxSteps = options.maxSteps ?? this.defaultMaxSteps;
        const stepType = options.stepType ?? 'next';
        const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
        const threadId = options.threadId ?? 1;

        const conditionHistory: Array<{ step: number; value: string }> = [];
        const startTime = Date.now();
        let stepsTaken = 0;

        try {
            // Check the condition BEFORE the first step
            const initialCheck = await this.evaluateCondition(evaluator, options.condition);
            conditionHistory.push({ step: 0, value: initialCheck });

            if (this.isTruthy(initialCheck)) {
                return {
                    conditionMet: true,
                    stepsTaken: 0,
                    finalValue: initialCheck,
                    reason: 'condition-met',
                    conditionHistory,
                };
            }

            // Step loop
            for (let i = 0; i < maxSteps; i++) {
                // Check timeout
                if (Date.now() - startTime > timeoutMs) {
                    return {
                        conditionMet: false,
                        stepsTaken,
                        finalValue: conditionHistory.length > 0
                            ? conditionHistory[conditionHistory.length - 1].value
                            : '<unknown>',
                        reason: 'timeout',
                        conditionHistory,
                    };
                }

                // Step
                await stepper.step(stepType, threadId);
                await stepper.waitForStop();
                stepsTaken++;

                // Evaluate condition
                const value = await this.evaluateCondition(evaluator, options.condition);
                conditionHistory.push({ step: stepsTaken, value });

                // Check if condition is met
                if (this.isTruthy(value)) {
                    return {
                        conditionMet: true,
                        stepsTaken,
                        finalValue: value,
                        reason: 'condition-met',
                        conditionHistory,
                    };
                }
            }

            // Max steps reached
            return {
                conditionMet: false,
                stepsTaken,
                finalValue: conditionHistory.length > 0
                    ? conditionHistory[conditionHistory.length - 1].value
                    : '<unknown>',
                reason: 'max-steps',
                conditionHistory,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                conditionMet: false,
                stepsTaken,
                finalValue: '<error>',
                reason: 'error',
                error: message,
                conditionHistory,
            };
        }
    }

    /**
     * Evaluate the condition expression.
     */
    private async evaluateCondition(
        evaluator: ExpressionEvaluator,
        condition: string,
    ): Promise<string> {
        try {
            const result = await evaluator.evaluate(condition);
            return result.result;
        } catch {
            return '<error>';
        }
    }

    /**
     * Check if a value is truthy in a debug context.
     */
    private isTruthy(value: string): boolean {
        if (!value || value === '<error>') return false;
        const lower = value.toLowerCase();
        return (
            lower !== 'false' &&
            lower !== '0' &&
            lower !== 'null' &&
            lower !== 'undefined' &&
            lower !== 'none' &&
            lower !== '""' &&
            lower !== "''" &&
            lower !== 'nan'
        );
    }

    /**
     * Generate LLM-friendly markdown of stepping result.
     */
    toMarkdown(result: StepUntilResult, condition: string): string {
        const lines: string[] = [];

        if (result.conditionMet) {
            lines.push(`### ✅ Condition Met: \`${condition}\``);
            lines.push(`Stepped **${String(result.stepsTaken)} time(s)** — final value: \`${result.finalValue}\``);
        } else {
            lines.push(`### ❌ Condition Not Met: \`${condition}\``);
            lines.push(`Stopped after **${String(result.stepsTaken)} steps** — reason: ${result.reason}`);
        }

        if (result.conditionHistory.length > 0 && result.conditionHistory.length <= 15) {
            lines.push('');
            lines.push('| Step | Value |');
            lines.push('|------|-------|');
            for (const entry of result.conditionHistory) {
                lines.push(`| ${String(entry.step)} | \`${entry.value}\` |`);
            }
        } else if (result.conditionHistory.length > 15) {
            lines.push('');
            lines.push(`_${String(result.conditionHistory.length)} values tracked (showing first 5 and last 5)_`);
            const first = result.conditionHistory.slice(0, 5);
            const last = result.conditionHistory.slice(-5);
            lines.push('| Step | Value |');
            lines.push('|------|-------|');
            for (const entry of first) {
                lines.push(`| ${String(entry.step)} | \`${entry.value}\` |`);
            }
            lines.push('| ... | ... |');
            for (const entry of last) {
                lines.push(`| ${String(entry.step)} | \`${entry.value}\` |`);
            }
        }

        return lines.join('\n');
    }
}
