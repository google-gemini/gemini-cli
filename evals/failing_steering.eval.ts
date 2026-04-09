/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, TestRig } from './test-helper.js';

describe('Related Eval Demonstration', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should fail deliberately to demonstrate regression reporting',
    files: {
      'test.txt': 'Hello world',
    },
    prompt: 'What is in test.txt?',
    assert: async (rig: TestRig, result: string) => {
      // This assertion is designed to fail.
      expect(result).toContain('THE MODEL WILL NEVER SAY THIS EXACT SENTENCE');
    },
  });
});
