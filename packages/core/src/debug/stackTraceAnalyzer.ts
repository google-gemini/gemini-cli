/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StackFrame, Variable, Scope, OutputEntry } from './dapClient.js';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A structured analysis of the current debug state, formatted for LLM
 * consumption. This is the bridge between raw DAP data and the Gemini agent's
 * reasoning capabilities.
 */
export interface DebugAnalysis {
    /** One-line summary of why the debuggee stopped */
    summary: string;
    /** Where execution stopped — file, line, function */
    location: LocationInfo | null;
    /** Ordered call stack, most recent first */
    callStack: FrameInfo[];
    /** Variables from the innermost scope */
    localVariables: VariableInfo[];
    /** Recent debuggee output (stdout/stderr) */
    recentOutput: string[];
    /** Source code context around the current line */
    sourceContext: SourceContext | null;
    /** Total frame count (may exceed callStack.length if truncated) */
    totalFrames: number;
    /** LLM-ready markdown representation */
    markdown: string;
}

export interface SourceContext {
    file: string;
    startLine: number;
    endLine: number;
    currentLine: number;
    lines: string[];
}

export interface LocationInfo {
    file: string;
    line: number;
    column?: number;
    functionName: string;
}

export interface FrameInfo {
    index: number;
    name: string;
    file: string;
    line: number;
    column?: number;
    isUserCode: boolean;
}

export interface VariableInfo {
    name: string;
    value: string;
    type: string;
    expandable: boolean;
    variablesReference: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CALL_STACK_DEPTH = 20;
const MAX_VARIABLE_VALUE_LENGTH = 200;
const MAX_RECENT_OUTPUT_LINES = 20;
const SOURCE_CONTEXT_LINES = 5; // lines above/below current line

/**
 * Paths that indicate framework/runtime code (not user code).
 * Used to visually separate user code from internal code in the stack trace.
 */
const INTERNAL_PATH_PATTERNS = [
    '/node_modules/',
    'node:internal/',
    'node:events',
    'node:net',
    'node:http',
    'node:child_process',
    '<anonymous>',
    '<eval>',
];

// ---------------------------------------------------------------------------
// StackTraceAnalyzer
// ---------------------------------------------------------------------------

/**
 * Transforms raw DAP debug state into structured, LLM-optimized analysis.
 *
 * The analyzer takes the raw stack frames, variables, scopes, and output
 * from a debug session and produces a `DebugAnalysis` that the Gemini agent
 * can reason about effectively.
 *
 * Design decisions:
 * - Separates user code from framework/runtime frames
 * - Truncates long variable values to avoid token waste
 * - Produces markdown output that LLMs can parse efficiently
 * - Prioritizes local scope variables over closures and globals
 */
export class StackTraceAnalyzer {
    /**
     * Analyze the current debug state and produce an LLM-ready analysis.
     */
    analyze(
        stopReason: string,
        frames: StackFrame[],
        scopes: Scope[],
        variables: Map<number, Variable[]>,
        outputLog: OutputEntry[],
    ): DebugAnalysis {
        const callStack = this.buildCallStack(frames);
        const location = this.extractLocation(frames);
        const localVariables = this.extractVariables(scopes, variables);
        const recentOutput = this.extractRecentOutput(outputLog);
        const summary = this.buildSummary(stopReason, location, callStack);
        const sourceContext = this.readSourceContext(location);

        const analysis: DebugAnalysis = {
            summary,
            location,
            callStack,
            localVariables,
            recentOutput,
            sourceContext,
            totalFrames: frames.length,
            markdown: '', // filled below
        };

        analysis.markdown = this.toMarkdown(analysis);
        return analysis;
    }

    /**
     * Convert raw stack frames to annotated FrameInfo with user-code detection.
     */
    buildCallStack(frames: StackFrame[]): FrameInfo[] {
        return frames.slice(0, MAX_CALL_STACK_DEPTH).map((frame, index) => {
            const file = frame.source?.path ?? frame.source?.name ?? '<unknown>';
            return {
                index,
                name: frame.name,
                file,
                line: frame.line,
                column: frame.column,
                isUserCode: this.isUserCode(file),
            };
        });
    }

    /**
     * Extract the top (current) location from the stack.
     */
    extractLocation(frames: StackFrame[]): LocationInfo | null {
        if (frames.length === 0) return null;
        const top = frames[0];
        return {
            file: top.source?.path ?? top.source?.name ?? '<unknown>',
            line: top.line,
            column: top.column,
            functionName: top.name,
        };
    }

    /**
     * Extract local variables from the innermost scope, with truncation
     * for large values.
     */
    extractVariables(
        scopes: Scope[],
        variableMap: Map<number, Variable[]>,
    ): VariableInfo[] {
        const result: VariableInfo[] = [];

        // Process scopes in order: Local → Closure → Global
        // But only include Local and Closure (globals are too noisy)
        for (const scope of scopes) {
            if (scope.name.toLowerCase() === 'global') continue;

            const vars = variableMap.get(scope.variablesReference) ?? [];
            for (const v of vars) {
                result.push({
                    name: v.name,
                    value: this.truncateValue(v.value),
                    type: v.type ?? 'unknown',
                    expandable: v.variablesReference > 0,
                    variablesReference: v.variablesReference,
                });
            }
        }

        return result;
    }

