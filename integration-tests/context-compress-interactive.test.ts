/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

describe.skip('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger chat compression with /compress command', async () => {
    await rig.setup('interactive-compress-test', {
      mockResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress.json',
      ),
    });

    const run = await rig.runInteractive();

    await run.type('Initial prompt');
    await run.type('\r');

    await run.expectText('The initial response from the model', 5000);

    await run.type('/compress');
    // A small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await run.type('\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      5000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );

    await run.expectText('Chat history compressed', 5000);
  });

  it('should handle compression failure on token inflation', async () => {
    await rig.setup('interactive-compress-test', {
      mockResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.no-compress.json',
      ),
    });

    const run = await rig.runInteractive();

    await run.type('Initial prompt');
    await run.type('\r');

    await run.expectText('The initial response from the model', 25000);

    await run.type('/compress');
    // A small delay to allow React to re-render the command list.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await run.type('\r');
    await run.expectText('compression was not beneficial', 5000);
  });
});
