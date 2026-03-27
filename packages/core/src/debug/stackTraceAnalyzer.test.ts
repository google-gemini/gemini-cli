/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
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
    return {
        name,
        variablesReference: ref,
        expensive: false,
    };
}

function makeVar(name: string, value: string, type = 'string', ref = 0): Variable {
    return { name, value, type, variablesReference: ref };
}

function makeOutput(output: string, category: 'stdout' | 'stderr' = 'stdout'): OutputEntry {
    return { output, category, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StackTraceAnalyzer', () => {
    const analyzer = new StackTraceAnalyzer();

    describe('buildCallStack', () => {
        it('should convert frames to FrameInfo with user code detection', () => {
            const frames: StackFrame[] = [
                makeFrame({ name: 'processData', line: 42 }),
                makeFrame({
                    name: 'express.handle',
                    line: 100,
                    source: { path: '/app/node_modules/express/lib/router.js' },
                }),
                makeFrame({
                    name: 'Module._compile',
                    line: 1,
                    source: { path: 'node:internal/modules/cjs/loader' },
                }),
            ];

            const result = analyzer.buildCallStack(frames);

            expect(result).toHaveLength(3);
            expect(result[0].isUserCode).toBe(true);
            expect(result[0].name).toBe('processData');
            expect(result[1].isUserCode).toBe(false); // node_modules
            expect(result[2].isUserCode).toBe(false); // node:internal
        });

        it('should respect MAX_CALL_STACK_DEPTH (20)', () => {
            const frames = Array.from({ length: 30 }, (_, i) =>
                makeFrame({ name: `fn${String(i)}`, line: i, id: i }),
            );
            const result = analyzer.buildCallStack(frames);
            expect(result).toHaveLength(20);
        });
    });

    describe('extractLocation', () => {
        it('should extract top frame location', () => {
            const frames: StackFrame[] = [
                makeFrame({
                    name: 'handleRequest',
                    line: 55,
                    column: 12,
                    source: { path: '/app/src/server.ts' },
                }),
            ];

            const location = analyzer.extractLocation(frames);
            expect(location).toEqual({
                file: '/app/src/server.ts',
                line: 55,
                column: 12,
                functionName: 'handleRequest',
            });
        });

        it('should return null for empty frames', () => {
            expect(analyzer.extractLocation([])).toBeNull();
        });
    });

    describe('extractVariables', () => {
        it('should extract local and closure variables, skip globals', () => {
            const scopes: Scope[] = [
                makeScope('Local', 10),
                makeScope('Closure', 20),
                makeScope('Global', 30),
            ];
            const varMap = new Map<number, Variable[]>([
                [10, [makeVar('x', '42', 'number'), makeVar('name', '"alice"', 'string')]],
                [20, [makeVar('config', '{ ... }', 'Object', 5)]],
                [30, [makeVar('console', '[Console]', 'Object')]],
            ]);

            const result = analyzer.extractVariables(scopes, varMap);
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('x');
            expect(result[1].name).toBe('name');
            expect(result[2].name).toBe('config');
            expect(result[2].expandable).toBe(true);
        });
    });

    describe('extractRecentOutput', () => {
        it('should filter and format recent output', () => {
            const log: OutputEntry[] = [
                makeOutput('Server started on port 3000'),
                makeOutput('Error: connection refused\n', 'stderr'),
                makeOutput('', 'stdout'), // empty — should be filtered
            ];

            const result = analyzer.extractRecentOutput(log);
            expect(result).toHaveLength(2);
            expect(result[0]).toBe('Server started on port 3000');
            expect(result[1]).toBe('[stderr] Error: connection refused');
        });

        it('should limit to MAX_RECENT_OUTPUT_LINES (20)', () => {
            const log = Array.from({ length: 30 }, (_, i) =>
                makeOutput(`line ${String(i)}`),
            );
            const result = analyzer.extractRecentOutput(log);
            expect(result).toHaveLength(20);
        });
    });

    describe('buildSummary', () => {
        it('should generate breakpoint summary', () => {
            const location = {
                file: '/app/src/main.ts',
                line: 42,
                functionName: 'process',
            };
            const callStack = [
                { index: 0, name: 'process', file: '/app/src/main.ts', line: 42, isUserCode: true },
            ];

            const summary = analyzer.buildSummary('breakpoint', location, callStack);
            expect(summary).toContain('Hit breakpoint');
            expect(summary).toContain('process');
            expect(summary).toContain('42');
        });

        it('should handle exception stop reason', () => {
            const summary = analyzer.buildSummary('exception', null, []);
            expect(summary).toContain('Exception thrown');
        });

        it('should handle unknown stop reasons', () => {
            const summary = analyzer.buildSummary('custom-reason', null, []);
            expect(summary).toContain('custom-reason');
        });
    });

    describe('analyze', () => {
        it('should produce a complete DebugAnalysis with markdown', () => {
            const frames: StackFrame[] = [
                makeFrame({
                    name: 'calculateTotal',
                    line: 15,
                    source: { path: '/app/src/cart.ts' },
                }),
            ];
            const scopes: Scope[] = [makeScope('Local', 10)];
            const variables = new Map<number, Variable[]>([
                [10, [makeVar('items', '[1, 2, 3]', 'Array', 5)]],
            ]);
            const output: OutputEntry[] = [makeOutput('Processing cart...')];

            const result = analyzer.analyze('breakpoint', frames, scopes, variables, output);

            expect(result.summary).toContain('breakpoint');
            expect(result.location).not.toBeNull();
            expect(result.location?.functionName).toBe('calculateTotal');
            expect(result.callStack).toHaveLength(1);
            expect(result.localVariables).toHaveLength(1);
            expect(result.recentOutput).toHaveLength(1);
            expect(result.markdown).toContain('## Debug State');
            expect(result.markdown).toContain('### Call Stack');
            expect(result.markdown).toContain('### Local Variables');
            expect(result.markdown).toContain('### Recent Output');
        });
    });

    describe('utility methods', () => {
        it('isUserCode should detect internal paths', () => {
            expect(analyzer.isUserCode('/app/src/main.ts')).toBe(true);
            expect(analyzer.isUserCode('/app/node_modules/express/index.js')).toBe(false);
            expect(analyzer.isUserCode('node:internal/modules/cjs/loader')).toBe(false);
            expect(analyzer.isUserCode('<anonymous>')).toBe(false);
        });

        it('truncateValue should truncate long values', () => {
            const short = 'hello';
            expect(analyzer.truncateValue(short)).toBe('hello');

            const long = 'x'.repeat(300);
            const result = analyzer.truncateValue(long);
            expect(result.length).toBeLessThan(300);
            expect(result).toContain('truncated');
        });

        it('shortPath should shorten long paths', () => {
            expect(analyzer.shortPath('/a/b/c/d/e.ts')).toBe('.../c/d/e.ts');
            expect(analyzer.shortPath('a/b.ts')).toBe('a/b.ts');
        });
    });

    describe('toMarkdown', () => {
        it('should show truncation notice when frames exceed display limit', () => {
            const frames = Array.from({ length: 25 }, (_, i) =>
                makeFrame({ name: `fn${String(i)}`, line: i, id: i }),
            );
            const result = analyzer.analyze('step', frames, [], new Map(), []);
            expect(result.markdown).toContain('and 5 more frames');
        });
    });
});
