/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderGitRepo } from './snippets.js';

describe('renderGitRepo', () => {
  it('should return empty string when options is undefined', () => {
    expect(renderGitRepo(undefined)).toBe('');
  });

  it('should use && as command separator on non-Windows platforms', () => {
    const result = renderGitRepo({ interactive: true, isWindows: false });
    expect(result).toContain('git status && git diff HEAD && git log -n 3');
    expect(result).not.toContain('`;`');
    expect(result).not.toContain('PowerShell 5.1');
  });

  it('should use ; as command separator on Windows', () => {
    const result = renderGitRepo({ interactive: true, isWindows: true });
    expect(result).toContain('git status ; git diff HEAD ; git log -n 3');
    expect(result).not.toContain('git status && git diff HEAD');
  });

  it('should include PowerShell 5.1 guidance on Windows', () => {
    const result = renderGitRepo({ interactive: true, isWindows: true });
    expect(result).toContain('PowerShell 5.1');
    expect(result).toContain('semicolon');
  });

  it('should not include PowerShell guidance on non-Windows', () => {
    const result = renderGitRepo({ interactive: false, isWindows: false });
    expect(result).not.toContain('PowerShell 5.1');
  });
});
