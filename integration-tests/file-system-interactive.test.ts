/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('Interactive file system', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should perform a read-then-write sequence', async () => {
    const fileName = 'version.txt';
    rig.setup('interactive-read-then-write');
    rig.createFile(fileName, '1.0.0');

    const run = await rig.runInteractive();

    // Step 1: Read the file
    const readPrompt = `Read the version from ${fileName}`;
    await run.type(readPrompt);
    await run.sendKeys('\r');

    const readCall = await rig.waitForToolCall('read_file', 30000);
    expect(readCall, 'Expected to find a read_file tool call').toBe(true);

    // Step 2: Write the file
    const writePrompt = `now change the version to 1.0.1 in the file`;
    await run.type(writePrompt);
    await run.sendKeys('\r');

    // Check tool calls made with right args
    await rig.expectToolCallSuccess(
      ['write_file', 'replace'],
      30000,
      (args) => args.includes('1.0.1') && args.includes(fileName),
    );
  });
});
