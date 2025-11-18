/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig } from './test-helper.js';

describe('mixed input crash prevention', () => {
  it('should not crash when using mixed prompt inputs', async () => {
    const rig = new TestRig();
    rig.setup('should not crash when using mixed prompt inputs');

    // Test: echo "say '1'." | gemini --prompt-interactive="say '2'." say '3'.
    const stdinContent = "say '1'.";

    try {
      await rig.run(
        { stdin: stdinContent },
        '--prompt-interactive',
        "say '2'.",
        "say '3'.",
      );
      throw new Error('Expected the command to fail, but it succeeded');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      const err = error as Error;

      expect(err.message).toContain('Process exited with code 1');
      expect(err.message).toContain(
        '--prompt-interactive flag cannot be used when input is piped',
      );
      expect(err.message).not.toContain('setRawMode is not a function');
      expect(err.message).not.toContain('unexpected critical error');
    }

    const lastRequest = rig.readLastApiRequest();
    expect(lastRequest).toBeNull();
  });

  it('should provide clear error message for mixed input', async () => {
    const rig = new TestRig();
    rig.setup('should provide clear error message for mixed input');

    try {
      await rig.run(
        { stdin: 'test input' },
        '--prompt-interactive',
        'test prompt',
      );
      throw new Error('Expected the command to fail, but it succeeded');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      const err = error as Error;

      expect(err.message).toContain(
        '--prompt-interactive flag cannot be used when input is piped',
      );
    }
  });
});
