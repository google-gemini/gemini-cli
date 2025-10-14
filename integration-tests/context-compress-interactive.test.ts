/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe.skip('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger chat compression with /compress command', async () => {
    await rig.setup('interactive-compress-test');

    const run = await rig.runInteractive();

    const longPrompt =
      'Dont do anything except returning a 1000 token long paragragh with the <name of the scientist who discovered theory of relativity> at the end to indicate end of response. This is a moderately long sentence.';

    await run.type(longPrompt);
    await run.type('\r');

    await run.expectText('einstein', 25000);

    await run.type('/compress');
    // A small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await run.type('\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      90000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );
  });

  //TODO - https://github.com/google-gemini/gemini-cli/issues/10769
  it.skip('should handle compression failure on token inflation', async () => {
    await rig.setup('interactive-compress-test');

    const run = await rig.runInteractive();

    await run.type('/compress');
    // A small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await run.type('\r');
    await run.expectText('compression was not beneficial', 25000);
  });
});
