/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Exception Breakpoint Manager — DAP setExceptionBreakpoints support.
 *
 * This is a CORE DAP feature that we were missing. Exception breakpoints
 * let the debugger pause on exceptions — either thrown or uncaught:
 *
 *   - "Break on all exceptions" → catch bugs the moment they throw
 *   - "Break on uncaught only" → skip handled errors, catch crashes
 *   - Language-specific filters → Python ValueError, JS TypeError, etc.
 *
 * This integrates with DAP's initialize response, which tells us
 * which ExceptionBreakpointFilters the adapter supports.
 *
 * Without this, the agent can ONLY break on lines. With this, it can
 * break on ERRORS — which is usually what you actually want.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An exception filter as reported by the DAP adapter.
 */
export interface ExceptionFilter {
    /** Unique ID for this filter (e.g., 'all', 'uncaught', 'userUnhandled') */
    filterId: string;
    /** Human-readable label */
    label: string;
    /** Description of what this filter catches */
    description?: string;
    /** Whether this filter is enabled by default */
    defaultEnabled: boolean;
    /** Whether this filter supports conditions */
    supportsCondition: boolean;
    /** Condition placeholder text */
    conditionDescription?: string;
}

/**
 * A configured exception breakpoint.
 */
export interface ExceptionBreakpoint {
    /** Filter ID */
    filterId: string;
    /** Whether currently enabled */
    enabled: boolean;
    /** Optional condition (if supported) */
    condition?: string;
}

/**
 * Result of configuring exception breakpoints.
 */
export interface ExceptionBreakpointResult {
    /** Filters that were set */
    filters: string[];
    /** Filters with conditions */
    filterOptions: Array<{ filterId: string; condition?: string }>;
    /** Whether the adapter accepted the configuration */
    accepted: boolean;
}

/**
 * Exception info from a caught exception.
 */
export interface ExceptionInfo {
    /** Exception ID */
    exceptionId: string;
    /** Exception description */
    description?: string;
    /** Break mode (never, always, unhandled, userUnhandled) */
    breakMode: string;
    /** Detailed exception info */
    details?: {
        message?: string;
        typeName?: string;
        stackTrace?: string;
        innerException?: ExceptionInfo[];
    };
}

// ---------------------------------------------------------------------------
// ExceptionBreakpointManager
// ---------------------------------------------------------------------------

export class ExceptionBreakpointManager {
    /** Available filters from the adapter */
    private availableFilters: ExceptionFilter[] = [];
    /** Currently enabled exception breakpoints */
    private readonly activeBreakpoints = new Map<string, ExceptionBreakpoint>();
    /** History of caught exceptions */
    private readonly exceptionHistory: ExceptionInfo[] = [];
    /** Max history size */
    private readonly maxHistory: number;

    constructor(maxHistory: number = 50) {
        this.maxHistory = maxHistory;
    }

    /**
     * Register available filters from the DAP adapter's capabilities.
     */
    registerFilters(filters: ExceptionFilter[]): void {
        this.availableFilters = [...filters];

        // Auto-enable default filters
        for (const filter of filters) {
            if (filter.defaultEnabled) {
                this.activeBreakpoints.set(filter.filterId, {
                    filterId: filter.filterId,
                    enabled: true,
                });
            }
        }
    }

    /**
     * Get available filters.
     */
    getAvailableFilters(): ExceptionFilter[] {
        return [...this.availableFilters];
    }

    /**
     * Enable an exception breakpoint by filter ID.
     */
    enable(filterId: string, condition?: string): boolean {
        const filter = this.availableFilters.find((f) => f.filterId === filterId);
        if (!filter) return false;

        if (condition && !filter.supportsCondition) {
            return false;
        }

        this.activeBreakpoints.set(filterId, {
            filterId,
            enabled: true,
            condition,
        });

        return true;
    }

    /**
     * Disable an exception breakpoint.
     */
    disable(filterId: string): boolean {
        const bp = this.activeBreakpoints.get(filterId);
        if (!bp) return false;

        bp.enabled = false;
        return true;
    }

    /**
     * Remove an exception breakpoint entirely.
     */
    remove(filterId: string): boolean {
        return this.activeBreakpoints.delete(filterId);
    }

    /**
     * Get all active (enabled) exception breakpoints.
     */
    getActive(): ExceptionBreakpoint[] {
        return Array.from(this.activeBreakpoints.values())
            .filter((bp) => bp.enabled);
    }

    /**
     * Build the DAP setExceptionBreakpoints request arguments.
     */
    buildRequest(): ExceptionBreakpointResult {
        const active = this.getActive();

        const filters = active
            .filter((bp) => !bp.condition)
            .map((bp) => bp.filterId);

        const filterOptions = active
            .filter((bp) => bp.condition)
            .map((bp) => ({ filterId: bp.filterId, condition: bp.condition }));

        return {
            filters,
            filterOptions,
            accepted: true,
        };
    }

    /**
     * Record a caught exception.
     */
    recordException(info: ExceptionInfo): void {
        this.exceptionHistory.push(info);
        if (this.exceptionHistory.length > this.maxHistory) {
            this.exceptionHistory.shift();
        }
    }

    /**
     * Get exception history.
     */
    getHistory(): ExceptionInfo[] {
        return [...this.exceptionHistory];
    }

    /**
     * Get the last caught exception.
     */
    getLastException(): ExceptionInfo | undefined {
        return this.exceptionHistory[this.exceptionHistory.length - 1];
    }

    /**
     * Get exception frequency by type.
     */
    getExceptionFrequency(): Array<{ exceptionId: string; count: number }> {
        const counts = new Map<string, number>();
        for (const ex of this.exceptionHistory) {
            counts.set(ex.exceptionId, (counts.get(ex.exceptionId) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([exceptionId, count]) => ({ exceptionId, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Clear history and reset.
     */
    clear(): void {
        this.activeBreakpoints.clear();
        this.exceptionHistory.length = 0;
    }

    /**
     * Generate LLM-ready markdown summary.
     */
    toMarkdown(): string {
        const lines: string[] = [];
        lines.push('### 🛑 Exception Breakpoints');
        lines.push('');

        const active = this.getActive();
        if (active.length === 0) {
            lines.push('No exception breakpoints active.');
        } else {
            lines.push('**Active:**');
            for (const bp of active) {
                const cond = bp.condition ? ` (condition: \`${bp.condition}\`)` : '';
                lines.push(`- \`${bp.filterId}\`${cond}`);
            }
        }

        if (this.exceptionHistory.length > 0) {
            lines.push('');
            lines.push(`**Exception History** (${String(this.exceptionHistory.length)} caught):`);

            const freq = this.getExceptionFrequency();
            for (const { exceptionId, count } of freq.slice(0, 5)) {
                lines.push(`- \`${exceptionId}\`: ${String(count)}×`);
            }

            const last = this.getLastException();
            if (last?.details) {
                lines.push('');
                lines.push('**Last Exception:**');
                if (last.details.typeName) lines.push(`- Type: \`${last.details.typeName}\``);
                if (last.details.message) lines.push(`- Message: ${last.details.message}`);
                if (last.details.stackTrace) {
                    lines.push('```');
                    lines.push(last.details.stackTrace.split('\n').slice(0, 5).join('\n'));
                    lines.push('```');
                }
            }
        }

        return lines.join('\n');
    }
}
