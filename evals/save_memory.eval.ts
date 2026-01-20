/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { validateModelOutput } from '../integration-tests/test-helper.js';

describe('save_memory', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should be able to save to memory',
    params: {
      settings: { tools: { core: ['save_memory'] } },
    },
    prompt: `remember that my favorite color is  blue.
  
    what is my favorite color? tell me that and surround it with $ symbol`,
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForToolCall('save_memory');
      expect(
        foundToolCall,
        'Expected to find a save_memory tool call',
      ).toBeTruthy();

      validateModelOutput(result, 'blue', 'Save memory test');
    },
  });
});
