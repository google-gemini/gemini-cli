/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugInputSanitizer } from './debugInputSanitizer.js';

describe('DebugInputSanitizer', () => {
    const sanitizer = new DebugInputSanitizer();

    describe('sanitizePath', () => {
        it('should accept valid absolute paths', () => {
            const result = sanitizer.sanitizePath('/home/user/app.ts');
            expect(result.valid).toBe(true);
            expect(result.value).toBe('/home/user/app.ts');
        });

        it('should block path traversal', () => {
            expect(sanitizer.sanitizePath('/home/../etc/passwd').valid).toBe(false);
            expect(sanitizer.sanitizePath('../../secret').valid).toBe(false);
        });

        it('should block null bytes', () => {
            expect(sanitizer.sanitizePath('/app/file\0.ts').valid).toBe(false);
        });

        it('should reject empty paths', () => {
            expect(sanitizer.sanitizePath('').valid).toBe(false);
        });

        it('should reject non-string paths', () => {
            expect(sanitizer.sanitizePath(42).valid).toBe(false);
            expect(sanitizer.sanitizePath(null).valid).toBe(false);
        });

        it('should normalize double slashes with warning', () => {
            const result = sanitizer.sanitizePath('/home//user///app.ts');
            expect(result.valid).toBe(true);
            expect(result.value).toBe('/home/user/app.ts');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should remove trailing slash with warning', () => {
            const result = sanitizer.sanitizePath('/home/user/');
            expect(result.valid).toBe(true);
            expect(result.value).toBe('/home/user');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should require absolute paths by default', () => {
            expect(sanitizer.sanitizePath('relative/path.ts').valid).toBe(false);
        });

        it('should allow relative paths when configured', () => {
            const lenient = new DebugInputSanitizer({ allowRelativePaths: true });
            expect(lenient.sanitizePath('relative/path.ts').valid).toBe(true);
        });

        it('should reject excessively long paths', () => {
            const longPath = '/' + 'a'.repeat(10001);
            expect(sanitizer.sanitizePath(longPath).valid).toBe(false);
        });
    });

    describe('sanitizeLine', () => {
        it('should accept valid line numbers', () => {
            expect(sanitizer.sanitizeLine(42).valid).toBe(true);
            expect(sanitizer.sanitizeLine(42).value).toBe(42);
        });

        it('should coerce string to number', () => {
            const result = sanitizer.sanitizeLine('42');
            expect(result.valid).toBe(true);
            expect(result.value).toBe(42);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should reject line < 1', () => {
            expect(sanitizer.sanitizeLine(0).valid).toBe(false);
            expect(sanitizer.sanitizeLine(-5).valid).toBe(false);
        });

        it('should reject NaN', () => {
            expect(sanitizer.sanitizeLine('abc').valid).toBe(false);
        });

        it('should round floats with warning', () => {
            const result = sanitizer.sanitizeLine(3.7);
            expect(result.valid).toBe(true);
            expect(result.value).toBe(3);
        });

        it('should reject extremely large line numbers', () => {
            expect(sanitizer.sanitizeLine(2_000_000).valid).toBe(false);
        });
    });

    describe('sanitizeExpression', () => {
        it('should accept valid expressions', () => {
            expect(sanitizer.sanitizeExpression('x + 1').valid).toBe(true);
        });

        it('should reject non-strings', () => {
            expect(sanitizer.sanitizeExpression(42).valid).toBe(false);
        });

        it('should reject empty expressions', () => {
            expect(sanitizer.sanitizeExpression('').valid).toBe(false);
        });

        it('should block null bytes', () => {
            expect(sanitizer.sanitizeExpression('x\0y').valid).toBe(false);
        });

        it('should trim whitespace', () => {
            const result = sanitizer.sanitizeExpression('  x + 1  ');
            expect(result.value).toBe('x + 1');
        });

        it('should warn on semicolons', () => {
            const result = sanitizer.sanitizeExpression('x = 1; y = 2');
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });

    describe('sanitizeCondition', () => {
        it('should accept valid conditions', () => {
            expect(sanitizer.sanitizeCondition('x > 5').valid).toBe(true);
        });

        it('should accept undefined (optional)', () => {
            expect(sanitizer.sanitizeCondition(undefined).valid).toBe(true);
        });

        it('should block require() in conditions', () => {
            expect(sanitizer.sanitizeCondition("require('fs')").valid).toBe(false);
        });

        it('should block eval() in conditions', () => {
            expect(sanitizer.sanitizeCondition('eval("bad")').valid).toBe(false);
        });

        it('should block process.exit', () => {
            expect(sanitizer.sanitizeCondition('process.exit(1)').valid).toBe(false);
        });

        it('should block fs operations', () => {
            expect(sanitizer.sanitizeCondition('fs.unlinkSync("/etc")').valid).toBe(false);
        });

        it('should reject long conditions', () => {
            expect(sanitizer.sanitizeCondition('x'.repeat(501)).valid).toBe(false);
        });
    });

    describe('sanitizeThreadId', () => {
        it('should accept valid thread IDs', () => {
            expect(sanitizer.sanitizeThreadId(1).valid).toBe(true);
        });

        it('should default to 1 when undefined', () => {
            const result = sanitizer.sanitizeThreadId(undefined);
            expect(result.valid).toBe(true);
            expect(result.value).toBe(1);
        });

        it('should coerce strings', () => {
            const result = sanitizer.sanitizeThreadId('5');
            expect(result.valid).toBe(true);
            expect(result.value).toBe(5);
        });

        it('should reject non-integer', () => {
            expect(sanitizer.sanitizeThreadId(1.5).valid).toBe(false);
        });
    });

    describe('sanitizeToolInput', () => {
        it('should validate all fields in a tool input', () => {
            const result = sanitizer.sanitizeToolInput('debug_set_breakpoint', {
                file: '/app/main.ts',
                line: 42,
                condition: 'x > 5',
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should collect multiple errors', () => {
            const result = sanitizer.sanitizeToolInput('debug_set_breakpoint', {
                file: '../../../etc/passwd',
                line: -1,
                condition: 'eval("bad")',
            });

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBe(3);
        });

        it('should collect warnings from auto-corrections', () => {
            const result = sanitizer.sanitizeToolInput('debug_evaluate', {
                expression: '  x + 1  ',
                thread_id: '1',
            });

            expect(result.valid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });
});
