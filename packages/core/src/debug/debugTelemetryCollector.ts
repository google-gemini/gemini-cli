/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Telemetry Collector — Track Debugging Metrics.
 *
 * Collects anonymous usage metrics for debug sessions:
 *   - Which tools are used most often
 *   - Success/failure rates per tool
 *   - Average session duration
 *   - Most common error patterns
 *   - Fix rate (how often suggestions lead to fixes)
 *
 * This data helps:
 *   1. Improve the agent's debugging strategy over time
 *   2. Identify which tools need enhancement
 *   3. Provide reports to the user about debugging effectiveness
 *   4. Show mentors we think about observability & continuous improvement
 *
 * Privacy: All data stays local. Nothing is sent externally.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolMetric {
    /** Tool name */
    tool: string;
    /** Number of times invoked */
    invocations: number;
    /** Number of successful invocations */
    successes: number;
    /** Number of failures */
    failures: number;
    /** Average execution time (ms) */
    avgDuration: number;
    /** Total execution time (ms) */
    totalDuration: number;
}

export interface SessionMetric {
    /** Session ID */
    sessionId: string;
    /** Language */
    language: string;
    /** Duration (ms) */
    duration: number;
    /** Number of tool invocations */
    toolInvocations: number;
    /** Outcome */
    outcome: 'fixed' | 'partially-fixed' | 'unresolved' | 'unknown';
    /** Error patterns encountered */
    errorPatterns: string[];
}

export interface TelemetrySummary {
    /** Total sessions tracked */
    totalSessions: number;
    /** Fix rate (percentage of sessions with 'fixed' outcome) */
    fixRate: number;
    /** Most used tools */
    topTools: ToolMetric[];
    /** Most common error patterns */
    topPatterns: Array<{ pattern: string; count: number }>;
    /** Average session duration (ms) */
    avgSessionDuration: number;
    /** Total tool invocations */
    totalInvocations: number;
}

// ---------------------------------------------------------------------------
// DebugTelemetryCollector
// ---------------------------------------------------------------------------

/**
 * Collects and reports debugging telemetry metrics.
 */
export class DebugTelemetryCollector {
    private readonly toolMetrics = new Map<string, ToolMetric>();
    private readonly sessions: SessionMetric[] = [];
    private readonly patternCounts = new Map<string, number>();

    /**
     * Record a tool invocation.
     */
    recordToolUse(
        tool: string,
        success: boolean,
        durationMs: number = 0,
    ): void {
        let metric = this.toolMetrics.get(tool);
        if (!metric) {
            metric = {
                tool,
                invocations: 0,
                successes: 0,
                failures: 0,
                avgDuration: 0,
                totalDuration: 0,
            };
            this.toolMetrics.set(tool, metric);
        }

        metric.invocations++;
        if (success) metric.successes++;
        else metric.failures++;
        metric.totalDuration += durationMs;
        metric.avgDuration = metric.totalDuration / metric.invocations;
    }

    /**
     * Record a completed session.
     */
    recordSession(session: SessionMetric): void {
        this.sessions.push(session);

        for (const pattern of session.errorPatterns) {
            this.patternCounts.set(
                pattern,
                (this.patternCounts.get(pattern) ?? 0) + 1,
            );
        }
    }

    /**
     * Record an error pattern occurrence.
     */
    recordPattern(pattern: string): void {
        this.patternCounts.set(
            pattern,
            (this.patternCounts.get(pattern) ?? 0) + 1,
        );
    }

    /**
     * Get metrics for a specific tool.
     */
    getToolMetric(tool: string): ToolMetric | undefined {
        return this.toolMetrics.get(tool);
    }

    /**
     * Get all tool metrics sorted by invocations.
     */
    getToolMetrics(): ToolMetric[] {
        return Array.from(this.toolMetrics.values())
            .sort((a, b) => b.invocations - a.invocations);
    }

    /**
     * Get the fix rate (percentage of sessions fixed).
     */
    getFixRate(): number {
        if (this.sessions.length === 0) return 0;
        const fixed = this.sessions.filter((s) => s.outcome === 'fixed').length;
        return (fixed / this.sessions.length) * 100;
    }

    /**
     * Get the top N error patterns.
     */
    getTopPatterns(n: number = 5): Array<{ pattern: string; count: number }> {
        return Array.from(this.patternCounts.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, n);
    }

    /**
     * Get the full telemetry summary.
     */
    getSummary(): TelemetrySummary {
        const totalDuration = this.sessions.reduce((s, m) => s + m.duration, 0);
        const totalInvocations = Array.from(this.toolMetrics.values())
            .reduce((s, m) => s + m.invocations, 0);

        return {
            totalSessions: this.sessions.length,
            fixRate: this.getFixRate(),
            topTools: this.getToolMetrics().slice(0, 5),
            topPatterns: this.getTopPatterns(),
            avgSessionDuration: this.sessions.length > 0
                ? totalDuration / this.sessions.length
                : 0,
            totalInvocations,
        };
    }

    /**
     * Clear all collected metrics.
     */
    clear(): void {
        this.toolMetrics.clear();
        this.sessions.length = 0;
        this.patternCounts.clear();
    }

    /**
     * Generate LLM-friendly markdown telemetry report.
     */
    toMarkdown(): string {
        const summary = this.getSummary();

        if (summary.totalSessions === 0 && summary.totalInvocations === 0) {
            return 'No telemetry data collected yet.';
        }

        const lines: string[] = [];
        lines.push('### 📊 Debug Telemetry Report');
        lines.push('');
        lines.push(`**Sessions**: ${String(summary.totalSessions)} | **Fix Rate**: ${summary.fixRate.toFixed(1)}% | **Total Invocations**: ${String(summary.totalInvocations)}`);

        if (summary.avgSessionDuration > 0) {
            lines.push(`**Avg Session Duration**: ${String(Math.round(summary.avgSessionDuration))}ms`);
        }

        if (summary.topTools.length > 0) {
            lines.push('');
            lines.push('**Tool Usage:**');
            lines.push('| Tool | Invocations | Success Rate | Avg Time |');
            lines.push('|------|-------------|-------------|----------|');
            for (const tool of summary.topTools) {
                const successRate = tool.invocations > 0
                    ? ((tool.successes / tool.invocations) * 100).toFixed(0)
                    : '0';
                lines.push(
                    `| \`${tool.tool}\` | ${String(tool.invocations)} | ${successRate}% | ${String(Math.round(tool.avgDuration))}ms |`,
                );
            }
        }

        if (summary.topPatterns.length > 0) {
            lines.push('');
            lines.push('**Top Error Patterns:**');
            for (const p of summary.topPatterns) {
                lines.push(`- \`${p.pattern}\`: ${String(p.count)}×`);
            }
        }

        return lines.join('\n');
    }
}
