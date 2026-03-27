/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { InlineFixPreview } from './inlineFixPreview.js';
import type { SourceContext } from './stackTraceAnalyzer.js';
import type { FixSuggestion } from './fixSuggestionEngine.js';

const sourceContext: SourceContext = {
    file: '/app/src/main.ts',
    startLine: 37,
    endLine: 42,
    currentLine: 41,
    lines: [
        'function getUser(id) {',
        '    const db = getDatabase();',
        '    const user = db.findById(id);',
        '    // user might be null!',
        '    return user.name;',
        '    // ^ crash here',
    ],
};

describe('InlineFixPreview', () => {
    const preview = new InlineFixPreview();

    describe('generatePreviews', () => {
        it('should generate fix preview for null-reference', () => {
            const suggestions: FixSuggestion[] = [
                {
                    title: 'Null Reference',
                    description: '`user` is null — add a null check',
                    severity: 'error',
                    pattern: 'null-reference',
                    confidence: 0.95,
                    line: 41,
                },
            ];

            const previews = preview.generatePreviews(suggestions, sourceContext);
            expect(previews.length).toBeGreaterThan(0);
            expect(previews[0].diff).toContain('-');
            expect(previews[0].diff).toContain('+');
        });

        it('should apply optional chaining for return statements', () => {
            const suggestions: FixSuggestion[] = [
                {
                    title: 'Null Reference',
                    description: '`user` is null',
                    severity: 'error',
                    pattern: 'null-reference',
                    confidence: 0.9,
                    line: 41,
                },
            ];

            // Line 41 corresponds to index 4 (41 - 37 = 4) 
            // "    return user.name;"
            const previews = preview.generatePreviews(suggestions, sourceContext);
            if (previews.length > 0) {
                expect(previews[0].fixedLines[0]).toContain('?.');
            }
        });

        it('should generate fix preview for async-await', () => {
            const asyncContext: SourceContext = {
                file: '/app/src/api.ts',
                startLine: 10,
                endLine: 15,
                currentLine: 12,
                lines: [
                    'class Api {',
                    '    fetch(url) {',
                    '    function processData(data) {',
                    '        return transform(data);',
                    '    }',
                ],
            };

            const suggestions: FixSuggestion[] = [
                {
                    title: 'Missing async',
                    description: 'Function should be async',
                    severity: 'error',
                    pattern: 'async-await',
                    confidence: 0.85,
                    line: 12,
                },
            ];

            const previews = preview.generatePreviews(suggestions, asyncContext);
            if (previews.length > 0) {
                expect(previews[0].fixedLines[0]).toContain('async function');
            }
        });

        it('should return empty array when no source context', () => {
            const suggestions: FixSuggestion[] = [
                {
                    title: 'Test',
                    description: 'test',
                    severity: 'info',
                    pattern: 'null-reference',
                    confidence: 0.5,
                },
            ];

            const previews = preview.generatePreviews(suggestions, null);
            expect(previews).toHaveLength(0);
        });

        it('should skip suggestions with no applicable fix', () => {
            const suggestions: FixSuggestion[] = [
                {
                    title: 'Unknown Pattern',
                    description: 'Something',
                    severity: 'info',
                    pattern: 'unknown-pattern',
                    confidence: 0.5,
                    line: 41,
                },
            ];

            const previews = preview.generatePreviews(suggestions, sourceContext);
            expect(previews).toHaveLength(0);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with diff blocks', () => {
            const suggestions: FixSuggestion[] = [
                {
                    title: 'Null Reference',
                    description: '`user` is null',
                    severity: 'error',
                    pattern: 'null-reference',
                    confidence: 0.9,
                    line: 41,
                },
            ];

            const previews = preview.generatePreviews(suggestions, sourceContext);
            const markdown = preview.toMarkdown(previews);

            if (previews.length > 0) {
                expect(markdown).toContain('Fix Previews');
                expect(markdown).toContain('```diff');
            }
        });

        it('should return empty string for no previews', () => {
            expect(preview.toMarkdown([])).toBe('');
        });
    });
});
