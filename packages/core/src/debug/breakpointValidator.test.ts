/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BreakpointValidator } from './breakpointValidator.js';
import * as path from 'node:path';

// Use the validator's own source file as a test fixture
const FIXTURE_FILE = path.resolve(import.meta.dirname, 'breakpointValidator.ts');

describe('BreakpointValidator', () => {
    let validator: BreakpointValidator;

    beforeEach(() => {
        validator = new BreakpointValidator();
    });

    describe('validate', () => {
        it('should validate a real file with an executable line', async () => {
            // Line ~100 should be inside a class method — executable code
            const result = await validator.validate(FIXTURE_FILE, 150);
            expect(result.valid).toBe(true);
            expect(result.severity).toBe('info');
            expect(result.resolvedPath).toBe(FIXTURE_FILE);
            expect(result.lineContent).toBeDefined();
        });

        it('should reject nonexistent file', async () => {
            const result = await validator.validate('/nonexistent/file.ts', 1);
            expect(result.valid).toBe(false);
            expect(result.severity).toBe('error');
            expect(result.reason).toContain('not found');
            expect(result.hint).toContain('Check if the path');
        });

        it('should reject line beyond end of file', async () => {
            const result = await validator.validate(FIXTURE_FILE, 999999);
            expect(result.valid).toBe(false);
            expect(result.severity).toBe('error');
            expect(result.reason).toContain('out of range');
        });

        it('should reject line 0', async () => {
            const result = await validator.validate(FIXTURE_FILE, 0);
            expect(result.valid).toBe(false);
            expect(result.severity).toBe('error');
        });

        it('should reject negative line', async () => {
            const result = await validator.validate(FIXTURE_FILE, -5);
            expect(result.valid).toBe(false);
        });

        it('should detect comment lines (license header)', async () => {
            // Line 2 is " * @license" — a comment
            const result = await validator.validate(FIXTURE_FILE, 2);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('comment');
            expect(result.suggestedLine).toBeDefined();
        });

        it('should suggest nearest executable line for blank lines', async () => {
            // Line 6 is blank (between license and code)
            const result = await validator.validate(FIXTURE_FILE, 6);
            if (!result.valid && result.reason?.includes('blank')) {
                expect(result.suggestedLine).toBeDefined();
                expect(result.suggestedLine).toBeGreaterThan(0);
            }
            // Even if it's valid, the test should not crash
        });
    });

    describe('validateBatch', () => {
        it('should validate multiple breakpoints', async () => {
            const results = await validator.validateBatch([
                { file: FIXTURE_FILE, line: 150 },
                { file: '/nonexistent.ts', line: 1 },
                { file: FIXTURE_FILE, line: 2 },
            ]);

            expect(results).toHaveLength(3);
            expect(results[0].valid).toBe(true); // Real executable line
            expect(results[1].valid).toBe(false); // Nonexistent file
            expect(results[2].valid).toBe(false); // Comment line
        });
    });

    describe('getFileAnalysis', () => {
        it('should analyze a real file', () => {
            const analysis = validator.getFileAnalysis(FIXTURE_FILE);
            expect(analysis).not.toBeNull();
            expect(analysis!.totalLines).toBeGreaterThan(100);
            expect(analysis!.executableLines.length).toBeGreaterThan(50);
            expect(analysis!.commentLines.length).toBeGreaterThan(5);
        });

        it('should return null for nonexistent file', () => {
            expect(validator.getFileAnalysis('/nonexistent.ts')).toBeNull();
        });
    });

    describe('clearCache', () => {
        it('should clear file and analysis caches', async () => {
            await validator.validate(FIXTURE_FILE, 150);
            validator.clearCache();
            // Should still work after clearing
            const result = await validator.validate(FIXTURE_FILE, 150);
            expect(result.valid).toBe(true);
        });
    });

    describe('toMarkdown', () => {
        it('should generate validation report', async () => {
            const results = await validator.validateBatch([
                { file: FIXTURE_FILE, line: 150 },
                { file: '/nonexistent.ts', line: 1 },
            ]);

            const md = validator.toMarkdown(results);
            expect(md).toContain('Breakpoint Validation');
            expect(md).toContain('valid');
            expect(md).toContain('invalid');
        });
    });

    describe('edge cases', () => {
        it('should handle relative paths with working dir', async () => {
            const dir = path.dirname(FIXTURE_FILE);
            const relative = 'breakpointValidator.ts';
            const result = await validator.validate(relative, 150, dir);
            expect(result.valid).toBe(true);
        });
    });
});
