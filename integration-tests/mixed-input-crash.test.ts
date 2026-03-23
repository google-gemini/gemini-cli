/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('mixed input crash prevention', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should not crash when using mixed prompt inputs', async () => {
    rig.setup('should not crash when using mixed prompt inputs');

    // Test: echo "say '1'." | gemini --prompt-interactive="say '2'." say '3'.
    const stdinContent = "say '1'.";

    try {
      await rig.run({
        args: ['--prompt-interactive', "say '2'.", "say '3'."],
        stdin: stdinContent,
      });
      // The command should now succeed, passing the piped input + prompt into interactive mode.
    } catch (error: unknown) {
      throw new Error(
        `Expected the command to succeed, but it failed: ${error}`,
      );
    }
  });
});
