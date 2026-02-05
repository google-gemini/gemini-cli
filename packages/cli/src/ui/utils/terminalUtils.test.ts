/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isITerm2, resetITerm2Cache } from './terminalUtils.js';

describe('terminalUtils', () => {
  beforeEach(() => {
    vi.stubEnv('TERM_PROGRAM', '');
    resetITerm2Cache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should detect iTerm2 via TERM_PROGRAM', () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    expect(isITerm2()).toBe(true);
  });

  it('should return false if not iTerm2', () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    expect(isITerm2()).toBe(false);
  });

  it('should cache the result', () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    expect(isITerm2()).toBe(true);

    // Change env but should still be true due to cache
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    expect(isITerm2()).toBe(true);

    resetITerm2Cache();
    expect(isITerm2()).toBe(false);
  });
});
