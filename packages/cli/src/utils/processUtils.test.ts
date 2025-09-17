/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock process.exit to throw instead of actually exiting
const originalExit = process.exit;
beforeEach(() => {
  process.exit = vi.fn((code?: number | string) => {
    throw new Error(`process.exit(${code}) called`);
  });
});

afterEach(() => {
  process.exit = originalExit;
});

import { RELAUNCH_EXIT_CODE, relaunchApp } from './processUtils.js';

describe('processUtils', () => {
  describe('RELAUNCH_EXIT_CODE', () => {
    it('should have the correct exit code value', () => {
      expect(RELAUNCH_EXIT_CODE).toBe(42);
    });
  });

  describe('relaunchApp', () => {
    it('should exit with RELAUNCH_EXIT_CODE', () => {
      expect(() => relaunchApp()).toThrow('process.exit(42) called');
    });
  });
});
