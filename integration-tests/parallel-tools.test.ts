/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import fs from 'node:fs';

describe('Parallel Tool Execution Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should execute [read, read, write, read, read] in correct waves with user approval', async () => {
    rig.setup('parallel-wave-execution', {
      fakeResponsesPath: join(import.meta.dirname, 'parallel-tools.responses'),
      settings: {
        tools: {
          core: ['read_file', 'write_file'],
          approval: 'ASK', // Disable YOLO mode to show permission prompts
          confirmationRequired: ['write_file'],
        },
      },
    });

    rig.createFile('file1.txt', 'c1');
    rig.createFile('file2.txt', 'c2');
    rig.createFile('file3.txt', 'c3');
    rig.createFile('file4.txt', 'c4');
    rig.sync();

    const run = await rig.runInteractive({ approvalMode: 'default' });

    // 1. Trigger the wave
    await run.type('ok');
    await run.type('\r');

    // 3. Wait for the write_file prompt.
    await run.expectText('Allow', 5000);

    // 4. Press Enter to approve the write_file.
    await run.type('y');
    await run.type('\r');

    // 5. Wait for the final model response
    await run.expectText('All waves completed successfully.', 5000);

    // Verify all tool calls were made and succeeded in the logs
    await rig.expectToolCallSuccess(['write_file']);
    const toolLogs = rig.readToolLogs();

    const readFiles = toolLogs.filter(
      (l) => l.toolRequest.name === 'read_file',
    );
    const writeFiles = toolLogs.filter(
      (l) => l.toolRequest.name === 'write_file',
    );

    expect(readFiles.length).toBe(4);
    expect(writeFiles.length).toBe(1);
    expect(toolLogs.every((l) => l.toolRequest.success)).toBe(true);

    // Check that output.txt was actually written
    expect(fs.readFileSync(join(rig.testDir!, 'output.txt'), 'utf8')).toBe(
      'wave2',
    );
  });
});
