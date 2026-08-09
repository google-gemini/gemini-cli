/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getLanguageFromFilePath } from './language-detection.js';

describe('language-detection', () => {
  it('should return correct LSP identifiers for various extensions', () => {
    expect(getLanguageFromFilePath('test.ts')).toBe('typescript');
    expect(getLanguageFromFilePath('test.js')).toBe('javascript');
    expect(getLanguageFromFilePath('test.py')).toBe('python');
    expect(getLanguageFromFilePath('test.java')).toBe('java');
    expect(getLanguageFromFilePath('test.go')).toBe('go');
    expect(getLanguageFromFilePath('test.cs')).toBe('csharp');
    expect(getLanguageFromFilePath('test.cpp')).toBe('cpp');
    expect(getLanguageFromFilePath('test.sh')).toBe('shellscript');
    expect(getLanguageFromFilePath('test.bat')).toBe('bat');
    expect(getLanguageFromFilePath('test.json')).toBe('json');
    expect(getLanguageFromFilePath('test.md')).toBe('markdown');
    expect(getLanguageFromFilePath('test.tsx')).toBe('typescriptreact');
    expect(getLanguageFromFilePath('test.jsx')).toBe('javascriptreact');
  });

  it('should handle uppercase extensions', () => {
    expect(getLanguageFromFilePath('TEST.TS')).toBe('typescript');
  });

  it('should handle filenames without extensions but in map', () => {
    expect(getLanguageFromFilePath('.gitignore')).toBe('ignore');
    expect(getLanguageFromFilePath('.dockerfile')).toBe('dockerfile');
    expect(getLanguageFromFilePath('Dockerfile')).toBe('dockerfile');
  });

  it('should return undefined for unknown extensions', () => {
    expect(getLanguageFromFilePath('test.unknown')).toBeUndefined();
  });

  it('should return undefined for files without extension or known filename', () => {
    expect(getLanguageFromFilePath('just_a_file')).toBeUndefined();
  });
});
