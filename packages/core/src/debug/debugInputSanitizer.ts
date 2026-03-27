/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Input Sanitizer — Defense-in-Depth for Debug Tools.
 *
 * Every input to debug tools passes through this sanitizer BEFORE
 * reaching the DAP client. This is the first line of defense:
 *
 *   1. Path traversal prevention (../../etc/passwd → BLOCKED)
 *   2. Line/column range validation (line -1 → BLOCKED)
 *   3. Expression injection detection (eval in conditions → BLOCKED)
 *   4. String length limits (1MB expression → BLOCKED)
 *   5. Type coercion safety (string "42" → number 42)
 *
 * This complements DebugPolicyGuard (which handles permission/policy)
 * with strict INPUT VALIDATION (which handles malformed data).
 *
 * Together they form a security sandwich:
 *   User Input → InputSanitizer → PolicyGuard → DAPClient
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanitizeResult {
    /** Whether the input is valid after sanitization */
    valid: boolean;
    /** Sanitized value (if valid) */
    value: unknown;
    /** Error message (if invalid) */
    error?: string;
    /** Warnings (non-fatal issues that were auto-corrected) */
    warnings: string[];
}

export interface SanitizeOptions {
    /** Maximum string length */
    maxStringLength?: number;
    /** Maximum path depth */
    maxPathDepth?: number;
    /** Allow relative paths */
    allowRelativePaths?: boolean;
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULTS: Required<SanitizeOptions> = {
    maxStringLength: 10000,
    maxPathDepth: 50,
    allowRelativePaths: false,
};

// ---------------------------------------------------------------------------
// DebugInputSanitizer
// ---------------------------------------------------------------------------

/**
 * Validates and sanitizes all inputs to debug tools.
 */
export class DebugInputSanitizer {
    private readonly options: Required<SanitizeOptions>;

    constructor(options?: SanitizeOptions) {
        this.options = { ...DEFAULTS, ...options };
    }

    /**
     * Sanitize a file path argument.
     */
    sanitizePath(input: unknown): SanitizeResult {
        const warnings: string[] = [];

        if (typeof input !== 'string') {
            return { valid: false, value: null, error: 'Path must be a string', warnings };
        }

        if (input.length === 0) {
            return { valid: false, value: null, error: 'Path cannot be empty', warnings };
        }

        if (input.length > this.options.maxStringLength) {
            return { valid: false, value: null, error: `Path too long (${String(input.length)} chars)`, warnings };
        }

        // Path traversal detection
        if (input.includes('..')) {
            return { valid: false, value: null, error: 'Path traversal detected (..)' , warnings };
        }

        // Null byte injection
        if (input.includes('\0')) {
            return { valid: false, value: null, error: 'Null byte detected in path', warnings };
        }

        // Check path depth
        const depth = input.split('/').length;
        if (depth > this.options.maxPathDepth) {
            return { valid: false, value: null, error: `Path too deep (${String(depth)} levels)`, warnings };
        }

        // Require absolute path unless configured otherwise
        if (!this.options.allowRelativePaths && !input.startsWith('/')) {
            return { valid: false, value: null, error: 'Absolute path required', warnings };
        }

        // Normalize path (remove double slashes)
        let sanitized = input.replace(/\/+/g, '/');
        if (sanitized !== input) {
            warnings.push('Normalized double slashes in path');
        }

        // Remove trailing slash (unless root)
        if (sanitized.length > 1 && sanitized.endsWith('/')) {
            sanitized = sanitized.slice(0, -1);
            warnings.push('Removed trailing slash');
        }

        return { valid: true, value: sanitized, warnings };
    }

    /**
     * Sanitize a line number argument.
     */
    sanitizeLine(input: unknown): SanitizeResult {
        const warnings: string[] = [];

        // Type coercion
        let line: number;
        if (typeof input === 'string') {
            line = parseInt(input, 10);
            warnings.push('Coerced string to number');
        } else if (typeof input === 'number') {
            line = input;
        } else {
            return { valid: false, value: null, error: 'Line must be a number', warnings };
        }

        if (isNaN(line)) {
            return { valid: false, value: null, error: 'Line is NaN', warnings };
        }

        if (!Number.isInteger(line)) {
            line = Math.floor(line);
            warnings.push('Rounded line to integer');
        }

        if (line < 1) {
            return { valid: false, value: null, error: 'Line must be >= 1', warnings };
        }

        if (line > 1_000_000) {
            return { valid: false, value: null, error: 'Line number too large', warnings };
        }

        return { valid: true, value: line, warnings };
    }

