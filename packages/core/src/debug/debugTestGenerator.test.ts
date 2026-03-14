/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugTestGenerator } from './debugTestGenerator.js';
import type { DebugAnalysis } from './stackTraceAnalyzer.js';
import type { FixSuggestion } from './fixSuggestionEngine.js';

function makeAnalysis(overrides: Partial<DebugAnalysis> = {}): DebugAnalysis {
    return {
        summary: 'Exception thrown',
        location: {
            file: '/app/src/main.ts',
            line: 42,
            functionName: 'getUser',
        },
        callStack: [],
        localVariables: [],
        recentOutput: [],
        sourceContext: null,
        totalFrames: 1,
        markdown: '',
        ...overrides,
    };
}

describe('DebugTestGenerator', () => {
    const generator = new DebugTestGenerator();

    describe('generate', () => {
        it('should generate null-reference regression test', () => {
            const suggestions: FixSuggestion[] = [{
                title: 'Null Reference',
                description: '`user` is null or undefined',
                severity: 'error',
                pattern: 'null-reference',
                confidence: 0.95,
            }];

            const tests = generator.generate(makeAnalysis(), suggestions);
            expect(tests.length).toBeGreaterThan(0);
            expect(tests[0].code).toContain('getUser');
            expect(tests[0].code).toContain('null');
            expect(tests[0].framework).toBe('vitest');
        });

        it('should generate async-await regression test', () => {
            const suggestions: FixSuggestion[] = [{
                title: 'Missing Await',
                description: 'Missing await keyword',
                severity: 'error',
                pattern: 'async-await',
                confidence: 0.85,
            }];

            const tests = generator.generate(makeAnalysis(), suggestions);
            expect(tests.length).toBeGreaterThan(0);
            expect(tests[0].code).toContain('async');
            expect(tests[0].code).toContain('await');
        });

        it('should generate pytest for Python files', () => {
            const analysis = makeAnalysis({
                location: {
                    file: '/app/src/main.py',
                    line: 10,
                    functionName: 'get_user',
                },
            });
            const suggestions: FixSuggestion[] = [{
                title: 'None Reference',
                description: '`user` is None',
                severity: 'error',
                pattern: 'null-reference',
                confidence: 0.9,
            }];

            const tests = generator.generate(analysis, suggestions);
            expect(tests.length).toBeGreaterThan(0);
            expect(tests[0].framework).toBe('pytest');
            expect(tests[0].code).toContain('def test_');
            expect(tests[0].suggestedPath).toContain('_test.py');
        });

        it('should handle generic patterns', () => {
            const suggestions: FixSuggestion[] = [{
                title: 'Unknown Issue',
                description: 'Something went wrong',
                severity: 'warning',
                pattern: 'connection-error',
                confidence: 0.7,
            }];

            const tests = generator.generate(makeAnalysis(), suggestions);
            expect(tests.length).toBeGreaterThan(0);
            expect(tests[0].code).toContain('connection-error');
        });

        it('should return empty for no location', () => {
            const analysis = makeAnalysis({ location: null });
            const tests = generator.generate(analysis, []);
            expect(tests).toHaveLength(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with test code', () => {
            const suggestions: FixSuggestion[] = [{
                title: 'Null Reference',
                description: '`user` is null',
                severity: 'error',
                pattern: 'null-reference',
                confidence: 0.9,
            }];

            const tests = generator.generate(makeAnalysis(), suggestions);
            const markdown = generator.toMarkdown(tests);

            expect(markdown).toContain('Regression Tests');
            expect(markdown).toContain('```');
        });

        it('should return empty for no tests', () => {
            expect(generator.toMarkdown([])).toBe('');
        });
    });
});
