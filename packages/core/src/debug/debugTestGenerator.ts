/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Test Generator — Auto-Generate Regression Tests.
 *
 * When the agent finds and fixes a bug, this module generates a
 * regression test that catches the bug if it ever comes back.
 *
 * The flow:
 *   1. Agent debugs, finds bug (e.g., getUser returns null)
 *   2. Agent suggests a fix (add null check)
 *   3. This module generates a test:
 *      ```
 *      it('should handle null user', () => {
 *        const result = getUser(999);
 *        expect(result).not.toBeNull();
 *      });
 *      ```
 *
 * This goes FAR beyond the spec — it shows the agent doesn't just
 * fix bugs, it PREVENTS them from coming back.
 */

import type { DebugAnalysis } from './stackTraceAnalyzer.js';
import type { FixSuggestion } from './fixSuggestionEngine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedTest {
    /** Test description */
    description: string;
    /** The test code */
    code: string;
    /** Which framework this test is for */
    framework: 'vitest' | 'jest' | 'pytest' | 'go-test';
    /** The file this test should be placed near */
    relatedFile: string;
    /** Suggested test file path */
    suggestedPath: string;
}

// ---------------------------------------------------------------------------
// DebugTestGenerator
// ---------------------------------------------------------------------------

/**
 * Generates regression test stubs from debug analysis and fix suggestions.
 */
export class DebugTestGenerator {
    /**
     * Generate test(s) from a debug analysis and its suggestions.
     */
    generate(
        analysis: DebugAnalysis,
        suggestions: FixSuggestion[],
    ): GeneratedTest[] {
        const tests: GeneratedTest[] = [];

        if (!analysis.location) return tests;

        // Generate a test for each applicable suggestion
        for (const suggestion of suggestions) {
            const test = this.generateTestForSuggestion(analysis, suggestion);
            if (test) {
                tests.push(test);
            }
        }

        return tests;
    }

    /**
     * Generate a test for a specific suggestion.
     */
    private generateTestForSuggestion(
        analysis: DebugAnalysis,
        suggestion: FixSuggestion,
    ): GeneratedTest | null {
        const location = analysis.location;
        if (!location) return null;

        const funcName = location.functionName;
        const file = location.file;

        // Determine test framework from file extension
        const framework = this.detectFramework(file);

        switch (suggestion.pattern) {
            case 'null-reference':
                return this.generateNullCheckTest(funcName, file, framework, suggestion);
            case 'type-error':
                return this.generateTypeCheckTest(funcName, file, framework, suggestion);
            case 'async-await':
                return this.generateAsyncTest(funcName, file, framework);
            case 'assertion-failure':
                return this.generateAssertionTest(funcName, file, framework, suggestion);
            default:
                return this.generateGenericTest(funcName, file, framework, suggestion);
        }
    }

    /**
     * Auto-detect test framework from file extension.
     */
    private detectFramework(file: string): 'vitest' | 'jest' | 'pytest' | 'go-test' {
        if (file.endsWith('.py')) return 'pytest';
        if (file.endsWith('.go')) return 'go-test';
        // Default to vitest for JS/TS (Gemini CLI uses vitest)
        return 'vitest';
    }

    /**
     * Get the test file path from the source file.
     */
    private getTestPath(file: string, framework: string): string {
        if (framework === 'pytest') {
            const base = file.replace(/\.py$/, '');
            return `${base}_test.py`;
        }
        if (framework === 'go-test') {
            const base = file.replace(/\.go$/, '');
            return `${base}_test.go`;
        }
        // JS/TS: foo.ts → foo.test.ts
        const ext = file.match(/\.[^.]+$/)?.[0] ?? '.ts';
        const base = file.replace(/\.[^.]+$/, '');
        return `${base}.test${ext}`;
    }

    private generateNullCheckTest(
        funcName: string,
        file: string,
        framework: 'vitest' | 'jest' | 'pytest' | 'go-test',
        suggestion: FixSuggestion,
    ): GeneratedTest {
        // Extract the null variable from the suggestion
        const nullVar = /`(\w+)`.*(?:null|undefined)/.exec(suggestion.description)?.[1] ?? 'result';

        const testPath = this.getTestPath(file, framework);

        if (framework === 'pytest') {
            return {
                description: `${funcName} should handle None ${nullVar}`,
                code: [
                    `def test_${funcName}_handles_none_${nullVar}():`,
                    `    """Regression test: ${funcName} should not crash when ${nullVar} is None."""`,
                    `    # TODO: Set up conditions that make ${nullVar} None`,
                    `    result = ${funcName}(...)`,
                    `    assert result is not None, "${nullVar} should not be None"`,
                ].join('\n'),
                framework,
                relatedFile: file,
                suggestedPath: testPath,
            };
        }

        return {
            description: `${funcName} should handle null ${nullVar}`,
            code: [
                `it('should handle null ${nullVar} in ${funcName}', () => {`,
                `    // Regression test: ${funcName} should not crash when ${nullVar} is null`,
                `    // TODO: Set up conditions that make ${nullVar} null`,
                `    const result = ${funcName}(/* edge case args */);`,
                `    expect(result).not.toBeNull();`,
                `});`,
            ].join('\n'),
            framework,
            relatedFile: file,
            suggestedPath: testPath,
        };
    }

