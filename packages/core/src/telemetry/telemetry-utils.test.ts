/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getProgrammingLanguage } from './telemetry-utils.js';

describe('getProgrammingLanguage', () => {
  it('should return the programming language when file_path is present', () => {
    const args = { file_path: 'src/test.ts' };
    const language = getProgrammingLanguage(args);
    expect(language).toBe('TypeScript');
  });

  it('should return the programming language when absolute_path is present', () => {
    const args = { absolute_path: 'src/test.py' };
    const language = getProgrammingLanguage(args);
    expect(language).toBe('Python');
  });

  it('should return the programming language when path is present', () => {
    const args = { path: 'src/test.go' };
    const language = getProgrammingLanguage(args);
    expect(language).toBe('Go');
  });

  it('should return undefined when no file path is present', () => {
    const args = {};
    const language = getProgrammingLanguage(args);
    expect(language).toBeUndefined();
  });

  it('should handle unknown file extensions gracefully', () => {
    const args = { file_path: 'src/test.unknown' };
    const language = getProgrammingLanguage(args);
    expect(language).toBeUndefined();
  });

  it('should handle files with no extension', () => {
    const args = { file_path: 'src/test' };
    const language = getProgrammingLanguage(args);
    expect(language).toBeUndefined();
  });
});
