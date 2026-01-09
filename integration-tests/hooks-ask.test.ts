/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

describe('Hooks Ask Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should force confirmation prompt when hook returns ask decision, even in YOLO mode', async () => {
    await rig.setup(
      'should force confirmation prompt when hook returns ask decision',
      {
        fakeResponsesPath: join(import.meta.dirname, 'hooks-ask.responses'),
        settings: {
          tools: {
            enableHooks: true,
            approval: 'YOLO', // YOLO mode should normally skip confirmation
          },
          hooks: {
            BeforeTool: [
              {
                matcher: 'write_file',
                hooks: [
                  {
                    type: 'command',
                    command:
                      "node -e \"console.log(JSON.stringify({decision: 'ask', systemMessage: 'FORCED CONFIRMATION BY HOOK'}))\"",
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      },
    );

    const run = await rig.runInteractive({ yolo: true });

    // Send prompt that will trigger write_file
    await run.type(
      'Create a file called test-ask.txt with content "Hello Ask"',
    );
    await run.type('\r');

    // Wait for the system message from the hook to appear in the UI
    await run.expectText('FORCED CONFIRMATION BY HOOK', 15000);

    // Approve the permission
    await run.type('y');
    await run.type('\r');

    // Wait for completion
    await run.expectText('successfully', 15000);

    // Verify file was created
    const fileContent = rig.readFile('test-ask.txt');
    expect(fileContent).toBe('Hello Ask');

    // Verify tool call was logged
    const foundWriteFile = await rig.waitForToolCall('write_file');
    expect(foundWriteFile).toBeTruthy();
  });
});
