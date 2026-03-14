/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Variable Diff Tracker — Track how variables change between debug stops.
 *
 * State-of-the-art debugging agents don't just show variable values —
 * they show how values CHANGE over time. This is critical for:
 *
 *   1. Finding mutations: "x was 5, now it's null — what happened?"
 *   2. Tracking state progression: "counter went 0→1→2→2→2 — stuck at 2"
 *   3. Detecting corruption: "array length was 10, now it's 0"
 *   4. Understanding flow: "user.name was 'Alice' in frame 3, 'Bob' in frame 7"
 *
 * The tracker captures variable snapshots at each debug stop and
 * computes diffs between consecutive snapshots, highlighting:
 *   - Added variables (new in scope)
 *   - Removed variables (went out of scope)
 *   - Changed variables (different value)
 *   - Unchanged variables (same value — usually not interesting)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariableSnapshot {
    /** Stop number (sequential) */
    stopNumber: number;
    /** Timestamp */
    timestamp: number;
    /** Location where snapshot was taken */
    location: {
        file: string;
        line: number;
        function?: string;
    };
    /** Variable name → value pairs */
    variables: Map<string, string>;
}

export interface VariableChange {
    /** Variable name */
    name: string;
    /** Change type */
    type: 'added' | 'removed' | 'changed' | 'unchanged';
    /** Previous value (if changed or removed) */
    previousValue?: string;
    /** Current value (if added or changed) */
    currentValue?: string;
}

export interface SnapshotDiff {
    /** From stop number */
    fromStop: number;
    /** To stop number */
    toStop: number;
    /** All changes between snapshots */
    changes: VariableChange[];
    /** Count of each change type */
    summary: {
        added: number;
        removed: number;
        changed: number;
        unchanged: number;
    };
}

export interface VariableTimeline {
    /** Variable name */
    name: string;
    /** Value history (stop number → value) */
    history: Array<{ stopNumber: number; value: string }>;
    /** Whether the value ever changed */
    isConstant: boolean;
    /** Number of distinct values */
    distinctValues: number;
}

// ---------------------------------------------------------------------------
// VariableDiffTracker
// ---------------------------------------------------------------------------

export class VariableDiffTracker {
    private readonly snapshots: VariableSnapshot[] = [];
    private readonly maxSnapshots: number;
    private stopCounter = 0;

    constructor(maxSnapshots: number = 100) {
        this.maxSnapshots = maxSnapshots;
    }

    /**
     * Capture a snapshot of current variables at a debug stop.
     */
    capture(
        variables: Record<string, string>,
        location: { file: string; line: number; function?: string },
    ): VariableSnapshot {
        this.stopCounter++;

        const snapshot: VariableSnapshot = {
            stopNumber: this.stopCounter,
            timestamp: Date.now(),
            location,
            variables: new Map(Object.entries(variables)),
        };

        this.snapshots.push(snapshot);

        // Evict old snapshots
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }

