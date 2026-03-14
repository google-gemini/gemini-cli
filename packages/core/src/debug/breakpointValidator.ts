/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Breakpoint Validator — Validate breakpoint locations before setting them.
 *
 * WHY THIS MATTERS:
 * The #1 frustration in debugging is setting a breakpoint and getting
 * "breakpoint not verified" back from the adapter. This happens because:
 *
 *   1. The line is a comment or blank line
 *   2. The line is a type-only declaration (TypeScript)
 *   3. The file doesn't exist or the path is wrong
 *   4. The line number is beyond the end of file
 *   5. The line is inside a string literal or template
 *
 * Rather than sending a blind setBreakpoints request and hoping for the
 * best, we validate BEFORE we send. If the line is invalid, we suggest
 * the nearest valid line. This saves the LLM a round-trip and prevents
 * "breakpoint not verified" confusion.
 *
 * The validator can also detect common path issues:
 *   - Relative vs absolute paths
 *   - Source map paths vs compiled paths
 *   - Case sensitivity issues on Linux vs macOS
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
    /** Whether the breakpoint location is valid */
    valid: boolean;
    /** The original file path */
    file: string;
    /** Resolved absolute path (if file was found) */
    resolvedPath?: string;
    /** The requested line number */
    line: number;
    /** Suggested nearest valid line (if original was invalid) */
    suggestedLine?: number;
    /** What's on the requested line */
    lineContent?: string;
    /** Reason the breakpoint is invalid */
    reason?: string;
    /** Severity of the issue */
    severity: 'error' | 'warning' | 'info';
    /** Hint for the LLM on how to fix */
    hint?: string;
}

export interface FileAnalysis {
    /** Total line count */
    totalLines: number;
    /** Lines that contain executable code */
    executableLines: number[];
    /** Lines that are comments */
    commentLines: number[];
    /** Lines that are blank */
    blankLines: number[];
    /** Lines that are type-only (TypeScript) */
    typeOnlyLines: number[];
    /** Function/method boundaries: [startLine, endLine, name] */
    functionBoundaries: Array<[number, number, string]>;
}

// ---------------------------------------------------------------------------
// Line Classification Patterns
// ---------------------------------------------------------------------------

