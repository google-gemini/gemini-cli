/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StackFrame, Variable, Scope, OutputEntry } from './dapClient.js';
import type { DebugAnalysis } from './stackTraceAnalyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A suggested fix based on the current debug context. The engine analyzes
 * common patterns (null references, type errors, off-by-one, etc.) and
 * generates actionable suggestions.
 */
export interface FixSuggestion {
    /** Short title for the suggestion */
    title: string;
    /** Detailed explanation of the issue and proposed fix */
    description: string;
    /** The severity level */
    severity: 'error' | 'warning' | 'info';
    /** Which pattern was matched */
    pattern: string;
    /** File path where the fix should be applied, if known */
    file?: string;
    /** Line number where the fix should be applied, if known */
    line?: number;
    /** Confidence score 0-1 */
    confidence: number;
}

/**
 * The full result of the fix suggestion engine, including the analysis
 * it was based on and any suggestions generated.
 */
export interface FixSuggestionResult {
    /** The debug analysis that was used */
    analysis: DebugAnalysis;
    /** Generated suggestions, ordered by confidence (highest first) */
    suggestions: FixSuggestion[];
    /** LLM-ready markdown combining analysis and suggestions */
    markdown: string;
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

interface PatternMatcher {
    name: string;
    match(ctx: PatternContext): FixSuggestion | null;
}

interface PatternContext {
    analysis: DebugAnalysis;
    frames: StackFrame[];
    variables: Map<number, Variable[]>;
    scopes: Scope[];
    outputLog: OutputEntry[];
    stopReason: string;
}

// ---------------------------------------------------------------------------
// Built-in patterns
// ---------------------------------------------------------------------------

const nullReferencePattern: PatternMatcher = {
    name: 'null-reference',
    match(ctx: PatternContext): FixSuggestion | null {
        // Look for TypeError: Cannot read properties of null/undefined
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('Cannot read propert') ||
                e.output.includes('is not a function') ||
                e.output.includes('is undefined') ||
                e.output.includes('is null'),
        );

        if (!errorOutput && ctx.stopReason !== 'exception') return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        // Check local variables for null/undefined values
        const nullVars = ctx.analysis.localVariables.filter(
            (v) => v.value === 'null' || v.value === 'undefined',
        );

        const nullVarNames = nullVars.map((v) => v.name).join(', ');
        const errorText = errorOutput?.output.trim() ?? 'null/undefined reference';

        return {
            title: 'Null/Undefined Reference',
            description: `**Error**: ${errorText}\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n${nullVars.length > 0 ? `**Null/undefined variables**: ${nullVarNames}\n` : ''}**Suggested fix**: Add null checks or provide default values before accessing the property. Consider using optional chaining (\`?.\`) or nullish coalescing (\`??\`).`,
            severity: 'error',
            pattern: 'null-reference',
            file: location.file,
            line: location.line,
            confidence: errorOutput ? 0.9 : 0.6,
        };
    },
};

const typeErrorPattern: PatternMatcher = {
    name: 'type-error',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('TypeError') &&
                !e.output.includes('Cannot read propert'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        return {
            title: 'Type Error',
            description: `**Error**: ${errorOutput.output.trim()}\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n**Suggested fix**: Check the types of values being used. Ensure the correct data type is passed to functions and operators. Use \`typeof\` checks or TypeScript type guards.`,
            severity: 'error',
            pattern: 'type-error',
            file: location.file,
            line: location.line,
            confidence: 0.8,
        };
    },
};

