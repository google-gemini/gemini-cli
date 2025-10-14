/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestMcpServer } from './test-mcp-server.js';
import { TestRig } from './test-helper.js';

describe('IDE client', () => {
  let rig: TestRig;
  let server: TestMcpServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
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
      'Using the openDiff tool, replace the content in `test.txt` from "original" to "new"';
    const host =
      process.env['GEMINI_SANDBOX'] === 'docker' ||
      process.env['GEMINI_SANDBOX'] === 'podman'
        ? 'host.docker.internal'
        : '127.0.0.1';
    const env = {
      GEMINI_CLI_IDE_SERVER_HOST: host,
      GEMINI_CLI_IDE_SERVER_PORT: String(port),
      TERM_PROGRAM: 'vscode',
      GEMINI_CLI_IDE_WORKSPACE_PATH: rig.testDir!,
    };
    const run = await rig.runInteractive({
      env,
      args: ['/ide', 'enable'],
      waitForPrompt: false,
    });

    // Wait for the command to execute and IDE to connect.
    await run.expectText('IDE integration has been enabled');

    await run.type(prompt);
    await run.type('\r');

    const prematureExitPromise = run.expectExit().then(() => {
      return Promise.reject(
        new Error(`PTY process exited prematurely with output:\n${run.output}`),
      );
    });

    const serverPromise = vi.waitUntil(
      () => server!.getOpenDiffSpy().mock.calls.length > 0,
      {
        timeout: 30000, // 30 second timeout
      },
    );

    await Promise.race([prematureExitPromise, serverPromise]);

    // If we reach here, serverPromise resolved first. Assert the spy was called.
    expect(server.getOpenDiffSpy()).toHaveBeenCalled();
  }, 60000);
});
