/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Context Builder — Build LLM-optimized context from debug state.
 *
 * WHY THIS MATTERS:
 * The most important thing in an AI-powered debugger isn't the DAP protocol —
 * it's what you TELL the LLM about the debugging state. Without great context,
 * even GPT-4/Gemini will give garbage suggestions.
 *
 * This builder takes the raw debug state (variables, stack, breakpoints,
 * exceptions, variable diffs) and compresses it into a structured,
 * token-efficient prompt that maximizes the LLM's ability to reason about
 * the bug.
 *
 * Key design decisions:
 *   - Priority-based: Most relevant info gets included first
 *   - Token-aware: Respects a budget to avoid blowing context windows
 *   - Structured: Uses markdown headers/tables for consistent parsing
 *   - Diff-focused: Highlights what CHANGED, not everything that exists
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebugSnapshot {
    /** Current state (stopped, running, etc.) */
    state: string;
    /** Why the program stopped */
    stopReason?: string;
    /** Current location */
    location?: {
        file: string;
        line: number;
        function?: string;
    };
    /** Source context (lines around current position) */
    sourceContext?: string[];
    /** Current stop's stack frames */
    stackFrames?: Array<{
        name: string;
        file?: string;
        line?: number;
    }>;
    /** Variables in current scope */
    variables?: Record<string, string>;
    /** Recent variable changes */
    variableDiff?: {
        added: Array<{ name: string; value: string }>;
        changed: Array<{ name: string; from: string; to: string }>;
        removed: Array<{ name: string; lastValue: string }>;
    };
    /** Active breakpoints */
    breakpoints?: Array<{
        file: string;
        line: number;
        verified: boolean;
        hitCount?: number;
    }>;
    /** Exception info (if stopped on exception) */
    exception?: {
        type: string;
        message: string;
        stack?: string;
    };
    /** Watch expression results */
    watches?: Array<{ expression: string; value: string }>;
}

export interface ContextBuildOptions {
    /** Maximum token budget (rough estimate: 1 token ≈ 4 chars) */
    maxTokens?: number;
    /** Include source context lines */
    includeSource?: boolean;
    /** Include variable diff (recommended) */
    includeDiff?: boolean;
    /** Include full stack trace */
    includeStack?: boolean;
    /** Include breakpoint list */
    includeBreakpoints?: boolean;
    /** Include watch expressions */
    includeWatches?: boolean;
    /** Custom preamble to prepend */
    preamble?: string;
}

// ---------------------------------------------------------------------------
// DebugContextBuilder
// ---------------------------------------------------------------------------

export class DebugContextBuilder {
    private snapshot: DebugSnapshot | null = null;
    private readonly previousSnapshots: DebugSnapshot[] = [];
    private readonly maxPreviousSnapshots: number;

    constructor(maxPreviousSnapshots: number = 5) {
        this.maxPreviousSnapshots = maxPreviousSnapshots;
    }

    /**
     * Update the current debug snapshot.
     */
    update(snapshot: DebugSnapshot): void {
        if (this.snapshot) {
            this.previousSnapshots.push(this.snapshot);
            if (this.previousSnapshots.length > this.maxPreviousSnapshots) {
                this.previousSnapshots.shift();
            }
        }
        this.snapshot = snapshot;
    }

    /**
     * Clear state.
     */
    clear(): void {
        this.snapshot = null;
        this.previousSnapshots.length = 0;
    }

    /**
     * Build the LLM context string.
     */
    build(options: ContextBuildOptions = {}): string {
        const {
            maxTokens = 2000,
            includeSource = true,
            includeDiff = true,
            includeStack = true,
            includeBreakpoints = false,
            includeWatches = true,
            preamble,
        } = options;

        if (!this.snapshot) {
            return '## Debug State\nNo active debug session.';
        }

        const sections: Array<{ priority: number; content: string }> = [];

        // Preamble
        if (preamble) {
            sections.push({ priority: 0, content: preamble });
        }

        // Header — always included (priority 0 = highest)
        sections.push({
            priority: 0,
            content: this.buildHeader(),
        });

        // Exception — extremely high priority
        if (this.snapshot.exception) {
            sections.push({
                priority: 1,
                content: this.buildException(),
            });
        }

        // Variable diff — high priority (what changed is usually the key)
        if (includeDiff && this.snapshot.variableDiff) {
            sections.push({
                priority: 2,
                content: this.buildVariableDiff(),
            });
        }

        // Current variables
        if (this.snapshot.variables) {
            sections.push({
                priority: 3,
                content: this.buildVariables(),
            });
        }

        // Source context
        if (includeSource && this.snapshot.sourceContext) {
            sections.push({
                priority: 4,
                content: this.buildSource(),
            });
        }

        // Stack trace
        if (includeStack && this.snapshot.stackFrames) {
            sections.push({
                priority: 5,
                content: this.buildStack(),
            });
        }

        // Watch expressions
        if (includeWatches && this.snapshot.watches?.length) {
            sections.push({
                priority: 6,
                content: this.buildWatches(),
            });
        }

        // Breakpoints
        if (includeBreakpoints && this.snapshot.breakpoints?.length) {
            sections.push({
                priority: 7,
                content: this.buildBreakpoints(),
            });
        }

        // Sort by priority and assemble within token budget
        sections.sort((a, b) => a.priority - b.priority);

        const charBudget = maxTokens * 4; // rough estimate
        let result = '';

        for (const section of sections) {
            if ((result.length + section.content.length) > charBudget) {
                // Try to fit with truncation
                const remaining = charBudget - result.length;
                if (remaining > 100) {
                    result += section.content.slice(0, remaining) + '\n... (truncated)\n';
                }
                break;
            }
            result += section.content + '\n\n';
        }

        return result.trim();
    }

