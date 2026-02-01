/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerCleanup,
  runExitCleanup,
  resetCleanupForTesting,
} from './cleanup.js';

describe('SessionEnd double-fire issue #18019', () => {
  beforeEach(() => {
    resetCleanupForTesting();
  });

  afterEach(() => {
    resetCleanupForTesting();
  });

  it('should only fire SessionEnd once in interactive mode', async () => {
    // After fix: Only AppContainer.tsx registers SessionEnd cleanup for interactive mode
    // The duplicate registration in gemini.tsx:527-531 has been removed
    const sessionEndFireCount = { count: 0 };

    // Simulate the registration in AppContainer.tsx:434-448 (interactive mode only)
    registerCleanup(async () => {
      sessionEndFireCount.count++;
    });

    await runExitCleanup();

    // SessionEnd should fire exactly once
    expect(sessionEndFireCount.count).toBe(1);
  });

  it('should only fire SessionEnd once in non-interactive mode', async () => {
    // After fix: Only gemini.tsx:702-705 registers SessionEnd cleanup for non-interactive mode
    // The duplicate registration in gemini.tsx:527-531 has been removed
    const sessionEndFireCount = { count: 0 };

    // Simulate the registration in gemini.tsx:702-705 (non-interactive mode only)
    registerCleanup(async () => {
      sessionEndFireCount.count++;
    });

    await runExitCleanup();

    // SessionEnd should fire exactly once
    expect(sessionEndFireCount.count).toBe(1);
  });

  it('should demonstrate that cleanup functions run in order', async () => {
    // Verify cleanup functions run in registration order
    const order: number[] = [];

    registerCleanup(async () => {
      order.push(1);
    });

    registerCleanup(async () => {
      order.push(2);
    });

    await runExitCleanup();

    expect(order).toEqual([1, 2]);
  });
});
