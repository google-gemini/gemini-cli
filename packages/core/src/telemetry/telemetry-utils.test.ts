/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getProgrammingLanguage } from './telemetry-utils.js';

describe('getProgrammingLanguage', () => {
  type ProgrammingLanguageTestCase = {
    name: string;
    args: Record<string, string>;
    expected: string | undefined;
  };

  it.each<ProgrammingLanguageTestCase>([
    {
      name: 'file_path is present',
      args: { file_path: 'src/test.ts' },
      expected: 'typescript',
    },
    {
      name: 'absolute_path is present',
      args: { absolute_path: 'src/test.py' },
      expected: 'python',
    },
    { name: 'path is present', args: { path: 'src/test.go' }, expected: 'go' },
    {
      name: 'no file path is present',
      args: {},
      expected: undefined,
    },
    {
      name: 'unknown file extensions',
      args: { file_path: 'src/test.unknown' },
      expected: undefined,
    },
    {
      name: 'files with no extension',
      args: { file_path: 'src/test' },
      expected: undefined,
    },
  ])('should return $expected when $name', ({ args, expected }) => {
    const language = getProgrammingLanguage(args);
    expect(language).toBe(expected);
  });
});
