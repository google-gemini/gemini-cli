/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('UI hang reproduction', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should demonstrate the performance impact of raw vs bracketed paste', async () => {
    await rig.setup('ui-hang-perf-test');

    const run = await rig.runInteractive();

    // 1. Test bracketed paste
    const largeTextA = 'A'.repeat(5 * 1024);
    console.log('--- Testing bracketed paste (5kiB, Expected: Fast) ---');
    const startTimeBracketed = Date.now();
    run.ptyProcess.write('\x1b[200~' + largeTextA + '\x1b[201~');
    
    // We expect the entire 5kiB to be processed quickly as a single "paste" event.
    // However, PTY echoing on Windows can be slow.
    await run.expectText('AAAAA', 15000);
    const durationBracketed = Date.now() - startTimeBracketed;
    console.log(`Bracketed paste of 5kiB took ${durationBracketed}ms`);

    // Clear buffer
    await run.ptyProcess.write('\r');
    await new Promise(r => setTimeout(r, 3000));

    // 2. Test raw paste
    const largeTextB = 'B'.repeat(5 * 1024);
    console.log('--- Testing raw paste (5kiB, Expected: Fast WITH FIX) ---');
    const startTimeRaw = Date.now();
    run.ptyProcess.write(largeTextB);

    // With the fix, raw paste should be similar to bracketed paste (both fast).
    // Without the fix, 5kiB raw paste would likely timeout or trigger thousands of re-renders.
    await run.expectText('BBBBB', 15000);
    const durationRaw = Date.now() - startTimeRaw;
    console.log(`Raw paste of 5kiB took ${durationRaw}ms`);
    
    // Assert that raw paste is not extremely slow compared to bracketed paste
    // (This assertion is more about verifying the fix is active)
    expect(durationRaw).toBeLessThan(durationBracketed * 2.5);
  });
});
