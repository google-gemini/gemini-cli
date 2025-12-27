/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldSimulateSlowServer } from './testUtils.js';

describe('testUtils', () => {
  describe('shouldSimulateSlowServer', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.useFakeTimers();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      vi.useRealTimers();
      process.env = originalEnv;
    });

    it('should return false if SIMILATE_SLOW_GEMINI_CLI_SERVER is not set', () => {
      delete process.env['SIMILATE_SLOW_GEMINI_CLI_SERVER'];
      expect(shouldSimulateSlowServer()).toBe(false);
    });

    it('should return true if elapsed time is less than specified duration', () => {
      process.env['SIMILATE_SLOW_GEMINI_CLI_SERVER'] = '10';
      // Time is mocked to 0 by default in vitest fake timers if not specified,
      // but shouldSimulateSlowServer uses Date.now() which is also mocked.
      expect(shouldSimulateSlowServer()).toBe(true);
    });

    it('should return false if elapsed time is greater than specified duration', () => {
      process.env['SIMILATE_SLOW_GEMINI_CLI_SERVER'] = '10';
      vi.advanceTimersByTime(11000); // 11 seconds
      expect(shouldSimulateSlowServer()).toBe(false);
    });

    it('should return false if SIMILATE_SLOW_GEMINI_CLI_SERVER is not a number', () => {
      process.env['SIMILATE_SLOW_GEMINI_CLI_SERVER'] = 'invalid';
      expect(shouldSimulateSlowServer()).toBe(false);
    });
  });
});