    /**
     * Get recent output lines from the debuggee.
     */
    extractRecentOutput(outputLog: OutputEntry[]): string[] {
        return outputLog
            .filter((e) => e.category === 'stdout' || e.category === 'stderr')
            .slice(-MAX_RECENT_OUTPUT_LINES)
            .map((e) => {
                const prefix = e.category === 'stderr' ? '[stderr] ' : '';
                return `${prefix}${e.output.trimEnd()}`;
            })
            .filter((line) => line.length > 0);
    }

    /**
     * Build a one-line summary of the stop reason and location.
     */
    buildSummary(
        stopReason: string,
        location: LocationInfo | null,
        callStack: FrameInfo[],
    ): string {
        const locationStr = location
            ? ` in \`${location.functionName}\` at ${this.shortPath(location.file)}:${String(location.line)}`
            : '';

        const userFrameCount = callStack.filter((f) => f.isUserCode).length;
        const depthStr =
            callStack.length > 1
                ? ` (${String(userFrameCount)} user frame${userFrameCount !== 1 ? 's' : ''}, ${String(callStack.length)} total)`
                : '';

        switch (stopReason) {
            case 'breakpoint':
                return `Hit breakpoint${locationStr}${depthStr}`;
            case 'step':
                return `Stepped${locationStr}${depthStr}`;
            case 'exception':
                return `Exception thrown${locationStr}${depthStr}`;
            case 'pause':
                return `Paused${locationStr}${depthStr}`;
            case 'entry':
                return `Entry point${locationStr}${depthStr}`;
            default:
                return `Stopped (${stopReason})${locationStr}${depthStr}`;
        }
    }

    /**
     * Render the analysis as LLM-optimized markdown.
     */
    toMarkdown(analysis: DebugAnalysis): string {
        const sections: string[] = [];

        // Header
        sections.push(`## Debug State: ${analysis.summary}`);

        // Source Context (most valuable for LLM)
        if (analysis.sourceContext) {
            sections.push('### Source Code');
            sections.push(`\`${this.shortPath(analysis.sourceContext.file)}\``);
            sections.push('```typescript');
            analysis.sourceContext.lines.forEach((line, i) => {
                const lineNum = analysis.sourceContext!.startLine + i;
                const marker = lineNum === analysis.sourceContext!.currentLine ? '→' : ' ';
                sections.push(`${marker} ${String(lineNum).padStart(4)} | ${line}`);
            });
            sections.push('```');
        }

        // Call Stack
        if (analysis.callStack.length > 0) {
            sections.push('### Call Stack');
            const stackLines = analysis.callStack.map((f) => {
                const marker = f.isUserCode ? '→' : ' ';
                const loc = `${this.shortPath(f.file)}:${String(f.line)}`;
                return `${marker} #${String(f.index)} \`${f.name}\` at ${loc}`;
            });
            sections.push(stackLines.join('\n'));
            if (analysis.totalFrames > analysis.callStack.length) {
                sections.push(
                    `... and ${String(analysis.totalFrames - analysis.callStack.length)} more frames`,
                );
            }
        }

        // Variables
        if (analysis.localVariables.length > 0) {
            sections.push('### Local Variables');
            const varLines = analysis.localVariables.map((v) => {
                const expandMarker = v.expandable ? ' 📦' : '';
                return `- \`${v.name}\` (${v.type}): ${v.value}${expandMarker}`;
            });
            sections.push(varLines.join('\n'));
        }

        // Output
        if (analysis.recentOutput.length > 0) {
            sections.push('### Recent Output');
            sections.push('```');
            sections.push(analysis.recentOutput.join('\n'));
            sections.push('```');
        }

        return sections.join('\n\n');
    }

    /**
     * Check if a file path points to user code (not node_modules, not node internals).
     */
    isUserCode(filePath: string): boolean {
        return !INTERNAL_PATH_PATTERNS.some((pattern) =>
            filePath.includes(pattern),
        );
    }

    /**
     * Truncate long variable values to prevent token waste.
     */
    truncateValue(value: string): string {
        if (value.length <= MAX_VARIABLE_VALUE_LENGTH) return value;
        return `${value.slice(0, MAX_VARIABLE_VALUE_LENGTH)}... (truncated)`;
    }

    /**
     * Shorten a file path for display by keeping only the last 2-3 components.
     */
    shortPath(filePath: string): string {
        const parts = filePath.split('/');
        if (parts.length <= 3) return filePath;
        return `.../${parts.slice(-3).join('/')}`;
    }

    /**
     * Read source code around the current line for context.
     * Returns null if the file can't be read (e.g. node internals).
     */
    readSourceContext(location: LocationInfo | null): SourceContext | null {
        if (!location) return null;
        if (!this.isUserCode(location.file)) return null;

        try {
            const content = readFileSync(location.file, 'utf-8');
            const allLines = content.split('\n');
            const start = Math.max(0, location.line - SOURCE_CONTEXT_LINES - 1);
            const end = Math.min(allLines.length, location.line + SOURCE_CONTEXT_LINES);
            const lines = allLines.slice(start, end);

            return {
                file: location.file,
                startLine: start + 1,
                endLine: end,
                currentLine: location.line,
                lines,
            };
        } catch {
            // File may not exist or may not be readable
            return null;
        }
    }
}
