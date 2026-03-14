/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart Breakpoint Suggester — AI-Driven Breakpoint Placement.
 *
 * When the agent encounters an error, this module analyzes the error
 * output and stack trace to suggest WHERE to place breakpoints for
 * effective debugging.
 *
 * Instead of the user/agent guessing where to set breakpoints, the
 * suggester examines:
 *   1. The error location (where it crashed)
 *   2. The call stack (how it got there)
 *   3. The error type (what kind of bug)
 *
 * Then it suggests strategic breakpoint locations UPSTREAM of the
 * error to catch the bug at its source, not at its symptom.
 *
 * Inspired by Siemens Questa's "Debug Agent" that accelerates
 * root cause analysis by tracing error causation chains.
 */

import type { DebugAnalysis, FrameInfo } from './stackTraceAnalyzer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreakpointSuggestion {
    /** Where to set the breakpoint */
    file: string;
    line: number;
    /** Why this location was suggested */
    reason: string;
    /** Optional condition for conditional breakpoint */
    condition?: string;
    /** Priority (1 = most important) */
    priority: number;
    /** Strategy this suggestion belongs to */
    strategy: 'error-origin' | 'caller-chain' | 'data-flow' | 'guard-point';
}

// ---------------------------------------------------------------------------
// SmartBreakpointSuggester
// ---------------------------------------------------------------------------

/**
 * Analyzes debug state and suggests strategic breakpoint locations.
 */
export class SmartBreakpointSuggester {
    /**
     * Generate breakpoint suggestions from a debug analysis.
     */
    suggest(analysis: DebugAnalysis, errorOutput?: string): BreakpointSuggestion[] {
        const suggestions: BreakpointSuggestion[] = [];

        // Strategy 1: Error origin — breakpoint before the crash line
        this.suggestErrorOrigin(analysis, suggestions);

        // Strategy 2: Caller chain — breakpoints in calling functions
        this.suggestCallerChain(analysis, suggestions);

        // Strategy 3: Data flow — conditional breakpoints for suspicious values
        this.suggestDataFlow(analysis, errorOutput, suggestions);

        // Strategy 4: Guard points — entry/exit of key functions
        this.suggestGuardPoints(analysis, suggestions);

        // Sort by priority
        suggestions.sort((a, b) => a.priority - b.priority);

        return suggestions;
    }

    /**
     * Strategy 1: Place breakpoints just before the error location.
     * If the error is on line 42, suggest lines 40-41 to see the state
     * just before the crash.
     */
    private suggestErrorOrigin(
        analysis: DebugAnalysis,
        suggestions: BreakpointSuggestion[],
    ): void {
        if (!analysis.location) return;
        const { file, line, functionName } = analysis.location;

        // Suggest 2 lines before the error
        if (line > 2) {
            suggestions.push({
                file,
                line: line - 2,
                reason: `2 lines before the error in \`${functionName}\` — see the state just before the crash`,
                priority: 1,
                strategy: 'error-origin',
            });
        }

        // If we have source context, look for the function entry
        if (analysis.sourceContext && analysis.sourceContext.startLine < line) {
            suggestions.push({
                file,
                line: analysis.sourceContext.startLine,
                reason: `Entry of the block containing the error — trace from the beginning`,
                priority: 3,
                strategy: 'error-origin',
            });
        }
    }

    /**
     * Strategy 2: Place breakpoints in calling functions.
     * Walk up the call stack and suggest the first 2 user-code callers.
     */
    private suggestCallerChain(
        analysis: DebugAnalysis,
        suggestions: BreakpointSuggestion[],
    ): void {
        const userFrames = analysis.callStack.filter(
            (f) => f.isUserCode && f.index > 0,
        );

        // Suggest breakpoints in the first 2 user-code callers
        const callers = userFrames.slice(0, 2);
        for (const frame of callers) {
            suggestions.push({
                file: frame.file,
                line: frame.line,
                reason: `Caller \`${frame.name}\` — trace how the buggy function was invoked`,
                priority: 2,
                strategy: 'caller-chain',
            });
        }
    }