        return snapshot;
    }

    /**
     * Get the diff between two consecutive snapshots.
     */
    diff(fromStop: number, toStop: number): SnapshotDiff | null {
        const from = this.snapshots.find((s) => s.stopNumber === fromStop);
        const to = this.snapshots.find((s) => s.stopNumber === toStop);

        if (!from || !to) return null;

        return this.computeDiff(from, to);
    }

    /**
     * Get the diff between the last two snapshots.
     */
    lastDiff(): SnapshotDiff | null {
        if (this.snapshots.length < 2) return null;

        const from = this.snapshots[this.snapshots.length - 2];
        const to = this.snapshots[this.snapshots.length - 1];

        return this.computeDiff(from, to);
    }

    /**
     * Get the complete timeline for a specific variable.
     */
    getTimeline(name: string): VariableTimeline {
        const history: Array<{ stopNumber: number; value: string }> = [];
        const distinctValues = new Set<string>();

        for (const snapshot of this.snapshots) {
            const value = snapshot.variables.get(name);
            if (value !== undefined) {
                history.push({ stopNumber: snapshot.stopNumber, value });
                distinctValues.add(value);
            }
        }

        return {
            name,
            history,
            isConstant: distinctValues.size <= 1,
            distinctValues: distinctValues.size,
        };
    }

    /**
     * Find variables that changed the most (most volatile).
     */
    getMostVolatile(limit: number = 5): Array<{ name: string; changeCount: number }> {
        const changeCounts = new Map<string, number>();

        for (let i = 1; i < this.snapshots.length; i++) {
            const prev = this.snapshots[i - 1];
            const curr = this.snapshots[i];

            // Check all variables in current snapshot
            for (const [name, value] of curr.variables) {
                const prevValue = prev.variables.get(name);
                if (prevValue !== undefined && prevValue !== value) {
                    changeCounts.set(name, (changeCounts.get(name) ?? 0) + 1);
                }
            }
        }

        return Array.from(changeCounts.entries())
            .map(([name, changeCount]) => ({ name, changeCount }))
            .sort((a, b) => b.changeCount - a.changeCount)
            .slice(0, limit);
    }

    /**
     * Find variables whose values became null/undefined/empty.
     */
    findNullifications(): Array<{ name: string; stopNumber: number; previousValue: string }> {
        const results: Array<{ name: string; stopNumber: number; previousValue: string }> = [];
        const nullish = new Set(['null', 'undefined', 'None', 'nil', '<nil>', '""', "''", '[]', '{}']);

        for (let i = 1; i < this.snapshots.length; i++) {
            const prev = this.snapshots[i - 1];
            const curr = this.snapshots[i];

            for (const [name, value] of curr.variables) {
                const prevValue = prev.variables.get(name);
                if (prevValue && !nullish.has(prevValue) && nullish.has(value)) {
                    results.push({
                        name,
                        stopNumber: curr.stopNumber,
                        previousValue: prevValue,
                    });
                }
            }
        }

        return results;
    }

    /**
     * Get the total number of snapshots.
     */
    getSnapshotCount(): number {
        return this.snapshots.length;
    }

    /**
     * Clear all snapshots.
     */
    clear(): void {
        this.snapshots.length = 0;
        this.stopCounter = 0;
    }

    /**
     * Generate LLM-ready markdown diff report.
     */
    toMarkdown(): string {
        const lines: string[] = [];
        lines.push('### 📊 Variable Changes');
        lines.push('');

        if (this.snapshots.length === 0) {
            lines.push('No variable snapshots captured.');
            return lines.join('\n');
        }

        lines.push(`**Snapshots:** ${String(this.snapshots.length)}`);

        // Last diff
        const ld = this.lastDiff();
        if (ld) {
            lines.push('');
            lines.push(`**Last Change** (stop ${String(ld.fromStop)} → ${String(ld.toStop)}):`);
            lines.push(`- Added: ${String(ld.summary.added)} | Changed: ${String(ld.summary.changed)} | Removed: ${String(ld.summary.removed)}`);

            const important = ld.changes.filter((c) => c.type !== 'unchanged');
            if (important.length > 0) {
                lines.push('');
                lines.push('| Variable | Change | Before | After |');
                lines.push('|----------|--------|--------|-------|');
                for (const change of important.slice(0, 10)) {
                    const before = change.previousValue ?? '—';
                    const after = change.currentValue ?? '—';
                    lines.push(`| \`${change.name}\` | ${change.type} | \`${before}\` | \`${after}\` |`);
                }
            }
        }

        // Nullifications
        const nulls = this.findNullifications();
        if (nulls.length > 0) {
            lines.push('');
            lines.push('**⚠️ Variables that became null/undefined:**');
            for (const n of nulls.slice(0, 5)) {
                lines.push(`- \`${n.name}\` was \`${n.previousValue}\` → became null at stop ${String(n.stopNumber)}`);
            }
        }

        // Most volatile
        const volatile = this.getMostVolatile(3);
        if (volatile.length > 0) {
            lines.push('');
            lines.push('**Most volatile variables:**');
            for (const v of volatile) {
                lines.push(`- \`${v.name}\`: changed ${String(v.changeCount)}× across stops`);
            }
        }

        return lines.join('\n');
    }

    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------

    private computeDiff(from: VariableSnapshot, to: VariableSnapshot): SnapshotDiff {
        const changes: VariableChange[] = [];
        const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

        // Check variables in 'to' snapshot
        for (const [name, value] of to.variables) {
            const prevValue = from.variables.get(name);
            if (prevValue === undefined) {
                changes.push({ name, type: 'added', currentValue: value });
                summary.added++;
            } else if (prevValue !== value) {
                changes.push({ name, type: 'changed', previousValue: prevValue, currentValue: value });
                summary.changed++;
            } else {
                changes.push({ name, type: 'unchanged', previousValue: prevValue, currentValue: value });
                summary.unchanged++;
            }
        }

        // Check for removed variables (in 'from' but not in 'to')
        for (const [name, value] of from.variables) {
            if (!to.variables.has(name)) {
                changes.push({ name, type: 'removed', previousValue: value });
                summary.removed++;
            }
        }

        return {
            fromStop: from.stopNumber,
            toStop: to.stopNumber,
            changes,
            summary,
        };
    }
}
