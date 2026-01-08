/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exitCli } from './utils.js';
import { runExitCleanup } from '../utils/cleanup.js';

vi.mock('../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

describe('utils', () => {
  const originalProcessExit = process.exit;

  beforeEach(() => {
    // @ts-expect-error - Mocking process.exit
    process.exit = vi.fn();
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    vi.clearAllMocks();
  });

  describe('exitCli', () => {
    it('should call runExitCleanup and process.exit with default exit code 0', async () => {
      await exitCli();
      expect(runExitCleanup).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should call runExitCleanup and process.exit with specified exit code', async () => {
      await exitCli(1);
      expect(runExitCleanup).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
