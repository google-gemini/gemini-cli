/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { evalTest } from './test-helper.js';

/**
 * This test is designed to trigger the retry logic for 500 errors.
 * It will fail with a simulated 500 INTERNAL error 3 times and then be marked as SKIP.
 */
evalTest('ALWAYS_PASSES', {
  name: 'Chaos Verification Test 500',
  prompt: 'Trigger the 500 chaos simulation.',
  assert: async () => {},
});

/**
 * This test is designed to trigger the retry logic for 503 errors.
 * It will fail with a simulated 503 UNAVAILABLE error 3 times and then be marked as SKIP.
 */
evalTest('ALWAYS_PASSES', {
  name: 'Chaos Verification Test 503',
  prompt: 'Trigger the 503 chaos simulation.',
  assert: async () => {},
});
