/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FixSuggestionEngine } from './fixSuggestionEngine.js';
import { StackTraceAnalyzer } from './stackTraceAnalyzer.js';
import type { StackFrame, Scope, Variable, OutputEntry } from './dapClient.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFrame(overrides: Partial<StackFrame> & { name: string; line: number }): StackFrame {
    const { name, line, column, source, ...rest } = overrides;
    return {
        id: 1,
        name,
        line,
        column: column ?? 0,
        source: source ?? { path: '/home/user/app/src/main.ts' },
        ...rest,
    };
}

function makeScope(name: string, ref: number): Scope {
    return { name, variablesReference: ref, expensive: false };
}

function makeVar(name: string, value: string, type = 'string', ref = 0): Variable {
    return { name, value, type, variablesReference: ref };
}

function makeOutput(output: string, category: 'stdout' | 'stderr' = 'stderr'): OutputEntry {
    return { output, category, timestamp: Date.now() };
}

const analyzer = new StackTraceAnalyzer();

function buildContext(
    stopReason: string,
    frames: StackFrame[],
    scopes: Scope[],
    variables: Map<number, Variable[]>,
    outputLog: OutputEntry[],
) {
    const analysis = analyzer.analyze(stopReason, frames, scopes, variables, outputLog);
    return { analysis, frames, scopes, variables, outputLog, stopReason };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FixSuggestionEngine', () => {
    const engine = new FixSuggestionEngine();

    describe('pattern registration', () => {
        it('should have all 11 built-in patterns', () => {
            const patterns = engine.getPatterns();
            expect(patterns).toContain('null-reference');
            expect(patterns).toContain('type-error');
            expect(patterns).toContain('range-error');
            expect(patterns).toContain('off-by-one');
            expect(patterns).toContain('unhandled-promise');
            expect(patterns).toContain('breakpoint-context');
            expect(patterns).toContain('async-await');
            expect(patterns).toContain('import-error');
            expect(patterns).toContain('assertion-failure');
            expect(patterns).toContain('file-not-found');
            expect(patterns).toContain('connection-error');
            expect(patterns).toHaveLength(11);
        });
    });

    describe('null-reference pattern', () => {
        it('should detect Cannot read properties errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'getUser', line: 10 })],
                [makeScope('Local', 1)],
                new Map([[1, [makeVar('user', 'null', 'object')]]]),
                [makeOutput("TypeError: Cannot read properties of null (reading 'name')")],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'null-reference');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Null/Undefined Reference');
            expect(suggestion?.severity).toBe('error');
            expect(suggestion?.confidence).toBeGreaterThanOrEqual(0.9);
            expect(suggestion?.description).toContain('user');
        });

        it('should detect undefined is not a function', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'callFn', line: 5 })],
                [],
                new Map(),
                [makeOutput('TypeError: undefined is not a function')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'null-reference');
            expect(suggestion).toBeDefined();
        });
    });

    describe('type-error pattern', () => {
        it('should detect generic TypeErrors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'transform', line: 22 })],
                [],
                new Map(),
                [makeOutput('TypeError: Assignment to constant variable')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'type-error');
            expect(suggestion).toBeDefined();
            expect(suggestion?.severity).toBe('error');
        });
    });

    describe('range-error pattern', () => {
        it('should detect stack overflow with recursive frame analysis', () => {
            const frames = Array.from({ length: 20 }, () =>
                makeFrame({ name: 'fibonacci', line: 3 }),
            );

            const ctx = buildContext(
                'exception',
                frames,
                [],
                new Map(),
                [makeOutput('RangeError: Maximum call stack size exceeded')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'range-error');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toContain('Stack Overflow');
            expect(suggestion?.description).toContain('fibonacci');
            expect(suggestion?.description).toContain('base case');
        });
    });

    describe('off-by-one pattern', () => {
        it('should detect array index out of bounds', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'processItems', line: 15 })],
                [makeScope('Local', 1)],
                new Map([[1, [makeVar('i', '10', 'number'), makeVar('arr', '[...]', 'Array', 5)]]]),
                [makeOutput('RangeError: index out of range')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'off-by-one');
            expect(suggestion).toBeDefined();
            expect(suggestion?.description).toContain('i=10');
            expect(suggestion?.severity).toBe('warning');
        });
    });

    describe('unhandled-promise pattern', () => {
        it('should detect unhandled promise rejections', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'fetchData', line: 8 })],
                [],
                new Map(),
                [makeOutput('UnhandledPromiseRejectionWarning: Error: network failure')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'unhandled-promise');
            expect(suggestion).toBeDefined();
            expect(suggestion?.description).toContain('try/catch');
        });
    });

    describe('breakpoint-context pattern', () => {
        it('should provide context when stopped at breakpoint', () => {
            const ctx = buildContext(
                'breakpoint',
                [makeFrame({ name: 'sort', line: 20 })],
                [makeScope('Local', 1)],
                new Map([[1, [makeVar('arr', '[3, 1, 2]', 'Array')]]]),
                [],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'breakpoint-context');
            expect(suggestion).toBeDefined();
            expect(suggestion?.severity).toBe('info');
            expect(suggestion?.confidence).toBe(1.0);
            expect(suggestion?.description).toContain('debug_evaluate');
        });
    });

    // -----------------------------------------------------------------------
    // Enhancement 2: 5 new patterns
    // -----------------------------------------------------------------------

    describe('async-await pattern', () => {
        it('should detect async/await errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'loadData', line: 12 })],
                [],
                new Map(),
                [makeOutput('SyntaxError: await is only valid in async functions')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'async-await');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Async/Await Error');
            expect(suggestion?.description).toContain('async');
        });
    });

    describe('import-error pattern', () => {
        it('should detect missing module errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'require', line: 1 })],
                [],
                new Map(),
                [makeOutput("Error: Cannot find module 'express'")],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'import-error');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Module Import Error');
            expect(suggestion?.description).toContain('express');
            expect(suggestion?.description).toContain('npm install');
        });
    });

    describe('assertion-failure pattern', () => {
        it('should detect assertion errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'testUser', line: 45 })],
                [],
                new Map(),
                [makeOutput('AssertionError: Expected 5 to equal 3')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'assertion-failure');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Assertion Failure');
            expect(suggestion?.confidence).toBe(0.9);
        });
    });

    describe('file-not-found pattern', () => {
        it('should detect ENOENT errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'readConfig', line: 8 })],
                [],
                new Map(),
                [makeOutput("Error: ENOENT: no such file or directory, open '/app/config.json'")],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'file-not-found');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('File Not Found');
            expect(suggestion?.description).toContain('/app/config.json');
        });

        it('should detect EACCES errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'writeFile', line: 15 })],
                [],
                new Map(),
                [makeOutput("Error: EACCES: permission denied, open '/etc/passwd'")],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'file-not-found');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Permission Denied');
        });
    });

    describe('connection-error pattern', () => {
        it('should detect ECONNREFUSED errors', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'connectDB', line: 22 })],
                [],
                new Map(),
                [makeOutput('Error: connect ECONNREFUSED 127.0.0.1:5432')],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'connection-error');
            expect(suggestion).toBeDefined();
            expect(suggestion?.title).toBe('Network Connection Error');
            expect(suggestion?.description).toContain('server');
        });
    });

    // -----------------------------------------------------------------------
    // Cross-cutting tests
    // -----------------------------------------------------------------------

    describe('suggestion ordering', () => {
        it('should sort suggestions by confidence (highest first)', () => {
            const ctx = buildContext(
                'exception',
                [makeFrame({ name: 'handler', line: 1 })],
                [makeScope('Local', 1)],
                new Map([[1, [makeVar('data', 'null', 'object')]]]),
                [
                    makeOutput("TypeError: Cannot read properties of null (reading 'id')"),
                    makeOutput('UnhandledPromiseRejectionWarning: TypeError'),
                ],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            expect(result.suggestions.length).toBeGreaterThan(1);
            for (let i = 1; i < result.suggestions.length; i++) {
                expect(result.suggestions[i - 1].confidence).toBeGreaterThanOrEqual(
                    result.suggestions[i].confidence,
                );
            }
        });
    });

    describe('markdown output', () => {
        it('should produce combined markdown with analysis and suggestions', () => {
            const ctx = buildContext(
                'breakpoint',
                [makeFrame({ name: 'main', line: 1 })],
                [makeScope('Local', 1)],
                new Map([[1, [makeVar('count', '5', 'number')]]]),
                [],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            expect(result.markdown).toContain('## Debug State');
            expect(result.markdown).toContain('💡 Suggestions');
        });
    });

    describe('no suggestions scenario', () => {
        it('should return empty suggestions when no patterns match', () => {
            const ctx = buildContext(
                'step',
                [makeFrame({ name: 'incremental', line: 7 })],
                [],
                new Map(),
                [],
            );

            const result = engine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            expect(result.suggestions).toHaveLength(0);
        });
    });

    describe('custom patterns', () => {
        it('should support custom pattern matchers', () => {
            const customEngine = new FixSuggestionEngine([
                {
                    name: 'custom-check',
                    match() {
                        return {
                            title: 'Custom Check',
                            description: 'Always fires.',
                            severity: 'info',
                            pattern: 'custom-check',
                            confidence: 0.5,
                        };
                    },
                },
            ]);

            const patterns = customEngine.getPatterns();
            expect(patterns).toContain('custom-check');
            expect(patterns).toHaveLength(12); // 11 built-in + 1 custom

            const ctx = buildContext('step', [], [], new Map(), []);
            const result = customEngine.suggest(
                ctx.analysis, ctx.frames, ctx.scopes, ctx.variables, ctx.outputLog, ctx.stopReason,
            );

            const suggestion = result.suggestions.find((s) => s.pattern === 'custom-check');
            expect(suggestion).toBeDefined();
        });
    });
});
