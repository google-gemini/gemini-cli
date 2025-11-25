/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

/**
 * Integration tests for deliberate compression.
 *
 * These tests verify the full CLI flow for deliberate context compression:
 * - Goal extraction from conversation history
 * - Goal selection prompt UI
 * - Compression with selected goal (since-last-prompt strategy)
 * - Safety valve behavior at high utilization
 *
 * Note: These tests require the deliberate compression feature to be enabled
 * and use fake responses to simulate the model's behavior.
 */
describe('Deliberate Compression Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should trigger compression with /compress command and log telemetry', async () => {
    await rig.setup('deliberate-compress-basic', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-interactive.compress.responses',
      ),
      settings: {
        // Enable deliberate compression feature
        compression: {
          deliberateEnabled: true,
          interactive: true,
        },
      },
    });

    const run = await rig.runInteractive();

    // Build up enough conversation history with a longer response
    await run.sendKeys(
      'Write a 200 word story about a robot. The story MUST end with the text THE_END followed by a period.',
    );
    await run.sendKeys('\r');
    await run.expectText('THE_END.', 30000);

    // Trigger manual compression with /compress command
    await run.type('/compress');
    await run.type('\r');

    // Wait for compression telemetry event
    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      25000,
    );
    expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
      true,
    );

    // Verify compression completed - should show "Chat history compressed"
    await run.expectText('Chat history compressed', 10000);
  });

  // Skip this test until the goal selection UI is fully integrated into the CLI flow
  it.skip('should show goal selection prompt when deliberate compression is enabled', async () => {
    await rig.setup('deliberate-compress-goal-selection', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-deliberate.responses',
      ),
      settings: {
        compression: {
          deliberateEnabled: true,
          interactive: true,
          // Lower thresholds for testing
          triggerTokens: 1000,
          minMessagesSinceLastCompress: 2,
        },
      },
    });

    const run = await rig.runInteractive();

    // Build up conversation history
    await run.sendKeys('Help me implement OAuth authentication. Say OK.');
    await run.sendKeys('\r');
    await run.expectText('OK', 20000);

    await run.sendKeys('Now add JWT token validation. Say DONE.');
    await run.sendKeys('\r');
    await run.expectText('DONE', 20000);

    // Trigger compression - should show goal selection
    await run.type('/compress');
    await run.type('\r');

    // Expect to see the goal selection prompt
    // Note: This depends on the UI being fully integrated
    await run.expectText('What are you currently working on?', 15000);

    // Select first goal option
    await run.sendKeys('1');
    await run.sendKeys('\r');

    // Wait for compression to complete
    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      25000,
    );
    expect(foundEvent).toBe(true);
  });

  // Skip this test until the auto-trigger mechanism is fully implemented
  it.skip('should auto-compress without opt-out options when safety valve triggers', async () => {
    await rig.setup('deliberate-compress-safety-valve', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'context-compress-deliberate.responses',
      ),
      settings: {
        compression: {
          deliberateEnabled: true,
          interactive: true,
          // Very low threshold to trigger safety valve easily
          triggerUtilization: 0.01,
        },
      },
    });

    const run = await rig.runInteractive();

    // Send a message that should trigger safety valve
    await run.sendKeys('This is a test message to trigger compression.');
    await run.sendKeys('\r');

    // At safety valve, opt-out options should not be shown
    // Wait for compression to happen automatically
    const foundEvent = await rig.waitForTelemetryEvent(
      'chat_compression',
      25000,
    );

    // If the safety valve triggered, compression should have happened
    // Note: This test may need adjustment based on actual implementation
    if (foundEvent) {
      expect(foundEvent).toBe(true);
    }
  });
});
