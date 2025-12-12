/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
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
    await rig.setup('interactive-read-then-write', {
      settings: {
        security: {
          auth: {
            selectedType: 'gemini-api-key',
          },
          disableYoloMode: false,
        },
      },
    });
    rig.createFile(fileName, '1.0.0');

    const run = await rig.runInteractive();

    // Step 1: Read the file
    const readPrompt = `Read the version from ${join(rig.workDir!, fileName)}`;
    await run.sendText(readPrompt);
    await run.sendText('\r');

    const readCall = await rig.waitForToolCall('read_file', 30000);
    expect(readCall, 'Expected to find a read_file tool call').toBe(true);

    // Step 2: Write the file
    const writePrompt = `now change the version to 1.0.1 in the file ${join(rig.workDir!, fileName)}`;
    await run.sendText(writePrompt);
    await run.sendText('\r');

    // Check tool calls made with right args
    await rig.expectToolCallSuccess(
      ['write_file', 'replace'],
      30000,
      (args) => args.includes('1.0.1') && args.includes(fileName),
    );

    // Wait for telemetry to flush and file system to sync, especially in sandboxed environments
    await rig.waitForTelemetryReady();
  });
});