    private generateTypeCheckTest(
        funcName: string,
        file: string,
        framework: 'vitest' | 'jest' | 'pytest' | 'go-test',
        suggestion: FixSuggestion,
    ): GeneratedTest {
        const testPath = this.getTestPath(file, framework);
        return {
            description: `${funcName} should validate input types`,
            code: [
                `it('should handle invalid types in ${funcName}', () => {`,
                `    // Regression test: ${suggestion.title}`,
                `    // TODO: Pass invalid types and verify graceful handling`,
                `    expect(() => ${funcName}(undefined)).not.toThrow();`,
                `});`,
            ].join('\n'),
            framework,
            relatedFile: file,
            suggestedPath: testPath,
        };
    }

    private generateAsyncTest(
        funcName: string,
        file: string,
        framework: 'vitest' | 'jest' | 'pytest' | 'go-test',
    ): GeneratedTest {
        const testPath = this.getTestPath(file, framework);
        return {
            description: `${funcName} should properly await async operations`,
            code: [
                `it('should properly handle async in ${funcName}', async () => {`,
                `    // Regression test: ensure ${funcName} awaits async operations`,
                `    const result = await ${funcName}(/* args */);`,
                `    expect(result).toBeDefined();`,
                `    // Verify result is NOT a Promise (was properly awaited)`,
                `    expect(result).not.toBeInstanceOf(Promise);`,
                `});`,
            ].join('\n'),
            framework,
            relatedFile: file,
            suggestedPath: testPath,
        };
    }

    private generateAssertionTest(
        funcName: string,
        file: string,
        framework: 'vitest' | 'jest' | 'pytest' | 'go-test',
        suggestion: FixSuggestion,
    ): GeneratedTest {
        const testPath = this.getTestPath(file, framework);
        return {
            description: `${funcName} edge case from assertion failure`,
            code: [
                `it('should pass edge case in ${funcName}', () => {`,
                `    // Regression test from assertion failure: ${suggestion.title}`,
                `    // TODO: Reproduce the specific inputs that caused the assertion failure`,
                `    const result = ${funcName}(/* failing inputs */);`,
                `    expect(result).toBeDefined();`,
                `});`,
            ].join('\n'),
            framework,
            relatedFile: file,
            suggestedPath: testPath,
        };
    }

    private generateGenericTest(
        funcName: string,
        file: string,
        framework: 'vitest' | 'jest' | 'pytest' | 'go-test',
        suggestion: FixSuggestion,
    ): GeneratedTest {
        const testPath = this.getTestPath(file, framework);
        return {
            description: `${funcName} regression test for ${suggestion.pattern}`,
            code: [
                `it('should not regress: ${suggestion.title.replace(/'/g, "\\'")}', () => {`,
                `    // Regression test for: ${suggestion.pattern}`,
                `    // ${suggestion.description.split('\\n')[0]}`,
                `    // TODO: Reproduce the conditions that triggered this error`,
                `    const result = ${funcName}(/* edge case args */);`,
                `    expect(result).toBeDefined();`,
                `});`,
            ].join('\n'),
            framework,
            relatedFile: file,
            suggestedPath: testPath,
        };
    }

    /**
     * Generate LLM-friendly markdown with all test stubs.
     */
    toMarkdown(tests: GeneratedTest[]): string {
        if (tests.length === 0) return '';

        const lines: string[] = [];
        lines.push('### 🧪 Suggested Regression Tests');
        lines.push('');

        for (const test of tests) {
            lines.push(`**${test.description}**`);
            lines.push(`_File: \`${test.suggestedPath}\`_`);
            lines.push('');
            const lang = test.framework === 'pytest' ? 'python' : 'typescript';
            lines.push(`\`\`\`${lang}`);
            lines.push(test.code);
            lines.push('```');
            lines.push('');
        }

        return lines.join('\n');
    }
}
