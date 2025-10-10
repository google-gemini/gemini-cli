/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { TestMcpServer } from './test-mcp-server.js';
import { TestRig } from './test-helper.js';
import type { IPty } from '@lydell/node-pty';
import { IdeClient } from '@google/gemini-cli-core';

describe('IDE client', () => {
  let rig: TestRig;
  let server: TestMcpServer | undefined;
  let ptyProcess: IPty | undefined;

  beforeEach(() => {
    IdeClient.resetForTesting();
  });

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    if (ptyProcess && ptyProcess.pid) {
      try {
        process.kill(ptyProcess.pid);
      } catch {
        // Ignore errors if the process is already dead
      }
    }
    ptyProcess = undefined;
    await rig?.cleanup();

    // Clean up environment variables
    delete process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    delete process.env['TERM_PROGRAM'];
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
  });

  it('should trigger openDiff when editing a file in IDE mode', async () => {
    // 1. Start the mock server.
    server = new TestMcpServer();
    const port = await server.start();

    // 2. Set up the TestRig.
    rig = new TestRig();
    rig.setup('ide-open-diff-test');
    rig.createFile('test.txt', 'original content');

    // 3. Run the CLI in interactive mode with the necessary environment variables.
    const prompt =
      'Please use the `write_file` tool to replace the content in `test.txt` from "original" to "new"';
    const env = {
      GEMINI_CLI_IDE_SERVER_PORT: String(port),
      TERM_PROGRAM: 'vscode',
      GEMINI_CLI_IDE_WORKSPACE_PATH: rig.testDir!,
    };
    const run = rig.runInteractive({ env }, '--prompt', prompt);
    ptyProcess = run.ptyProcess;

    // 4. Wait until the server receives the openDiff request.
    await vi.waitUntil(() => server!.getOpenDiffSpy().mock.calls.length > 0, {
      timeout: 30000, // 30 second timeout
    });

    // 5. If we reach here, the spy was called. Assert the call.
    expect(server.getOpenDiffSpy()).toHaveBeenCalled();
  });
});