// Helper function for detecting recursive patterns in the call stack
function findRecursiveFrames(analysis: DebugAnalysis): string | null {
    const names = analysis.callStack.map((f) => f.name);
    const seen = new Map<string, number>();
    for (const name of names) {
        seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    const repeated = Array.from(seen.entries())
        .filter(([, count]) => count > 2)
        .map(([name, count]) => `\`${name}\` (${String(count)}x)`);

    return repeated.length > 0 ? repeated.join(', ') : null;
}

const rangeErrorPattern: PatternMatcher = {
    name: 'range-error',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('RangeError') ||
                e.output.includes('Maximum call stack') ||
                e.output.includes('Invalid array length'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        const isStackOverflow = errorOutput.output.includes('Maximum call stack');

        // For stack overflow, look for recursive patterns in the call stack
        const recursiveFrames = findRecursiveFrames(ctx.analysis);

        return {
            title: isStackOverflow ? 'Stack Overflow (Infinite Recursion)' : 'Range Error',
            description: isStackOverflow
                ? `**Error**: Maximum call stack size exceeded\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n${recursiveFrames ? `**Recursive pattern**: ${recursiveFrames}\n` : ''}**Suggested fix**: Add a base case to your recursive function, or convert to an iterative approach. Check termination conditions.`
                : `**Error**: ${errorOutput.output.trim()}\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n**Suggested fix**: Validate array indices and sizes before use. Ensure values are within expected ranges.`,
            severity: 'error',
            pattern: 'range-error',
            file: location.file,
            line: location.line,
            confidence: 0.85,
        };
    },
};

const offByOnePattern: PatternMatcher = {
    name: 'off-by-one',
    match(ctx: PatternContext): FixSuggestion | null {
        // Look for array index out of bounds patterns
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('index out of') ||
                e.output.includes('IndexError') ||
                e.output.includes('undefined is not an object'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        // Check for array-length-adjacent variables
        const indexVars = ctx.analysis.localVariables.filter(
            (v) =>
                (v.name === 'i' || v.name === 'j' || v.name === 'index' || v.name === 'idx') &&
                v.type === 'number',
        );

        const indexInfo = indexVars.length > 0
            ? `\n**Index variables**: ${indexVars.map((v) => `${v.name}=${v.value}`).join(', ')}`
            : '';

        return {
            title: 'Possible Off-by-One Error',
            description: `**Error**: ${errorOutput.output.trim()}\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}${indexInfo}\n**Suggested fix**: Check loop bounds. Arrays are 0-indexed, so valid indices are \`0\` to \`length-1\`. Verify \`<\` vs \`<=\` in loop conditions.`,
            severity: 'warning',
            pattern: 'off-by-one',
            file: location.file,
            line: location.line,
            confidence: 0.65,
        };
    },
};

const unhandledPromisePattern: PatternMatcher = {
    name: 'unhandled-promise',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('UnhandledPromiseRejection') ||
                e.output.includes('unhandled promise') ||
                e.output.includes('ERR_UNHANDLED_REJECTION'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;

        return {
            title: 'Unhandled Promise Rejection',
            description: `**Error**: ${errorOutput.output.trim()}\n${location ? `**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n` : ''}**Suggested fix**: Wrap async operations in try/catch blocks, or add .catch() handlers to promises. Ensure all async function calls are properly awaited.`,
            severity: 'error',
            pattern: 'unhandled-promise',
            file: location?.file,
            line: location?.line,
            confidence: 0.85,
        };
    },
};

const stoppedAtBreakpointPattern: PatternMatcher = {
    name: 'breakpoint-context',
    match(ctx: PatternContext): FixSuggestion | null {
        if (ctx.stopReason !== 'breakpoint') return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        // No error — this is informational context for the LLM
        return {
            title: 'Breakpoint Hit — Context Available',
            description: `**Paused at**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n**Local variables**: ${ctx.analysis.localVariables.length > 0 ? ctx.analysis.localVariables.map((v) => `\`${v.name}\`=${v.value}`).join(', ') : 'none'}\n**Tip**: Use \`debug_evaluate\` to test expressions, \`debug_get_variables\` to expand objects, or \`debug_step\` to continue execution.`,
            severity: 'info',
            pattern: 'breakpoint-context',
            file: location.file,
            line: location.line,
            confidence: 1.0,
        };
    },
};

// ---------------------------------------------------------------------------
// Enhancement 2: 5 additional patterns — total 11
// ---------------------------------------------------------------------------

const asyncAwaitPattern: PatternMatcher = {
    name: 'async-await',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('await is only valid in async') ||
                e.output.includes('is not iterable') ||
                e.output.includes('[object Promise]') ||
                e.output.includes('then is not a function'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;
        if (!location) return null;

        return {
            title: 'Async/Await Error',
            description: `**Error**: ${errorOutput.output.trim()}\n**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n**Suggested fix**: Ensure the function is declared \`async\` and all promises are \`await\`ed. Check if you're accidentally using a Promise where a resolved value is expected.`,
            severity: 'error',
            pattern: 'async-await',
            file: location.file,
            line: location.line,
            confidence: 0.85,
        };
    },
};

const importErrorPattern: PatternMatcher = {
    name: 'import-error',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('Cannot find module') ||
                e.output.includes('MODULE_NOT_FOUND') ||
                e.output.includes('is not a function') ||
                e.output.includes('does not provide an export named'),
        );

        if (!errorOutput) return null;

        // Extract module name if possible
        const moduleMatch = /Cannot find module '([^']+)'/.exec(errorOutput.output);
        const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';

        return {
            title: 'Module Import Error',
            description: `**Error**: ${errorOutput.output.trim()}\n**Module**: \`${moduleName}\`\n**Suggested fix**: Verify the module is installed (\`npm install\`), check the import path for typos, and ensure the export name is correct. For ESM/CJS mismatches, check \`package.json\` type field.`,
            severity: 'error',
            pattern: 'import-error',
            confidence: 0.8,
        };
    },
};

const assertionFailurePattern: PatternMatcher = {
    name: 'assertion-failure',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('AssertionError') ||
                e.output.includes('assert.') ||
                e.output.includes('Expected') && e.output.includes('Received'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;

        return {
            title: 'Assertion Failure',
            description: `**Error**: ${errorOutput.output.trim()}\n${location ? `**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n` : ''}**Suggested fix**: Check the expected vs actual values. Use \`debug_evaluate\` to inspect the values being compared. The assertion message above shows what was expected and what was received.`,
            severity: 'error',
            pattern: 'assertion-failure',
            file: location?.file,
            line: location?.line,
            confidence: 0.9,
        };
    },
};

