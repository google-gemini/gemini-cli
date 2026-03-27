/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootCauseAnalyzer, RootCauseType } from './rootCauseAnalyzer.js';
import type { ExceptionInfo } from './rootCauseAnalyzer.js';

describe('RootCauseAnalyzer', () => {
    let analyzer: RootCauseAnalyzer;

    beforeEach(() => {
        analyzer = new RootCauseAnalyzer();
    });

    describe('TypeError: Cannot read property of undefined', () => {
        const exception: ExceptionInfo = {
            type: 'TypeError',
            message: "Cannot read properties of undefined (reading 'name')",
            frames: [
                { function: 'handleRequest', file: '/app/src/handler.ts', line: 42, column: 18 },
                { function: 'processRequest', file: '/app/src/server.ts', line: 88 },
                { function: 'onConnection', file: '/app/src/server.ts', line: 15 },
            ],
            variables: { user: 'undefined' },
        };

        it('should generate null reference hypothesis', () => {
            const result = analyzer.analyze(exception);
            expect(result.hypotheses.length).toBeGreaterThanOrEqual(1);

            const top = result.hypotheses[0];
            expect(top.type).toBe(RootCauseType.NullReference);
            expect(top.confidence).toBeGreaterThanOrEqual(0.5);
            expect(top.location?.file).toBe('/app/src/handler.ts');
            expect(top.location?.line).toBe(42);
        });

        it('should suggest checking caller', () => {
            const result = analyzer.analyze(exception);
            const callerHypothesis = result.hypotheses.find(
                (h) => h.type === RootCauseType.MissingNullCheck,
            );
            expect(callerHypothesis).toBeDefined();
            expect(callerHypothesis!.description).toContain('processRequest');
        });

        it('should generate next steps', () => {
            const result = analyzer.analyze(exception);
            expect(result.nextSteps.length).toBeGreaterThan(0);
            expect(result.nextSteps[0]).toContain('breakpoint');
        });
    });

    describe('TypeError: X is not a function', () => {
        const exception: ExceptionInfo = {
            type: 'TypeError',
            message: 'db.query is not a function',
            frames: [
                { function: 'getUser', file: '/app/src/db.ts', line: 15 },
                { function: 'handleRequest', file: '/app/src/handler.ts', line: 30 },
            ],
        };

        it('should generate type mismatch hypothesis', () => {
            const result = analyzer.analyze(exception);
            const typeMismatch = result.hypotheses.find(
                (h) => h.type === RootCauseType.TypeMismatch,
            );
            expect(typeMismatch).toBeDefined();
            expect(typeMismatch!.description).toContain('db.query');
        });

        it('should suggest import/export mismatch', () => {
            const result = analyzer.analyze(exception);
            const configHypothesis = result.hypotheses.find(
                (h) => h.type === RootCauseType.ConfigurationError,
            );
            expect(configHypothesis).toBeDefined();
            expect(configHypothesis!.evidence.some((e) => e.includes('CommonJS'))).toBe(true);
        });
    });

    describe('ReferenceError: X is not defined', () => {
        const exception: ExceptionInfo = {
            type: 'ReferenceError',
            message: 'config is not defined',
            frames: [
                { function: 'initialize', file: '/app/src/init.ts', line: 5 },
            ],
        };

        it('should generate undefined variable hypothesis', () => {
            const result = analyzer.analyze(exception);
            expect(result.hypotheses[0].type).toBe(RootCauseType.UndefinedVariable);
            expect(result.hypotheses[0].confidence).toBe(0.8);
            expect(result.hypotheses[0].description).toContain('config');
        });

        it('should suggest checking imports', () => {
            const result = analyzer.analyze(exception);
            expect(result.nextSteps.some((s) => s.includes('import'))).toBe(true);
        });
    });

    describe('RangeError: Maximum call stack size exceeded', () => {
        const exception: ExceptionInfo = {
            type: 'RangeError',
            message: 'Maximum call stack size exceeded',
            frames: [
                { function: 'fibonacci', file: '/app/src/math.ts', line: 10 },
                { function: 'fibonacci', file: '/app/src/math.ts', line: 12 },
                { function: 'fibonacci', file: '/app/src/math.ts', line: 12 },
                { function: 'fibonacci', file: '/app/src/math.ts', line: 12 },
                { function: 'fibonacci', file: '/app/src/math.ts', line: 12 },
                { function: 'main', file: '/app/src/index.ts', line: 5 },
            ],
        };

        it('should detect infinite recursion', () => {
            const result = analyzer.analyze(exception);
            expect(result.hypotheses[0].confidence).toBe(0.9);
            expect(result.hypotheses[0].description).toContain('fibonacci');
            expect(result.hypotheses[0].description).toContain('recursion');
        });

        it('should suggest adding base case', () => {
            const result = analyzer.analyze(exception);
            expect(result.hypotheses[0].suggestedFix).toContain('base case');
        });
    });

    describe('RangeError: Index out of range', () => {
        const exception: ExceptionInfo = {
            type: 'RangeError',
            message: 'Index out of range: index 10, length 5',
            frames: [
                { function: 'processItems', file: '/app/src/process.ts', line: 25 },
            ],
        };

        it('should detect boundary violation', () => {
            const result = analyzer.analyze(exception);
            expect(result.hypotheses[0].type).toBe(RootCauseType.BoundaryViolation);
            expect(result.hypotheses[0].suggestedFix).toContain('bounds');
        });
    });

    describe('async race condition detection', () => {
        const exception: ExceptionInfo = {
            type: 'TypeError',
            message: "Cannot read property 'data' of null",
            frames: [
                { function: 'async handleRequest', file: '/app/src/handler.ts', line: 42 },
                { function: 'Promise.resolve', file: 'internal', line: 0 },
            ],
        };

        it('should detect possible async race condition', () => {
            const result = analyzer.analyze(exception);
            const asyncHypothesis = result.hypotheses.find(
                (h) => h.type === RootCauseType.AsyncRace,
            );
            expect(asyncHypothesis).toBeDefined();
            expect(asyncHypothesis!.suggestedFix).toContain('await');
        });
    });

    describe('unknown errors', () => {
        it('should handle unrecognized errors', () => {
            const exception: ExceptionInfo = {
                type: 'CustomError',
                message: 'Something completely custom happened',
                frames: [{ function: 'foo', file: '/app/src/bar.ts', line: 1 }],
            };

            const result = analyzer.analyze(exception);
            expect(result.hypotheses.length).toBeGreaterThanOrEqual(1);
            expect(result.hypotheses[0].type).toBe(RootCauseType.Unknown);
        });
    });

    describe('findSimilar', () => {
        it('should find previously analyzed similar exceptions', () => {
            const ex: ExceptionInfo = {
                type: 'TypeError',
                message: "Cannot read property 'x' of undefined",
                frames: [{ function: 'f', file: 'a.ts', line: 1 }],
            };

            analyzer.analyze(ex);
            analyzer.analyze(ex);

            const similar = analyzer.findSimilar(ex);
            expect(similar).toHaveLength(2);
        });
    });

    describe('detectRecurring', () => {
        it('should detect recurring exceptions', () => {
            const ex: ExceptionInfo = {
                type: 'TypeError',
                message: "Cannot read property 'x' of undefined",
                frames: [{ function: 'f', file: 'a.ts', line: 1 }],
            };

            analyzer.analyze(ex);
            analyzer.analyze(ex);
            analyzer.analyze(ex);

            const recurring = analyzer.detectRecurring();
            expect(recurring.size).toBe(1);
            expect([...recurring.values()][0]).toBe(3);
        });
    });

    describe('toMarkdown', () => {
        it('should generate analysis report', () => {
            const ex: ExceptionInfo = {
                type: 'TypeError',
                message: "Cannot read property 'name' of undefined",
                frames: [
                    { function: 'handleRequest', file: '/app/handler.ts', line: 42 },
                    { function: 'processRequest', file: '/app/server.ts', line: 88 },
                ],
            };

            const result = analyzer.analyze(ex);
            const md = analyzer.toMarkdown(result);

            expect(md).toContain('Root Cause Analysis');
            expect(md).toContain('TypeError');
            expect(md).toContain('Hypotheses');
            expect(md).toContain('confidence');
            expect(md).toContain('Next Steps');
        });
    });

    describe('clear', () => {
        it('should clear history', () => {
            const ex: ExceptionInfo = {
                type: 'Error',
                message: 'test',
                frames: [],
            };
            analyzer.analyze(ex);
            analyzer.clear();
            expect(analyzer.getHistory()).toHaveLength(0);
        });
    });
});