    /**
     * Sanitize an expression argument (for debug_evaluate).
     */
    sanitizeExpression(input: unknown): SanitizeResult {
        const warnings: string[] = [];

        if (typeof input !== 'string') {
            return { valid: false, value: null, error: 'Expression must be a string', warnings };
        }

        if (input.length === 0) {
            return { valid: false, value: null, error: 'Expression cannot be empty', warnings };
        }

        if (input.length > this.options.maxStringLength) {
            return {
                valid: false,
                value: null,
                error: `Expression too long (${String(input.length)} chars, max ${String(this.options.maxStringLength)})`,
                warnings,
            };
        }

        // Null byte detection
        if (input.includes('\0')) {
            return { valid: false, value: null, error: 'Null byte detected in expression', warnings };
        }

        // Multi-statement detection (potential injection)
        if (input.includes(';') && !input.includes('for') && !input.includes('if')) {
            warnings.push('Expression contains semicolons — may be multi-statement');
        }

        return { valid: true, value: input.trim(), warnings };
    }

    /**
     * Sanitize a breakpoint condition.
     */
    sanitizeCondition(input: unknown): SanitizeResult {
        const warnings: string[] = [];

        if (input === undefined || input === null) {
            return { valid: true, value: undefined, warnings };
        }

        if (typeof input !== 'string') {
            return { valid: false, value: null, error: 'Condition must be a string', warnings };
        }

        if (input.length > 500) {
            return { valid: false, value: null, error: 'Condition too long (max 500 chars)', warnings };
        }

        // Block dangerous patterns in conditions
        const dangerous = [
            /require\s*\(/,
            /import\s*\(/,
            /eval\s*\(/,
            /Function\s*\(/,
            /process\.(exit|kill|env)/,
            /fs\.\w+/,
            /child_process/,
        ];

        for (const pattern of dangerous) {
            if (pattern.test(input)) {
                return {
                    valid: false,
                    value: null,
                    error: `Dangerous pattern in condition: ${pattern.source}`,
                    warnings,
                };
            }
        }

        return { valid: true, value: input.trim(), warnings };
    }

    /**
     * Sanitize a thread ID.
     */
    sanitizeThreadId(input: unknown): SanitizeResult {
        const warnings: string[] = [];

        if (input === undefined || input === null) {
            return { valid: true, value: 1, warnings: ['Defaulted threadId to 1'] };
        }

        if (typeof input === 'string') {
            const num = parseInt(input, 10);
            if (isNaN(num)) {
                return { valid: false, value: null, error: 'ThreadId must be numeric', warnings };
            }
            warnings.push('Coerced threadId from string');
            return { valid: true, value: num, warnings };
        }

        if (typeof input !== 'number' || !Number.isInteger(input)) {
            return { valid: false, value: null, error: 'ThreadId must be an integer', warnings };
        }

        return { valid: true, value: input, warnings };
    }

    /**
     * Sanitize a full debug tool input object.
     */
    sanitizeToolInput(
        toolName: string,
        params: Record<string, unknown>,
    ): { valid: boolean; sanitized: Record<string, unknown>; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const allWarnings: string[] = [];
        const sanitized: Record<string, unknown> = { ...params };

        // File path validation
        if ('file' in params) {
            const result = this.sanitizePath(params['file']);
            if (!result.valid) errors.push(`file: ${result.error!}`);
            else sanitized['file'] = result.value;
            allWarnings.push(...result.warnings);
        }

        if ('program' in params) {
            const result = this.sanitizePath(params['program']);
            if (!result.valid) errors.push(`program: ${result.error!}`);
            else sanitized['program'] = result.value;
            allWarnings.push(...result.warnings);
        }

        // Line validation
        if ('line' in params) {
            const result = this.sanitizeLine(params['line']);
            if (!result.valid) errors.push(`line: ${result.error!}`);
            else sanitized['line'] = result.value;
            allWarnings.push(...result.warnings);
        }

        // Expression validation
        if ('expression' in params) {
            const result = this.sanitizeExpression(params['expression']);
            if (!result.valid) errors.push(`expression: ${result.error!}`);
            else sanitized['expression'] = result.value;
            allWarnings.push(...result.warnings);
        }

        // Condition validation
        if ('condition' in params) {
            const result = this.sanitizeCondition(params['condition']);
            if (!result.valid) errors.push(`condition: ${result.error!}`);
            else sanitized['condition'] = result.value;
            allWarnings.push(...result.warnings);
        }

        // ThreadId validation
        if ('thread_id' in params) {
            const result = this.sanitizeThreadId(params['thread_id']);
            if (!result.valid) errors.push(`thread_id: ${result.error!}`);
            else sanitized['thread_id'] = result.value;
            allWarnings.push(...result.warnings);
        }

        return {
            valid: errors.length === 0,
            sanitized,
            errors,
            warnings: allWarnings,
        };
    }
}