const fileNotFoundPattern: PatternMatcher = {
    name: 'file-not-found',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('ENOENT') ||
                e.output.includes('no such file or directory') ||
                e.output.includes('EACCES'),
        );

        if (!errorOutput) return null;

        // Extract file path if possible
        const pathMatch = /(?:ENOENT|EACCES)[^']*'([^']+)'/.exec(errorOutput.output);
        const filePath = pathMatch ? pathMatch[1] : 'unknown';

        const location = ctx.analysis.location;

        return {
            title: errorOutput.output.includes('EACCES') ? 'Permission Denied' : 'File Not Found',
            description: `**Error**: ${errorOutput.output.trim()}\n**Path**: \`${filePath}\`\n${location ? `**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n` : ''}**Suggested fix**: Verify the file path exists and is correct. Check for typos, ensure the working directory is correct, and verify file permissions.`,
            severity: 'error',
            pattern: 'file-not-found',
            file: location?.file,
            line: location?.line,
            confidence: 0.9,
        };
    },
};

const connectionErrorPattern: PatternMatcher = {
    name: 'connection-error',
    match(ctx: PatternContext): FixSuggestion | null {
        const errorOutput = ctx.outputLog.find(
            (e) =>
                e.output.includes('ECONNREFUSED') ||
                e.output.includes('ECONNRESET') ||
                e.output.includes('ETIMEDOUT') ||
                e.output.includes('ENOTFOUND') ||
                e.output.includes('getaddrinfo'),
        );

        if (!errorOutput) return null;

        const location = ctx.analysis.location;

        // Extract address if possible
        const addrMatch = /(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)\s+([^\s]+)/.exec(
            errorOutput.output,
        );
        const address = addrMatch ? addrMatch[1] : 'unknown';

        return {
            title: 'Network Connection Error',
            description: `**Error**: ${errorOutput.output.trim()}\n**Address**: \`${address}\`\n${location ? `**Location**: \`${location.functionName}\` at ${location.file}:${String(location.line)}\n` : ''}**Suggested fix**: Verify the target server is running and accessible. Check the hostname, port, and network connectivity. For ECONNREFUSED, the server may not be started yet.`,
            severity: 'error',
            pattern: 'connection-error',
            file: location?.file,
            line: location?.line,
            confidence: 0.85,
        };
    },
};

// ---------------------------------------------------------------------------
// FixSuggestionEngine
// ---------------------------------------------------------------------------

/**
 * Analyzes debug state and generates contextual fix suggestions.
 *
 * The engine runs a set of pattern matchers against the current debug
 * context (stack trace, variables, output) and produces prioritized
 * suggestions that the Gemini agent can use to help the user fix bugs.
 *
 * This is the key differentiator for Idea 7 — it transforms raw debug
 * data into actionable, AI-ready insights.
 */
export class FixSuggestionEngine {
    private readonly patterns: PatternMatcher[];

    constructor(customPatterns?: PatternMatcher[]) {
        this.patterns = [
            nullReferencePattern,
            typeErrorPattern,
            rangeErrorPattern,
            offByOnePattern,
            unhandledPromisePattern,
            stoppedAtBreakpointPattern,
            asyncAwaitPattern,
            importErrorPattern,
            assertionFailurePattern,
            fileNotFoundPattern,
            connectionErrorPattern,
            ...(customPatterns ?? []),
        ];
    }

    /**
     * Generate fix suggestions from the current debug state.
     */
    suggest(
        analysis: DebugAnalysis,
        frames: StackFrame[],
        scopes: Scope[],
        variables: Map<number, Variable[]>,
        outputLog: OutputEntry[],
        stopReason: string,
    ): FixSuggestionResult {
        const ctx: PatternContext = {
            analysis,
            frames,
            variables,
            scopes,
            outputLog,
            stopReason,
        };

        const suggestions: FixSuggestion[] = [];

        for (const pattern of this.patterns) {
            const suggestion = pattern.match(ctx);
            if (suggestion) {
                suggestions.push(suggestion);
            }
        }

        // Sort by confidence (highest first)
        suggestions.sort((a, b) => b.confidence - a.confidence);

        const result: FixSuggestionResult = {
            analysis,
            suggestions,
            markdown: '',
        };

        result.markdown = this.toMarkdown(result);
        return result;
    }

    /**
     * Render the full result as LLM-optimized markdown.
     */
    toMarkdown(result: FixSuggestionResult): string {
        const sections: string[] = [];

        // Include the analysis markdown
        sections.push(result.analysis.markdown);

        // Add suggestions
        if (result.suggestions.length > 0) {
            sections.push('### 💡 Suggestions');

            for (const suggestion of result.suggestions) {
                const icon =
                    suggestion.severity === 'error'
                        ? '🔴'
                        : suggestion.severity === 'warning'
                            ? '🟡'
                            : 'ℹ️';
                sections.push(
                    `#### ${icon} ${suggestion.title} (${String(Math.round(suggestion.confidence * 100))}% confidence)`,
                );
                sections.push(suggestion.description);
            }
        }

        return sections.join('\n\n');
    }

    /**
     * Get the list of registered patterns. Useful for testing.
     */
    getPatterns(): string[] {
        return this.patterns.map((p) => p.name);
    }
}