    /**
     * Strategy 3: Suggest conditional breakpoints based on suspicious values.
     * If we see null/undefined variables, suggest breaking when they become null.
     */
    private suggestDataFlow(
        analysis: DebugAnalysis,
        errorOutput: string | undefined,
        suggestions: BreakpointSuggestion[],
    ): void {
        // Look for null/undefined variables
        const nullVars = analysis.localVariables.filter(
            (v) =>
                v.value === 'null' ||
                v.value === 'undefined' ||
                v.value === 'NaN',
        );

        for (const v of nullVars) {
            if (analysis.location) {
                suggestions.push({
                    file: analysis.location.file,
                    line: analysis.location.line,
                    reason: `\`${v.name}\` is ${v.value} — break when it becomes ${v.value} to find the assignment`,
                    condition: `${v.name} === ${v.value}`,
                    priority: 2,
                    strategy: 'data-flow',
                });
            }
        }

        // Look for specific error patterns in output
        if (errorOutput) {
            const propMatch = /Cannot read propert(?:y|ies) of (?:null|undefined) \(reading '([^']+)'\)/.exec(
                errorOutput,
            );
            if (propMatch && analysis.location) {
                const propName = propMatch[1];
                // Find which variable has this property
                const parentVar = analysis.localVariables.find(
                    (v) => v.value === 'null' || v.value === 'undefined',
                );
                if (parentVar) {
                    suggestions.push({
                        file: analysis.location.file,
                        line: analysis.location.line,
                        reason: `\`${parentVar.name}.${propName}\` access failed — break when \`${parentVar.name}\` changes to track the null assignment`,
                        condition: `${parentVar.name} !== null && ${parentVar.name} !== undefined`,
                        priority: 1,
                        strategy: 'data-flow',
                    });
                }
            }
        }
    }

    /**
     * Strategy 4: Suggest guard points at function entry/exit.
     * For the top user-code function, suggest entry and before return.
     */
    private suggestGuardPoints(
        analysis: DebugAnalysis,
        suggestions: BreakpointSuggestion[],
    ): void {
        const topUserFrame = analysis.callStack.find((f) => f.isUserCode);
        if (!topUserFrame) return;

        // If there are multiple user frames, suggest the entry of the top one
        if (analysis.callStack.filter((f) => f.isUserCode).length > 1) {
            // Find the deepest user-code caller
            const deepestCaller = this.findDeepestUserCaller(analysis.callStack);
            if (deepestCaller && deepestCaller.file !== topUserFrame.file) {
                suggestions.push({
                    file: deepestCaller.file,
                    line: deepestCaller.line,
                    reason: `Root user-code entry point \`${deepestCaller.name}\` — start tracing from here`,
                    priority: 4,
                    strategy: 'guard-point',
                });
            }
        }
    }

    /**
     * Find the deepest user-code frame in the call stack.
     */
    private findDeepestUserCaller(callStack: FrameInfo[]): FrameInfo | undefined {
        const userFrames = callStack.filter((f) => f.isUserCode);
        return userFrames.length > 0 ? userFrames[userFrames.length - 1] : undefined;
    }

    /**
     * Generate LLM-friendly markdown of suggestions.
     */
    toMarkdown(suggestions: BreakpointSuggestion[]): string {
        if (suggestions.length === 0) {
            return 'No breakpoint suggestions available.';
        }

        const lines: string[] = [];
        lines.push(`### 🎯 Suggested Breakpoints (${String(suggestions.length)})`);
        lines.push('');

        for (const s of suggestions) {
            const condStr = s.condition ? ` **if** \`${s.condition}\`` : '';
            const parts = s.file.split('/');
            const shortFile = parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : s.file;
            lines.push(
                `${String(s.priority)}. \`${shortFile}:${String(s.line)}\`${condStr}`,
            );
            lines.push(`   _${s.reason}_ [${s.strategy}]`);
        }

        return lines.join('\n');
    }
}
