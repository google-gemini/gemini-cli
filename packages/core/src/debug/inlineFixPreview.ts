/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline Fix Preview — Show What a Fix Would Look Like.
 *
 * When the FixSuggestionEngine identifies a bug, this module goes
 * one step further: it generates a PREVIEW of what the fix would
 * look like in the actual source code.
 *
 * Instead of just:
 *   "Add a null check before accessing user.name"
 *
 * The agent can show:
 *   ```diff
 *   - return user.name;
 *   + return user?.name ?? 'unknown';
 *   ```
 *
 * This transforms the debug companion from "here's what's wrong"
 * to "here's exactly how to fix it" — the ultimate value-add.
 */

import type { SourceContext } from './stackTraceAnalyzer.js';
import type { FixSuggestion } from './fixSuggestionEngine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixPreview {
    /** The original line(s) of code */
    originalLines: string[];
    /** The suggested replacement line(s) */
    fixedLines: string[];
    /** File where the fix would be applied */
    file: string;
    /** Starting line number */
    startLine: number;
    /** The fix suggestion this preview is for */
    suggestion: FixSuggestion;
    /** Unified diff representation */
    diff: string;
}

// ---------------------------------------------------------------------------
// InlineFixPreview
// ---------------------------------------------------------------------------

/**
 * Generates inline code fix previews from suggestions and source context.
 */
export class InlineFixPreview {
    /**
     * Generate fix previews for suggestions that have enough context.
     */
    generatePreviews(
        suggestions: FixSuggestion[],
        sourceContext: SourceContext | null,
    ): FixPreview[] {
        if (!sourceContext) return [];

        const previews: FixPreview[] = [];

        for (const suggestion of suggestions) {
            const preview = this.generatePreview(suggestion, sourceContext);
            if (preview) {
                previews.push(preview);
            }
        }

        return previews;
    }

    /**
     * Generate a fix preview for a single suggestion.
     */
    private generatePreview(
        suggestion: FixSuggestion,
        sourceContext: SourceContext,
    ): FixPreview | null {
        const line = suggestion.line ?? sourceContext.currentLine;
        const lineIndex = line - sourceContext.startLine;

        if (lineIndex < 0 || lineIndex >= sourceContext.lines.length) {
            return null;
        }

        const originalLine = sourceContext.lines[lineIndex];
        const fixedLine = this.applyFix(suggestion, originalLine);

        if (!fixedLine || fixedLine === originalLine) {
            return null;
        }

        const diff = this.generateDiff(originalLine, fixedLine, line);

        return {
            originalLines: [originalLine],
            fixedLines: [fixedLine],
            file: sourceContext.file,
            startLine: line,
            suggestion,
            diff,
        };
    }

    /**
     * Apply a fix based on the suggestion pattern.
     * Returns the modified line, or null if no fix can be generated.
     */
    private applyFix(suggestion: FixSuggestion, line: string): string | null {
        switch (suggestion.pattern) {
            case 'null-reference':
                return this.fixNullReference(line, suggestion);
            case 'type-error':
                return this.fixTypeError(line);
            case 'async-await':
                return this.fixAsyncAwait(line);
            default:
                return null;
        }
    }

    /**
     * Fix null reference: add optional chaining or null check.
     */
    private fixNullReference(line: string, suggestion: FixSuggestion): string | null {
        // Extract the property access that caused the error
        const propMatch = /(\w+)\.(\w+)/.exec(line);
        if (!propMatch) return null;

        const [fullMatch, obj, prop] = propMatch;
        const indent = line.match(/^\s*/)?.[0] ?? '';

        // Check if it's a return statement
        if (line.trim().startsWith('return')) {
            return line.replace(fullMatch, `${obj}?.${prop}`);
        }

        // Check if it's in a conditional
        if (line.includes('if') || line.includes('?')) {
            return null; // Already has a check
        }

        // Check the description for the null variable name
        const nullVarMatch = /`(\w+)`.*(?:null|undefined)/.exec(suggestion.description);
        if (nullVarMatch && nullVarMatch[1] === obj) {
            // Add a null guard
            return `${indent}if (${obj} != null) { ${line.trim()} }`;
        }

        return line.replace(fullMatch, `${obj}?.${prop}`);
    }

    /**
     * Fix type error: add type coercion or assertion.
     */
    private fixTypeError(line: string): string | null {
        // const → let for assignment to constant
        if (line.includes('const ')) {
            return line.replace('const ', 'let ');
        }
        return null;
    }

    /**
     * Fix async/await: add async keyword or await.
     */
    private fixAsyncAwait(line: string): string | null {
        // Add async to function declaration
        if (line.includes('function ') && !line.includes('async')) {
            return line.replace('function ', 'async function ');
        }

        // Add async to arrow function
        if (line.includes('=>') && !line.includes('async')) {
            const arrowMatch = /(\w+)\s*=\s*(\([^)]*\))\s*=>/.exec(line);
            if (arrowMatch) {
                return line.replace(
                    `${arrowMatch[1]} = ${arrowMatch[2]} =>`,
                    `${arrowMatch[1]} = async ${arrowMatch[2]} =>`,
                );
            }
        }

        return null;
    }

    /**
     * Generate a unified diff representation.
     */
    private generateDiff(original: string, fixed: string, lineNum: number): string {
        const lines: string[] = [];
        lines.push('```diff');
        lines.push(`@@ -${String(lineNum)},1 +${String(lineNum)},1 @@`);
        lines.push(`-${original}`);
        lines.push(`+${fixed}`);
        lines.push('```');
        return lines.join('\n');
    }

    /**
     * Generate LLM-friendly markdown of all previews.
     */
    toMarkdown(previews: FixPreview[]): string {
        if (previews.length === 0) {
            return '';
        }

        const lines: string[] = [];
        lines.push('### 🔧 Fix Previews');
        lines.push('');

        for (const preview of previews) {
            lines.push(`**${preview.suggestion.title}** at line ${String(preview.startLine)}:`);
            lines.push(preview.diff);
            lines.push('');
        }

        return lines.join('\n');
    }
}
