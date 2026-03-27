/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Watch Expression Manager — Persistent Variable Tracking.
 *
 * When debugging, you often want to track specific variables across
 * multiple steps. The watch manager maintains a list of expressions
 * that are automatically re-evaluated whenever execution stops.
 *
 * This provides the agent with a "dashboard" of tracked values,
 * making it easy to spot when a variable changes unexpectedly.
 *
 * Features:
 *   - Add/remove watch expressions
 *   - Auto-evaluate all watches on each stop
 *   - Track value history (detect when values change)
 *   - Generate diff-style output for LLM analysis
 */

import type { DAPClient } from './dapClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchExpression {
    /** The expression to evaluate */
    expression: string;
    /** Human-readable label (defaults to expression) */
    label?: string;
    /** History of evaluated values */
    history: WatchValue[];
}

export interface WatchValue {
    /** The evaluated result */
    value: string;
    /** The type of the result */
    type: string;
    /** When this evaluation happened */
    timestamp: number;
    /** Which step this was evaluated at (increments each stop) */
    step: number;
}

export interface WatchSnapshot {
    /** All watch values at this point in time */
    watches: Array<{
        expression: string;
        label: string;
        currentValue: string;
        currentType: string;
        changed: boolean;
        previousValue?: string;
    }>;
    /** Step number */
    step: number;
}

// ---------------------------------------------------------------------------
// WatchExpressionManager
// ---------------------------------------------------------------------------

/**
 * Manages persistent watch expressions that auto-evaluate on each stop.
 */
export class WatchExpressionManager {
    private readonly watches: Map<string, WatchExpression> = new Map();
    private currentStep: number = 0;

    /**
     * Add a watch expression.
     */
    add(expression: string, label?: string): void {
        if (!this.watches.has(expression)) {
            this.watches.set(expression, {
                expression,
                label,
                history: [],
            });
        }
    }

    /**
     * Remove a watch expression.
     */
    remove(expression: string): boolean {
        return this.watches.delete(expression);
    }

    /**
     * Evaluate all watch expressions using the DAP client.
     * Call this whenever execution stops (breakpoint, step, exception).
     */
    async evaluateAll(
        client: DAPClient,
        frameId: number,
    ): Promise<WatchSnapshot> {
        this.currentStep++;

        const snapshotWatches: WatchSnapshot['watches'] = [];

        for (const [, watch] of this.watches) {
            try {
                const result = await client.evaluate(watch.expression, frameId);
                const value: WatchValue = {
                    value: result.result,
                    type: result.type ?? 'unknown',
                    timestamp: Date.now(),
                    step: this.currentStep,
                };

                const previousValue = watch.history.length > 0
                    ? watch.history[watch.history.length - 1]
                    : undefined;

                watch.history.push(value);

                snapshotWatches.push({
                    expression: watch.expression,
                    label: watch.label ?? watch.expression,
                    currentValue: value.value,
                    currentType: value.type,
                    changed: previousValue !== undefined && previousValue.value !== value.value,
                    previousValue: previousValue?.value,
                });
            } catch {
                snapshotWatches.push({
                    expression: watch.expression,
                    label: watch.label ?? watch.expression,
                    currentValue: '<error>',
                    currentType: 'error',
                    changed: false,
                });
            }
        }

        return {
            watches: snapshotWatches,
            step: this.currentStep,
        };
    }

    /**
     * Get all watched expressions.
     */
    getExpressions(): string[] {
        return Array.from(this.watches.keys());
    }

    /**
     * Get the value history for a specific expression.
     */
    getHistory(expression: string): WatchValue[] {
        return this.watches.get(expression)?.history ?? [];
    }

    /**
     * Clear all watches.
     */
    clear(): void {
        this.watches.clear();
        this.currentStep = 0;
    }

    /**
     * Get the current step count.
     */
    getStep(): number {
        return this.currentStep;
    }

    /**
     * Generate LLM-friendly markdown of current watch state.
     */
    toMarkdown(snapshot: WatchSnapshot): string {
        if (snapshot.watches.length === 0) {
            return 'No watch expressions configured.';
        }

        const lines: string[] = [];
        lines.push(`### 👁️ Watch Expressions (Step ${String(snapshot.step)})`);
        lines.push('');

        for (const w of snapshot.watches) {
            const changeMarker = w.changed ? ' 🔄' : '';
            const prevStr = w.changed && w.previousValue
                ? ` _(was: ${w.previousValue})_`
                : '';
            lines.push(
                `- \`${w.label}\` (${w.currentType}): **${w.currentValue}**${prevStr}${changeMarker}`,
            );
        }

        const changedCount = snapshot.watches.filter((w) => w.changed).length;
        if (changedCount > 0) {
            lines.push('');
            lines.push(`> 🔄 **${String(changedCount)} value(s) changed** since last stop.`);
        }

        return lines.join('\n');
    }
}
