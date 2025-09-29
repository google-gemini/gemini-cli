/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { stripAnsi, TestRig, type } from './test-helper.js';

describe('Interactive Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it.skipIf(process.platform === 'win32')(
    'should trigger chat compression with /compress command',
    async () => {
      await rig.setup('interactive-compress-test');

      const { ptyProcess } = rig.runInteractive();

      let fullOutput = '';
      ptyProcess.onData((data) => (fullOutput += data));

      // 1. Wait for the auth dialog to appear
      const authDialogAppeared = await rig.poll(
        () =>
          stripAnsi(fullOutput).includes('How would you like to authenticate'),
        5000,
        100,
      );

      // 2. Press "Enter" to select the default auth option if auth dialog came up
      if (authDialogAppeared) {
        ptyProcess.write('\r');
      }

      // Wait for the app to be ready
      const isReady = await rig.poll(
        () => stripAnsi(fullOutput).includes('Type your message'),
        15000,
        200,
      );
      expect(
        isReady,
        'CLI did not start up in interactive mode correctly',
      ).toBe(true);

      const longPrompt =
        'Dont do anything except returning a 1000 token long paragragh with the <name of the scientist who discovered theory of relativity> at the end to indicate end of response. This is a moderately long sentence.';

      await type(ptyProcess, longPrompt, 501);
      await type(ptyProcess, '\r', 501);

      await rig.poll(
        () => stripAnsi(fullOutput).toLowerCase().includes('einstein'),
        25000,
        200,
      );

      await type(ptyProcess, '/compress', 501);
      // Add a small delay to allow React to re-render the command list.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await type(ptyProcess, '\r', 501);

      const foundEvent = await rig.waitForTelemetryEvent(
        'chat_compression',
        90000,
      );
      expect(foundEvent, 'chat_compression telemetry event was not found').toBe(
        true,
      );
    },
  );

  it.skipIf(process.platform === 'win32')(
    'should handle compression failure on token inflation',
    async () => {
      await rig.setup('interactive-compress-test');

      const { ptyProcess } = rig.runInteractive();

      let fullOutput = '';
      ptyProcess.onData((data) => (fullOutput += data));

      // 1. Wait for the auth dialog to appear
      const authDialogAppeared = await rig.poll(
        () =>
          stripAnsi(fullOutput).includes('How would you like to authenticate'),
        5000,
        100,
      );

      // 2. Press "Enter" to select the default auth option if auth dialog came up
      if (authDialogAppeared) {
        ptyProcess.write('\r');
      }

      // Wait for the app to be ready
      const isReady = await rig.poll(
        () => stripAnsi(fullOutput).includes('Type your message'),
        25000,
        200,
      );
      expect(
        isReady,
        'CLI did not start up in interactive mode correctly',
      ).toBe(true);

      await type(ptyProcess, '/compress', 501);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await type(ptyProcess, '\r', 501);

      const foundEvent = await rig.waitForTelemetryEvent(
        'chat_compression',
        90000,
      );
      expect(foundEvent).toBe(true);

      const compressionFailed = await rig.poll(
        () =>
          stripAnsi(fullOutput)
            .toLowerCase()
            .includes('compression was not beneficial'),
        25000,
        200,
      );

      // A simple check for the failure message in the output
      expect(compressionFailed).toBe(true);
    },
  );
});
