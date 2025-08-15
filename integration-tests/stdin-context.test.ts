/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('stdin context', () => {
  it('should be able to use stdin as context for a prompt', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to use stdin as context for a prompt');

    const stdinContent = 'The secret word is fun';
    const prompt = 'What is the secret word?';

    const result = await rig.run({ prompt, stdin: stdinContent });

    // Add debugging information
    if (!result.toLowerCase().includes('fun')) {
      printDebugInfo(rig, result, {
        'Contains "fun"': result.toLowerCase().includes('fun'),
      });
    }

    // Validate model output
    validateModelOutput(result, 'fun', 'STDIN context test');

    expect(
      result.toLowerCase().includes('fun'),
      'Expected the model to identify the secret word from stdin',
    ).toBeTruthy();
  });
});
