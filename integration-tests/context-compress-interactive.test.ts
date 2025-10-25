/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

describe('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger chat compression with /compress command', async () => {
    await rig.setup('interactive-compress-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress.json',
      ),
    });

    const run = await rig.runInteractive();

    await run.type('Initial prompt');
    await run.type('\r');

    await run.expectText('The initial response from the model', 5000);

    await run.type('/compress');
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
    await rig.setup('interactive-compress-failure', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress-failure.json',
      ),
    });

    const run = await rig.runInteractive();

    await run.type('Initial prompt');
    await run.type('\r');

    await run.expectText('The initial response from the model', 25000);

    await run.type('/compress');
    await run.type('\r');
    await run.expectText('compression was not beneficial', 5000);

    // Verify no telemetry event is logged for NOOP
    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      5000,
    );
    expect(
      foundEvent,
      'chat_compression telemetry event should be found for failures',
    ).toBe(true);
  });

  it('should handle /compress command on empty history', async () => {
    rig.setup('interactive-compress-empty', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress-empty.json',
      ),
    });

    const run = await rig.runInteractive();
    await run.type('/compress');
    await run.type('\r');

    await run.expectText('Nothing to compress.', 5000);

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