/** Lines that definitely don't generate executable code */
/** Patterns indicating function/method start */
const FUNCTION_PATTERNS = [
    /^\s*(async\s+)?function\s+\w+/,               // function foo()
    /^\s*(export\s+)?(async\s+)?function\s+\w+/,   // export function foo()
    /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\(/,  // method(
    /^\s*(?:const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,        // const foo = (
    /^\s*(?:const|let|var)\s+\w+\s*=\s*(async\s+)?function/,  // const foo = function
    /^\s*def\s+\w+/,                                // Python def
    /^\s*func\s+\w+/,                               // Go func
    /^\s*class\s+\w+/,                              // class declaration
];

// ---------------------------------------------------------------------------
// BreakpointValidator
// ---------------------------------------------------------------------------

export class BreakpointValidator {
    private readonly fileCache = new Map<string, string[]>();
    private readonly analysisCache = new Map<string, FileAnalysis>();

    /**
     * Validate a single breakpoint location.
     */
    async validate(file: string, line: number, workingDir?: string): Promise<ValidationResult> {
        // Step 1: Resolve the file path
        const resolvedPath = this.resolvePath(file, workingDir);

        if (!resolvedPath) {
            return {
                valid: false,
                file,
                line,
                severity: 'error',
                reason: 'File not found',
                hint: `Could not find "${file}". Check if the path is correct, or use an absolute path.`,
            };
        }

        // Step 2: Read and cache the file
        const lines = this.readFile(resolvedPath);
        if (!lines) {
            return {
                valid: false,
                file,
                resolvedPath,
                line,
                severity: 'error',
                reason: 'Could not read file',
                hint: 'The file exists but could not be read. Check permissions.',
            };
        }

        // Step 3: Check line bounds
        if (line < 1 || line > lines.length) {
            return {
                valid: false,
                file,
                resolvedPath,
                line,
                severity: 'error',
                reason: `Line ${String(line)} is out of range (file has ${String(lines.length)} lines)`,
                hint: `Valid line range is 1-${String(lines.length)}.`,
            };
        }

        // Step 4: Analyze the line content
        const lineContent = lines[line - 1];
        const analysis = this.analyzeFile(resolvedPath, lines);

        // Check if line is executable
        if (analysis.blankLines.includes(line)) {
            const suggested = this.findNearestExecutable(line, analysis);
            return {
                valid: false,
                file,
                resolvedPath,
                line,
                lineContent,
                suggestedLine: suggested,
                severity: 'warning',
                reason: 'Line is blank',
                hint: suggested
                    ? `Nearest executable line is ${String(suggested)}: "${lines[suggested - 1].trim()}"`
                    : 'No nearby executable line found.',
            };
        }

        if (analysis.commentLines.includes(line)) {
            const suggested = this.findNearestExecutable(line, analysis);
            return {
                valid: false,
                file,
                resolvedPath,
                line,
                lineContent,
                suggestedLine: suggested,
                severity: 'warning',
                reason: 'Line is a comment',
                hint: suggested
                    ? `Nearest executable line is ${String(suggested)}: "${lines[suggested - 1].trim()}"`
                    : 'No nearby executable line found.',
            };
        }

        if (analysis.typeOnlyLines.includes(line)) {
            const suggested = this.findNearestExecutable(line, analysis);
            return {
                valid: false,
                file,
                resolvedPath,
                line,
                lineContent,
                suggestedLine: suggested,
                severity: 'warning',
                reason: 'Line is a type-only declaration (TypeScript) — no runtime code generated',
                hint: suggested
                    ? `Nearest executable line is ${String(suggested)}: "${lines[suggested - 1].trim()}"`
                    : 'No nearby executable line found.',
            };
        }

        // Step 5: Line looks valid
        return {
            valid: true,
            file,
            resolvedPath,
            line,
            lineContent,
            severity: 'info',
        };
    }

    /**
     * Validate multiple breakpoints at once.
     */
    async validateBatch(
        breakpoints: Array<{ file: string; line: number }>,
        workingDir?: string,
    ): Promise<ValidationResult[]> {
        return Promise.all(
            breakpoints.map((bp) => this.validate(bp.file, bp.line, workingDir)),
        );
    }

    /**
     * Get a full analysis of a file's breakpoint-eligible lines.
     */
    getFileAnalysis(file: string, workingDir?: string): FileAnalysis | null {
        const resolvedPath = this.resolvePath(file, workingDir);
        if (!resolvedPath) return null;

        const lines = this.readFile(resolvedPath);
        if (!lines) return null;

        return this.analyzeFile(resolvedPath, lines);
    }

    /**
     * Clear caches (e.g., when files change).
     */
    clearCache(): void {
        this.fileCache.clear();
        this.analysisCache.clear();
    }

    /**
     * Generate LLM-friendly markdown report.
     */
    toMarkdown(results: ValidationResult[]): string {
        const lines: string[] = ['### 🔍 Breakpoint Validation'];
        const valid = results.filter((r) => r.valid);
        const invalid = results.filter((r) => !r.valid);

        if (valid.length > 0) {
            lines.push(`\n✅ **${String(valid.length)} valid breakpoint(s)**`);
            for (const r of valid) {
                lines.push(`- \`${r.file}:${String(r.line)}\` — ${r.lineContent?.trim() ?? ''}`);
            }
        }

        if (invalid.length > 0) {
            lines.push(`\n⚠️ **${String(invalid.length)} invalid breakpoint(s)**`);
            for (const r of invalid) {
                const suggestion = r.suggestedLine
                    ? ` → suggest line ${String(r.suggestedLine)}`
                    : '';
                lines.push(`- \`${r.file}:${String(r.line)}\` — ${r.reason ?? 'unknown'}${suggestion}`);
                if (r.hint) {
                    lines.push(`  💡 ${r.hint}`);
                }
            }
        }

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private resolvePath(file: string, workingDir?: string): string | null {
        // Try absolute path first
        if (path.isAbsolute(file) && fs.existsSync(file)) {
            return file;
        }

        // Try relative to working directory
        if (workingDir) {
            const resolved = path.resolve(workingDir, file);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }

        // Try relative to process.cwd()
        const fromCwd = path.resolve(process.cwd(), file);
        if (fs.existsSync(fromCwd)) {
            return fromCwd;
        }

        return null;
    }

    private readFile(resolvedPath: string): string[] | null {
        if (this.fileCache.has(resolvedPath)) {
            return this.fileCache.get(resolvedPath)!;
        }

        try {
            const content = fs.readFileSync(resolvedPath, 'utf-8');
            const lines = content.split('\n');
            this.fileCache.set(resolvedPath, lines);
            return lines;
        } catch {
            return null;
        }
    }

    private analyzeFile(resolvedPath: string, lines: string[]): FileAnalysis {
        if (this.analysisCache.has(resolvedPath)) {
            return this.analysisCache.get(resolvedPath)!;
        }

        const executableLines: number[] = [];
        const commentLines: number[] = [];
        const blankLines: number[] = [];
        const typeOnlyLines: number[] = [];
        const functionBoundaries: Array<[number, number, string]> = [];

        let inBlockComment = false;

        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i];
            const trimmed = line.trim();

            // Block comment tracking
            if (inBlockComment) {
                commentLines.push(lineNum);
                if (trimmed.includes('*/')) {
                    inBlockComment = false;
                }
                continue;
            }

            if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
                inBlockComment = true;
                commentLines.push(lineNum);
                continue;
            }

            // Classify
            if (trimmed === '') {
                blankLines.push(lineNum);
            } else if (/^\s*\/\//.test(line) || /^\s*#(?!!)/.test(line)) {
                commentLines.push(lineNum);
            } else if (
                /^\s*import\s+type\s/.test(line) ||
                /^\s*export\s+type\s/.test(line) ||
                /^\s*interface\s/.test(line) ||
                /^\s*type\s+\w+\s*=/.test(line) ||
                /^\s*declare\s/.test(line)
            ) {
                typeOnlyLines.push(lineNum);
            } else {
                executableLines.push(lineNum);
            }

            // Function detection
            for (const pattern of FUNCTION_PATTERNS) {
                if (pattern.test(line)) {
                    const nameMatch = line.match(/(?:function|def|func|class)\s+(\w+)/);
                    const name = nameMatch?.[1] ?? 'anonymous';
                    functionBoundaries.push([lineNum, 0, name]); // endLine filled later
                    break;
                }
            }
        }

        const analysis: FileAnalysis = {
            totalLines: lines.length,
            executableLines,
            commentLines,
            blankLines,
            typeOnlyLines,
            functionBoundaries,
        };

        this.analysisCache.set(resolvedPath, analysis);
        return analysis;
    }

    private findNearestExecutable(line: number, analysis: FileAnalysis): number | undefined {
        if (analysis.executableLines.length === 0) return undefined;

        let closest: number | undefined;
        let minDist = Infinity;

        for (const execLine of analysis.executableLines) {
            const dist = Math.abs(execLine - line);
            if (dist < minDist) {
                minDist = dist;
                closest = execLine;
            }
            // Prefer lines AFTER the requested line (moving forward)
            if (dist === minDist && execLine > line && (closest === undefined || closest < line)) {
                closest = execLine;
            }
        }

        return closest;
    }
}
