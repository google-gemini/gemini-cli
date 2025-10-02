/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig, type, printDebugInfo } from './test-helper.js';

describe('Interactive file system', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it.skipIf(process.platform === 'win32')(
    'should perform a read-then-write sequence',
    async () => {
      const fileName = 'version.txt';
      await rig.setup('interactive-read-then-write');
      rig.createFile(fileName, '1.0.0');

      const { ptyProcess } = rig.runInteractive();

      const authDialogAppeared = await rig.waitForText(
        'How would you like to authenticate',
        5000,
      );

      // select the second option if auth dialog come's up
      if (authDialogAppeared) {
        ptyProcess.write('2');
      }

      // Wait for the app to be ready
      const isReady = await rig.waitForText('Type your message', 15000);
      expect(
        isReady,
        'CLI did not start up in interactive mode correctly',
      ).toBe(true);

      // Step 1: Read the file
      const readPrompt = `Read the version from ${fileName}`;
      await type(ptyProcess, readPrompt);
      await type(ptyProcess, '\r');

      const readCall = await rig.waitForToolCall('read_file', 30000);
      expect(readCall, 'Expected to find a read_file tool call').toBe(true);

      const containsExpectedVersion = await rig.waitForText('1.0.0', 15000);
      expect(
        containsExpectedVersion,
        'Expected to see version "1.0.0" in output',
      ).toBe(true);

      // Step 2: Write the file
      const writePrompt = `now change the version to 1.0.1 in the file`;
      await type(ptyProcess, writePrompt);
      await type(ptyProcess, '\r');

      const toolCall = await rig.waitForAnyToolCall(
        ['write_file', 'replace'],
        30000,
      );

      if (!toolCall) {
        printDebugInfo(rig, rig._interactiveOutput, {
          toolCall,
        });
      }

      expect(
        toolCall,
        'Expected to find a write_file or replace tool call',
      ).toBe(true);

      const newFileContent = rig.readFile(fileName);
      expect(newFileContent).toBe('1.0.1');
    },
  );
});
