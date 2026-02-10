/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isITerm2, resetITerm2Cache, shouldUseEmoji } from './terminalUtils.js';

describe('terminalUtils', () => {
  beforeEach(() => {
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('LC_ALL', '');
    vi.stubEnv('LC_CTYPE', '');
    vi.stubEnv('LANG', '');
    vi.stubEnv('TERM', '');
    resetITerm2Cache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('isITerm2', () => {
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

  describe('shouldUseEmoji', () => {
    it('should return true when UTF-8 is supported', () => {
      vi.stubEnv('LANG', 'en_US.UTF-8');
      expect(shouldUseEmoji()).toBe(true);
    });

    it('should return true when utf8 (no hyphen) is supported', () => {
      vi.stubEnv('LANG', 'en_US.utf8');
      expect(shouldUseEmoji()).toBe(true);
    });

    it('should check LC_ALL first', () => {
      vi.stubEnv('LC_ALL', 'en_US.UTF-8');
      vi.stubEnv('LANG', 'C');
      expect(shouldUseEmoji()).toBe(true);
    });

    it('should return false when UTF-8 is not supported', () => {
      vi.stubEnv('LANG', 'C');
      expect(shouldUseEmoji()).toBe(false);
    });

    it('should return false on linux console (TERM=linux)', () => {
      vi.stubEnv('LANG', 'en_US.UTF-8');
      vi.stubEnv('TERM', 'linux');
      expect(shouldUseEmoji()).toBe(false);
    });
  });
});