    /**
     * Build a short (1-line) status for system prompts.
     */
    buildOneLiner(): string {
        if (!this.snapshot) return 'No debug session.';

        const s = this.snapshot;
        const loc = s.location
            ? `${s.location.file}:${String(s.location.line)}`
            : 'unknown';

        if (s.exception) {
            return `🔴 Stopped on ${s.exception.type}: "${s.exception.message}" at ${loc}`;
        }
        if (s.stopReason === 'breakpoint') {
            return `🟡 Stopped at breakpoint: ${loc} (${s.location?.function ?? 'unknown fn'})`;
        }
        if (s.state === 'running') {
            return '🟢 Program running.';
        }
        return `⏸ Stopped (${s.stopReason ?? s.state}) at ${loc}`;
    }

    // -----------------------------------------------------------------------
    // Section builders
    // -----------------------------------------------------------------------

    private buildHeader(): string {
        const s = this.snapshot!;
        const lines = ['## 🐛 Debug State'];

        if (s.location) {
            const fn = s.location.function ? ` in \`${s.location.function}\`` : '';
            lines.push(`**Location:** \`${s.location.file}:${String(s.location.line)}\`${fn}`);
        }

        if (s.stopReason) {
            lines.push(`**Reason:** ${s.stopReason}`);
        }

        return lines.join('\n');
    }

    private buildException(): string {
        const ex = this.snapshot!.exception!;
        const lines = ['### ❌ Exception'];
        lines.push(`**${ex.type}:** ${ex.message}`);
        if (ex.stack) {
            lines.push('```');
            lines.push(ex.stack.split('\n').slice(0, 5).join('\n'));
            lines.push('```');
        }
        return lines.join('\n');
    }

    private buildVariableDiff(): string {
        const diff = this.snapshot!.variableDiff!;
        const lines = ['### 🔄 Changes Since Last Stop'];

        if (diff.changed.length > 0) {
            for (const v of diff.changed.slice(0, 8)) {
                lines.push(`- \`${v.name}\`: \`${v.from}\` → \`${v.to}\``);
            }
        }
        if (diff.added.length > 0) {
            lines.push('**New:**');
            for (const v of diff.added.slice(0, 5)) {
                lines.push(`- \`${v.name}\` = \`${v.value}\``);
            }
        }
        if (diff.removed.length > 0) {
            lines.push(`**Out of scope:** ${diff.removed.map((v) => `\`${v.name}\``).join(', ')}`);
        }

        return lines.join('\n');
    }

    private buildVariables(): string {
        const vars = this.snapshot!.variables!;
        const entries = Object.entries(vars);
        if (entries.length === 0) return '';

        const lines = ['### 📋 Variables'];
        lines.push('| Name | Value |');
        lines.push('|------|-------|');
        for (const [name, value] of entries.slice(0, 15)) {
            const truncated = value.length > 60 ? value.slice(0, 57) + '...' : value;
            lines.push(`| \`${name}\` | \`${truncated}\` |`);
        }
        if (entries.length > 15) {
            lines.push(`\n*...and ${String(entries.length - 15)} more variables.*`);
        }
        return lines.join('\n');
    }

    private buildSource(): string {
        const ctx = this.snapshot!.sourceContext!;
        if (ctx.length === 0) return '';

        const lines = ['### 📄 Source Context'];
        lines.push('```');
        lines.push(ctx.join('\n'));
        lines.push('```');
        return lines.join('\n');
    }

    private buildStack(): string {
        const frames = this.snapshot!.stackFrames!;
        if (frames.length === 0) return '';

        const lines = ['### 📚 Call Stack'];
        for (let i = 0; i < Math.min(frames.length, 10); i++) {
            const f = frames[i];
            const loc = f.file ? `${f.file}:${String(f.line ?? '?')}` : '<unknown>';
            lines.push(`${String(i)}. \`${f.name}\` at ${loc}`);
        }
        if (frames.length > 10) {
            lines.push(`*...and ${String(frames.length - 10)} more frames.*`);
        }
        return lines.join('\n');
    }

    private buildWatches(): string {
        const watches = this.snapshot!.watches!;
        const lines = ['### 👁 Watches'];
        for (const w of watches.slice(0, 10)) {
            lines.push(`- \`${w.expression}\` = \`${w.value}\``);
        }
        return lines.join('\n');
    }

    private buildBreakpoints(): string {
        const bps = this.snapshot!.breakpoints!;
        const lines = ['### 🔴 Breakpoints'];
        for (const bp of bps.slice(0, 10)) {
            const v = bp.verified ? '✓' : '✗';
            const hit = bp.hitCount ? ` (hits: ${String(bp.hitCount)})` : '';
            lines.push(`- [${v}] \`${bp.file}:${String(bp.line)}\`${hit}`);
        }
        return lines.join('\n');
    }
}
