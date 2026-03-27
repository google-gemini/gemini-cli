/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugWorkflowOrchestrator } from './debugWorkflowOrchestrator.js';

describe('DebugWorkflowOrchestrator', () => {
    const orchestrator = new DebugWorkflowOrchestrator();

    describe('planDiagnosis', () => {
        it('should generate a plan for a JavaScript file', () => {
            const plan = orchestrator.planDiagnosis({
                program: 'src/app.js',
            });

            expect(plan).toContain('Debug Plan');
            expect(plan).toContain('app.js');
            expect(plan).toContain('Node.js Inspector');
            expect(plan).toContain('exception breakpoints');
        });

        it('should generate a plan for a Python file', () => {
            const plan = orchestrator.planDiagnosis({
                program: 'script.py',
            });

            expect(plan).toContain('debugpy');
        });

        it('should include breakpoints in the plan when specified', () => {
            const plan = orchestrator.planDiagnosis({
                program: 'app.js',
                breakpoints: [
                    { file: 'src/main.js', line: 42 },
                    { file: 'src/utils.js', line: 10 },
                ],
            });

            expect(plan).toContain('2 breakpoint(s)');
            expect(plan).toContain('src/main.js:42');
            expect(plan).toContain('src/utils.js:10');
        });

        it('should handle unknown languages gracefully', () => {
            const plan = orchestrator.planDiagnosis({
                program: 'app.rs',
            });

            expect(plan).toContain('Unknown');
        });

        it('should allow explicit language override', () => {
            const plan = orchestrator.planDiagnosis({
                program: 'app',
                language: 'python',
            });

            expect(plan).toContain('debugpy');
        });
    });

    describe('buildReport', () => {
        it('should generate a comprehensive diagnostic report', () => {
            const analysis = {
                summary: 'Exception thrown in `getUser` at src/main.ts:10',
                location: {
                    file: '/app/src/main.ts',
                    line: 10,
                    functionName: 'getUser',
                },
                callStack: [
                    {
                        index: 0,
                        name: 'getUser',
                        file: '/app/src/main.ts',
                        line: 10,
                        isUserCode: true,
                    },
                ],
                localVariables: [
                    {
                        name: 'user',
                        value: 'null',
                        type: 'object',
                        expandable: false,
                        variablesReference: 0,
                    },
                ],
                recentOutput: ['TypeError: Cannot read properties of null'],
                sourceContext: null,
                totalFrames: 1,
                markdown: '## Debug State: Exception thrown',
            };

            const suggestions = {
                analysis,
                suggestions: [
                    {
                        title: 'Null Reference',
                        description: '**Error**: user is null',
                        severity: 'error' as const,
                        pattern: 'null-reference',
                        confidence: 0.95,
                    },
                ],
                markdown:
                    '## Debug State\n\n### 💡 Suggestions\n\n**Null Reference** (95%)',
            };

            const report = orchestrator.buildReport(
                'analyze-stopped',
                analysis,
                suggestions,
                6,
                150,
            );

            expect(report).toContain('Diagnostic Report');
            expect(report).toContain('analyze-stopped');
            expect(report).toContain('6');
            expect(report).toContain('150ms');
            expect(report).toContain('Recommended Actions');
            expect(report).toContain('Null Reference');
            expect(report).toContain('Next Steps');
            expect(report).toContain('debug_evaluate');
        });

        it('should handle empty suggestions', () => {
            const analysis = {
                summary: 'Stepped in `main` at src/app.ts:1',
                location: null,
                callStack: [],
                localVariables: [],
                recentOutput: [],
                sourceContext: null,
                totalFrames: 0,
                markdown: '## Debug State: Stepped',
            };

            const suggestions = {
                analysis,
                suggestions: [] as Array<{ title: string; description: string; severity: 'error' | 'warning' | 'info'; pattern: string; confidence: number }>,
                markdown: '## Debug State\n\nNo suggestions.',
            };

            const report = orchestrator.buildReport(
                'analyze-stopped',
                analysis,
                suggestions,
                3,
                50,
            );

            expect(report).toContain('Diagnostic Report');
            expect(report).not.toContain('Recommended Actions');
        });
    });

    describe('getAdapterRegistry', () => {
        it('should expose the adapter registry for external use', () => {
            const registry = orchestrator.getAdapterRegistry();
            expect(registry).toBeDefined();
            expect(registry.getLanguages()).toContain('javascript');
            expect(registry.getLanguages()).toContain('python');
            expect(registry.getLanguages()).toContain('go');
        });
    });
});
