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

  it.skip('should perform a read-then-write sequence', async () => {
    const fileName = 'version.txt';
    rig.setup('interactive-read-then-write');
    rig.createFile(fileName, '1.0.0');

    const ptyProcess = await rig.runInteractive();

    // Step 1: Read the file
    const readPrompt = `Read the version from ${fileName}`;
    await type(ptyProcess, readPrompt);
    await type(ptyProcess, '\r');

    const readCall = await rig.waitForToolCall('read_file', 30000);
    expect(readCall, 'Expected to find a read_file tool call').toBe(true);

    await rig.waitForText('1.0.0', 30000);

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

    expect(toolCall, 'Expected to find a write_file or replace tool call').toBe(
      true,
    );

    const newFileContent = rig.readFile(fileName);
    expect(newFileContent).toBe('1.0.1');
  });
});
