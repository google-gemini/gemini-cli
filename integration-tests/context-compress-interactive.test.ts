/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  // TODO(#11062): Make this test reliable by not using the actual Gemini model
  // We could not rely on the following mechanisms that have already shown to be
  // flakey:
  //    1. Asking a prompt like "Output 1000 tokens and the inventor of the lightbulb"
  //        --> This was b/c the model occasionally did not output einstein and
  //            we are not able to trigger the compression piece
  //    2. Asking it to out a specific output and waiting for that.
  //       --> The expect catches the input and thinks that is the output so the
  //            /compress gets called too early
  it.skip('should trigger chat compression with /compress command', async () => {
    rig.setup('interactive-compress-success');

    const run = await rig.runInteractive();

    // Generate a long context to make compression viable.
    const longPrompt =
      'Write a 200 word story about a robot. The story MUST end with the following output: THE_END';

    await run.sendKeys(longPrompt);
    await run.sendKeys('\r');

    // Wait for the specific end marker.
    await run.expectText('THE_END', 30000);

    await run.type('/compress');
    await run.sendKeys('\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      90000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );
  });

  it('should handle /compress command on empty history', async () => {
    rig.setup('interactive-compress-empty');

    const run = await rig.runInteractive();

    await run.type('/compress');
    await run.type('\r');
    await run.expectText('Nothing to compress.', 25000);

    // Verify no telemetry event is logged for NOOP
    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      5000, // Short timeout as we expect it not to happen
    );
    expect(
      foundEvent,
      'chat_compression telemetry event should not be found for NOOP',
    ).toBe(false);
  });
});
