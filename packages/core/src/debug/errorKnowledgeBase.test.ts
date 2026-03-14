/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ErrorKnowledgeBase } from './errorKnowledgeBase.js';

describe('ErrorKnowledgeBase', () => {
    const kb = new ErrorKnowledgeBase();

    describe('lookup', () => {
        it('should find entries matching null property access', () => {
            const matches = kb.lookup("TypeError: Cannot read properties of null (reading 'name')");
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].id).toBe('null-property-access');
        });

        it('should find entries matching ReferenceError', () => {
            const matches = kb.lookup('ReferenceError: x is not defined');
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].id).toBe('undefined-variable');
        });

        it('should find entries matching Python AttributeError', () => {
            const matches = kb.lookup("AttributeError: 'NoneType' object has no attribute 'name'");
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].id).toBe('python-attribute-error');
        });

        it('should find entries matching Go nil pointer', () => {
            const matches = kb.lookup('runtime error: invalid memory address or nil pointer dereference');
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].id).toBe('go-nil-pointer');
        });

        it('should find ECONNREFUSED', () => {
            const matches = kb.lookup('connect ECONNREFUSED 127.0.0.1:3000');
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].id).toBe('connection-refused');
        });

        it('should return empty for unrecognized errors', () => {
            const matches = kb.lookup('some random string');
            expect(matches).toHaveLength(0);
        });
    });

    describe('getById', () => {
        it('should find entry by ID', () => {
            expect(kb.getById('null-property-access')).toBeDefined();
            expect(kb.getById('go-nil-pointer')).toBeDefined();
        });

        it('should return undefined for unknown ID', () => {
            expect(kb.getById('nonexistent')).toBeUndefined();
        });
    });

    describe('getByLanguage', () => {
        it('should filter by Python', () => {
            const entries = kb.getByLanguage('python');
            expect(entries.length).toBeGreaterThan(0);
            for (const e of entries) {
                expect(['python', 'all']).toContain(e.language);
            }
        });

        it('should include "all" language entries', () => {
            const jsEntries = kb.getByLanguage('javascript');
            const allEntries = kb.getAll().filter((e) => e.language === 'all');
            for (const allEntry of allEntries) {
                expect(jsEntries).toContainEqual(allEntry);
            }
        });
    });

    describe('add', () => {
        it('should support custom entries', () => {
            const custom = new ErrorKnowledgeBase();
            const before = custom.getAll().length;
            custom.add({
                id: 'custom-error',
                title: 'Custom Error',
                language: 'javascript',
                errorPatterns: [/CustomError/],
                explanation: 'A custom error.',
                rootCause: 'Custom cause.',
                fixSteps: ['Fix it.'],
                relatedErrors: [],
            });
            expect(custom.getAll().length).toBe(before + 1);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with explanations and code examples', () => {
            const entries = kb.lookup("TypeError: Cannot read properties of null (reading 'name')");
            const markdown = kb.toMarkdown(entries);

            expect(markdown).toContain('Error Knowledge Base');
            expect(markdown).toContain('Root cause');
            expect(markdown).toContain('Fix steps');
            expect(markdown).toContain('Before');
            expect(markdown).toContain('After');
        });

        it('should return empty for no entries', () => {
            expect(kb.toMarkdown([])).toBe('');
        });
    });
});
