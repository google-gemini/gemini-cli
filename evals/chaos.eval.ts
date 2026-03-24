/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { evalTest } from './test-helper.js';

/**
 * These tests are designed to trigger the "Chaos Simulation" logic in evals/test-helper.ts.
 * They simulate persistent 500 and 503 API errors to verify that the reliability
 * pipeline correctly retries, logs the events, and eventually skips the tests
 * instead of failing the CI.
 */

evalTest('ALWAYS_PASSES', {
  name: 'Chaos 500 - API Internal Error Simulation',
  prompt: 'Say hello',
  assert: async (rig, result) => {
    // This assertion should never be reached because the chaos simulation
    // throws an error before rig.run().
    throw new Error('Should have been caught by chaos simulation');
  },
});

evalTest('ALWAYS_PASSES', {
  name: 'Chaos 503 - API Unavailable Simulation',
  prompt: 'Say hello',
  assert: async (rig, result) => {
    // This assertion should never be reached.
    throw new Error('Should have been caught by chaos simulation');
  },
});
