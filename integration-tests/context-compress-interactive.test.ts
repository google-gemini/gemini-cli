/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig, type } from './test-helper.js';

describe('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger chat compression with /compress command on long history', async () => {
    await rig.setup('interactive-compress-test-long');

    const { ptyProcess } = rig.runInteractive();
    await rig.ensureReadyForInput(ptyProcess);

    // Create a long history that is guaranteed to be compressible.
    const longPrompt =
      'Dont do anything except returning a 1000 token long paragragh with the <name of the scientist who discovered theory of relativity> at the end to indicate end of response. This is a moderately long sentence.';

    await type(ptyProcess, longPrompt);
    await type(ptyProcess, '\r');

    await rig.waitForText('einstein', 60000);

    await type(ptyProcess, '/compress');
    // A small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await type(ptyProcess, '\r');

    // For a long history, compression should always succeed.
    const compressed = await rig.waitForText('Chat history compressed', 60000);
    expect(compressed, 'Chat history should have been compressed').toBe(true);

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      10000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );
  });

  // Fixes https://github.com/google-gemini/gemini-cli/issues/10769
  it('should handle /compress command on empty history', async () => {
    await rig.setup('interactive-compress-test-empty');

    const { ptyProcess } = rig.runInteractive();
    await rig.ensureReadyForInput(ptyProcess);

    await type(ptyProcess, '/compress');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await type(ptyProcess, '\r');

    const noop = await rig.waitForText('Nothing to compress.', 30000);
    expect(noop, 'Should show NOOP message').toBe(true);
  });
});
