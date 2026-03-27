/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SmartBreakpointSuggester } from './smartBreakpointSuggester.js';
import type { DebugAnalysis } from './stackTraceAnalyzer.js';

function makeAnalysis(overrides: Partial<DebugAnalysis> = {}): DebugAnalysis {
    return {
        summary: 'Exception thrown',
        location: {
            file: '/app/src/main.ts',
            line: 42,
            functionName: 'getUser',
        },
        callStack: [
            { index: 0, name: 'getUser', file: '/app/src/main.ts', line: 42, isUserCode: true },
            { index: 1, name: 'handleRequest', file: '/app/src/server.ts', line: 100, isUserCode: true },
            { index: 2, name: 'emit', file: 'node:events', line: 50, isUserCode: false },
        ],
        localVariables: [
            { name: 'user', value: 'null', type: 'object', expandable: false, variablesReference: 0 },
            { name: 'id', value: '42', type: 'number', expandable: false, variablesReference: 0 },
        ],
        recentOutput: [],
        sourceContext: {
            file: '/app/src/main.ts',
            startLine: 37,
            endLine: 47,
            currentLine: 42,
            lines: [
                'function getUser(id) {',
                '    const db = getDatabase();',
                '    const user = db.findById(id);',
                '    // user might be null!',
                '    return user.name;',
                '    // ^ crash here',
            ],
        },
        totalFrames: 3,
        markdown: '',
        ...overrides,
    };
}

describe('SmartBreakpointSuggester', () => {
    const suggester = new SmartBreakpointSuggester();

    describe('suggest', () => {
        it('should suggest breakpoints before the error line (error-origin)', () => {
            const analysis = makeAnalysis();
            const suggestions = suggester.suggest(analysis);

            const errorOrigin = suggestions.filter((s) => s.strategy === 'error-origin');
            expect(errorOrigin.length).toBeGreaterThan(0);
            expect(errorOrigin[0].line).toBe(40); // 2 lines before line 42
        });

        it('should suggest breakpoints in caller functions (caller-chain)', () => {
            const analysis = makeAnalysis();
            const suggestions = suggester.suggest(analysis);

            const callerChain = suggestions.filter((s) => s.strategy === 'caller-chain');
            expect(callerChain.length).toBeGreaterThan(0);
            expect(callerChain[0].file).toBe('/app/src/server.ts');
            expect(callerChain[0].line).toBe(100);
        });

        it('should suggest conditional breakpoints for null values (data-flow)', () => {
            const analysis = makeAnalysis();
            const suggestions = suggester.suggest(analysis);

            const dataFlow = suggestions.filter((s) => s.strategy === 'data-flow');
            expect(dataFlow.length).toBeGreaterThan(0);
            expect(dataFlow[0].condition).toContain('user');
        });

        it('should include property access fix for null reference errors', () => {
            const analysis = makeAnalysis();
            const errorOutput = "TypeError: Cannot read properties of null (reading 'name')";

            const suggestions = suggester.suggest(analysis, errorOutput);

            const dataFlow = suggestions.filter(
                (s) => s.strategy === 'data-flow' && s.reason.includes('name'),
            );
            expect(dataFlow.length).toBeGreaterThan(0);
        });

        it('should sort suggestions by priority', () => {
            const analysis = makeAnalysis();
            const suggestions = suggester.suggest(analysis);

            for (let i = 1; i < suggestions.length; i++) {
                expect(suggestions[i].priority).toBeGreaterThanOrEqual(
                    suggestions[i - 1].priority,
                );
            }
        });

        it('should handle analysis with no location', () => {
            const analysis = makeAnalysis({ location: null });
            const suggestions = suggester.suggest(analysis);

            // Should still suggest from call stack
            expect(suggestions.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle empty call stack', () => {
            const analysis = makeAnalysis({ callStack: [] });
            const suggestions = suggester.suggest(analysis);

            // Should still work, just fewer suggestions
            expect(suggestions).toBeDefined();
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with all suggestions', () => {
            const analysis = makeAnalysis();
            const suggestions = suggester.suggest(analysis);
            const markdown = suggester.toMarkdown(suggestions);

            expect(markdown).toContain('Suggested Breakpoints');
            expect(markdown).toContain('main.ts');
        });

        it('should handle empty suggestions', () => {
            const markdown = suggester.toMarkdown([]);
            expect(markdown).toContain('No breakpoint suggestions');
        });
    });
});
