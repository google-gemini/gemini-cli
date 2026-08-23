/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  generateEvalSkeleton,
  deriveEvalName,
  type SkeletonOptions,
} from '../utils/eval-skeleton-generator.js';

/** Checks that a TypeScript source string parses without errors. */
function isValidTypeScript(source: string): boolean {
  const sf = ts.createSourceFile(
    'test.eval.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  // TypeScript's parser always produces a SourceFile; check for parse diagnostics
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  return !diagnostics || diagnostics.length === 0;
}

const BASE_OPTIONS: SkeletonOptions = {
  name: 'should fix the bug in app.ts',
  suiteName: 'regression',
  prompt: 'Fix the bug in app.ts',
  files: {
    'src/app.ts': 'const add = (a, b) => a - b;',
  },
  observedTools: ['read_file', 'write_file'],
};

describe('generateEvalSkeleton', () => {
  it('produces valid TypeScript source', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(isValidTypeScript(source)).toBe(true);
  });

  it('includes the USUALLY_PASSES policy', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('USUALLY_PASSES');
  });

  it('includes static suiteName', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('regression');
  });

  it('includes suiteType behavioral', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('behavioral');
  });

  it('includes the prompt', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('Fix the bug in app.ts');
  });

  it('includes the eval case name', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('should fix the bug in app.ts');
  });

  it('includes workspace files', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('src/app.ts');
    expect(source).toContain('a - b');
  });

  it('generates assertions for observed tools', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    // Should mention the observed tools in assertions
    expect(source).toContain("'read_file'");
    expect(source).toContain("'write_file'");
    expect(source).toContain('toBeGreaterThanOrEqual');
  });

  it('includes the evalTest import', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain("import { evalTest } from './test-helper.js'");
  });

  it('includes the Apache-2.0 license header', async () => {
    const source = await generateEvalSkeleton(
      BASE_OPTIONS,
      'evals/test.eval.ts',
    );
    expect(source).toContain('Apache-2.0');
    expect(source).toContain('Google LLC');
  });

  it('uses a fallback assertion when no meaningful tools observed', async () => {
    const options: SkeletonOptions = {
      ...BASE_OPTIONS,
      observedTools: ['list_directory'], // low-signal only
    };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    // Should fall back to a basic assertion
    expect(source).toContain('result');
    expect(isValidTypeScript(source)).toBe(true);
  });

  it('handles empty files map gracefully', async () => {
    const options: SkeletonOptions = {
      ...BASE_OPTIONS,
      files: {},
    };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    expect(isValidTypeScript(source)).toBe(true);
    // No FILES const block expected
    expect(source).not.toContain('const FILES');
  });

  it('handles prompts with backticks by escaping them', async () => {
    const options: SkeletonOptions = {
      ...BASE_OPTIONS,
      prompt: 'Run `npm test` and fix any failures',
    };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    expect(isValidTypeScript(source)).toBe(true);
  });

  it('handles file contents with backticks by escaping them', async () => {
    const options: SkeletonOptions = {
      ...BASE_OPTIONS,
      files: {
        'template.ts': 'const s = `hello ${name}`;',
      },
    };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    expect(isValidTypeScript(source)).toBe(true);
  });

  it('caps FILES to MAX_FILES entries', async () => {
    const manyFiles: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      manyFiles[`file${i}.ts`] = `export const x${i} = ${i};`;
    }
    const options: SkeletonOptions = { ...BASE_OPTIONS, files: manyFiles };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    expect(isValidTypeScript(source)).toBe(true);
    // Should have at most 10 entries (MAX_FILES)
    const matches = source.match(/file\d+\.ts/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(10);
  });

  it('uses custom suiteName', async () => {
    const options: SkeletonOptions = {
      ...BASE_OPTIONS,
      suiteName: 'custom-suite',
    };
    const source = await generateEvalSkeleton(options, 'evals/test.eval.ts');
    expect(source).toContain("suiteName: 'custom-suite'");
  });
});

describe('deriveEvalName', () => {
  it('lowercases the prompt', () => {
    expect(deriveEvalName('Fix The Bug')).toContain('fix the bug');
  });

  it('prepends "should handle:" if not already starting with "should"', () => {
    const name = deriveEvalName('Fix the bug in app.ts');
    expect(name.startsWith('should')).toBe(true);
  });

  it('preserves "should" prefix if already present', () => {
    const name = deriveEvalName('should not delete important files');
    expect(name.startsWith('should not delete')).toBe(true);
  });

  it('strips non-word characters', () => {
    const name = deriveEvalName('Fix the bug! (in app.ts)');
    expect(name).not.toContain('!');
    expect(name).not.toContain('(');
  });

  it('truncates long prompts to 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(deriveEvalName(long).length).toBeLessThanOrEqual(
      'should handle: '.length + 80,
    );
  });
});
