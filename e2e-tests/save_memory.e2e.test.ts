/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  E2ETestRig,
  printDebugInfo,
  validateModelOutput,
} from './test-helper.e2e.js';

describe('save_memory', () => {
  it('should be able to save to memory', async () => {
    const rig = new E2ETestRig();
    await rig.setup('should be able to save to memory');

    const prompt = `remember that my favorite color is  blue.\n\n  what is my favorite color? tell me that and surround it with $ symbol`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('save_memory');

    // Add debugging information
    if (!foundToolCall || !result.toLowerCase().includes('blue')) {
      const allTools = printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Contains blue': result.toLowerCase().includes('blue'),
      });

      console.error(
        'Memory tool calls:',
        allTools
          .filter((t) => t.toolRequest.name === 'save_memory')
          .map((t) => t.toolRequest.args),
      );
    }

    expect(
      foundToolCall,
      'Expected to find a save_memory tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(result, 'blue', 'Save memory test');
  });
});
