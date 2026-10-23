/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  detectSteeringChanges,
  getChunkedDiff,
  isTestFile,
} from '../changed_prompt.js';

const NO_DIFF = () => '';

describe('isTestFile', () => {
  it.each([
    'packages/core/src/ide/ide-client.test.ts',
    'packages/cli/src/ui/App.test.tsx',
    'scripts/tests/get-release-version.test.js',
    'packages/core/src/foo.test.mts',
    'packages/core/src/foo.test.cjs',
  ])('treats %s as a test file', (file) => {
    expect(isTestFile(file)).toBe(true);
  });

  it.each([
    'packages/core/src/ide/ide-client.ts',
    'packages/core/src/tools/definitions/coreTools.ts',
    'packages/core/src/test-utils/helpers.ts',
    'packages/core/src/testing.ts',
    'packages/core/src/latest.ts',
  ])('does not treat %s as a test file', (file) => {
    expect(isTestFile(file)).toBe(false);
  });
});

describe('detectSteeringChanges', () => {
  it('returns false when nothing changed', () => {
    const getDiff = vi.fn(NO_DIFF);
    expect(detectSteeringChanges([], getDiff)).toEqual({
      detected: false,
      reasons: [],
    });
    expect(getDiff).not.toHaveBeenCalled();
  });

  it('returns false for changes outside core and evals', () => {
    const getDiff = vi.fn(NO_DIFF);
    const result = detectSteeringChanges(
      ['packages/cli/src/gemini.tsx', 'docs/index.md'],
      getDiff,
    );
    expect(result.detected).toBe(false);
    expect(getDiff).not.toHaveBeenCalled();
  });

  it('detects changes under the core prompt and tool directories by path', () => {
    for (const file of [
      'packages/core/src/prompts/snippets.ts',
      'packages/core/src/tools/definitions/coreTools.ts',
      // Path-based detection is deliberately broad and includes test files.
      'packages/core/src/tools/shell.test.ts',
    ]) {
      const result = detectSteeringChanges([file], NO_DIFF);
      expect(result.detected, file).toBe(true);
      expect(result.reasons).toEqual([`Matched core steering path: ${file}`]);
    }
  });

  it('detects changes under evals/ unless steeringOnly is set', () => {
    const files = ['evals/plan_mode.eval.ts'];
    expect(detectSteeringChanges(files, NO_DIFF)).toEqual({
      detected: true,
      reasons: ['Matched test path: evals/plan_mode.eval.ts'],
    });
    expect(
      detectSteeringChanges(files, NO_DIFF, { steeringOnly: true }).detected,
    ).toBe(false);
  });

  it('detects steering signatures in core source files', () => {
    const files = ['packages/core/src/agents/codebase-investigator.ts'];
    const getDiff = vi.fn(
      () =>
        "+export const definition: LocalAgentDefinition = { kind: 'local' };",
    );
    const result = detectSteeringChanges(files, getDiff);
    expect(result).toEqual({
      detected: true,
      reasons: ['Matched steering signature in core: LocalAgentDefinition'],
    });
    expect(getDiff).toHaveBeenCalledWith(files);
  });

  it('ignores steering signatures that only appear in test files', () => {
    // Regression: stand-in MCP tools in IDE tests are declared with
    // `inputSchema`, which used to trigger the behavioral evals for PRs with
    // no prompt or tool change at all.
    const getDiff = vi.fn(
      () =>
        "+  { description: 'stand-in', inputSchema: OpenDiffRequestSchema.shape },",
    );
    const result = detectSteeringChanges(
      [
        'packages/core/src/ide/ide-client.server-restart.test.ts',
        'packages/core/src/ide/ide-client.sandbox.test.ts',
      ],
      getDiff,
    );
    expect(result).toEqual({ detected: false, reasons: [] });
    expect(getDiff).not.toHaveBeenCalled();
  });

  it('only diffs non-test core files for signature detection', () => {
    const getDiff = vi.fn(NO_DIFF);
    detectSteeringChanges(
      [
        'packages/core/src/ide/ide-client.ts',
        'packages/core/src/ide/ide-client.test.ts',
        'packages/cli/src/config/config.ts',
      ],
      getDiff,
    );
    expect(getDiff).toHaveBeenCalledWith([
      'packages/core/src/ide/ide-client.ts',
    ]);
  });

  it('skips the signature scan once a path matched, unless verbose', () => {
    const getDiff = vi.fn(() => '+inputSchema');
    const files = [
      'packages/core/src/tools/shell.ts',
      'packages/core/src/ide/ide-client.ts',
    ];

    const quiet = detectSteeringChanges(files, getDiff);
    expect(quiet.reasons).toEqual([
      'Matched core steering path: packages/core/src/tools/shell.ts',
    ]);
    expect(getDiff).not.toHaveBeenCalled();

    const verbose = detectSteeringChanges(files, getDiff, { verbose: true });
    expect(verbose.detected).toBe(true);
    expect(verbose.reasons).toEqual([
      'Matched core steering path: packages/core/src/tools/shell.ts',
      'Matched steering signature in core: inputSchema',
    ]);
    expect(getDiff).toHaveBeenCalledWith(files);
  });
});

describe('getChunkedDiff', () => {
  it('returns an empty diff without invoking git when there are no files', () => {
    const runGit = vi.fn(() => '');
    expect(getChunkedDiff('HEAD', [], runGit)).toBe('');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('diffs a small set of files in a single git call', () => {
    const runGit = vi.fn(() => '+inputSchema\n');
    const files = ['packages/core/src/a.ts', 'packages/core/src/b.ts'];
    expect(getChunkedDiff('abc123', files, runGit)).toBe('+inputSchema\n');
    expect(runGit).toHaveBeenCalledTimes(1);
    expect(runGit).toHaveBeenCalledWith([
      'diff',
      '-U0',
      'FETCH_HEAD...abc123',
      '--',
      ...files,
    ]);
  });

  it('splits large change sets into bounded git calls and concatenates the output', () => {
    // Keeps each `git diff` invocation under the OS command-line length limit
    // (notably on Windows) so main() does not fall back to running the evals.
    const files = Array.from(
      { length: 250 },
      (_, i) => `packages/core/src/file-${i}.ts`,
    );
    const runGit = vi.fn((args) => `chunk(${args.length - 4})\n`);

    const diff = getChunkedDiff('HEAD', files, runGit);

    expect(runGit).toHaveBeenCalledTimes(3);
    const chunks = runGit.mock.calls.map((call) => call[0].slice(4));
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(files);
    for (const call of runGit.mock.calls) {
      expect(call[0].slice(0, 4)).toEqual([
        'diff',
        '-U0',
        'FETCH_HEAD...HEAD',
        '--',
      ]);
    }
    expect(diff).toBe('chunk(100)\nchunk(100)\nchunk(50)\n');
  });
});
