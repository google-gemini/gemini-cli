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
    await rig.setup('interactive-compress-success', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress.responses',
      ),
    });

    const run = await rig.runInteractive();

    await run.sendKeys(
      'Write a 200 word story about a robot. The story MUST end with the text THE_END followed by a period.',
    );
    await run.type('\r');

    // Wait for the specific end marker.
    await run.expectText('THE_END.', 30000);

    await run.type('/compress');
    await run.type('\r');

    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      25000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );

    await run.expectText('Chat history compressed', 5000);
  });

  // TODO: Context compression is broken and doesn't include the system
  // instructions or tool counts, so it thinks compression is beneficial when
  // it is in fact not.
  it.skip('should handle compression failure on token inflation', async () => {
    await rig.setup('interactive-compress-failure', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress-failure.responses',
      ),
    });

    const run = await rig.runInteractive();

    await run.type('Respond with exactly "Hello" followed by a period');
    await run.type('\r');

    await run.expectText('Hello.', 25000);

    await run.type('/compress');
    await run.type('\r');
    await run.expectText('compression was not beneficial', 25000);

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
        'context-compress-interactive.compress-empty.responses',
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
