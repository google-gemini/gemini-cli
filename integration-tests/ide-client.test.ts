/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import { TestMcpServer } from './test-mcp-server.js';
import { TestRig } from './test-helper.js';

describe('IDE client', () => {
  let rig: TestRig;
  let server: TestMcpServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    await rig?.cleanup();

    // Cleanup env vars
    delete process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    delete process.env['TERM_PROGRAM'];
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
  });

  it('should trigger openDiff when editing a file in IDE mode', async () => {
    // The TestRig spawns the Gemini CLI in a separate child process.
    // Therefore, we cannot spy on the IdeClient directly in this test process.
    // Instead, we spy on the mock server to verify that it receives the
    // openDiff request from the CLI process.
    server = new TestMcpServer();
    const port = await server.start();
    console.log(`[DEBUG] TestMcpServer started on port: ${port}`);

    // 2. Configure the Environment by setting all necessary env vars.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GEMINI_CLI_IDE_SERVER_PORT: String(port),
      TERM_PROGRAM: 'vscode',
    };
    console.log(
      `[DEBUG] Set env vars: GEMINI_CLI_IDE_SERVER_PORT=${env['GEMINI_CLI_IDE_SERVER_PORT']}, TERM_PROGRAM=${env['TERM_PROGRAM']}`,
    );

    // 3. Set up the Workspace.
    rig = new TestRig();
    rig.setup('ide-open-diff-test');
    env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = rig.testDir!;
    rig.createFile('test.txt', 'original content');

    // 4. Run the Action.
    // Use a prompt that prints the environment variables to debug CI.
    console.log('[DEBUG] Calling rig.run...');
    const prompt =
      'run the command "printenv | grep -E \'TERM_PROGRAM|GEMINI_CLI_IDE_SERVER_PORT\'"';
    await rig.run({ prompt, env });
    console.log('[DEBUG] rig.run completed.');

    // Assert that the spy was called (this is expected to fail).
    expect(server.getOpenDiffSpy()).toHaveBeenCalled();
  });

  it('should allow the CLI to work correctly even if it fails to connect to the IDE', async () => {
    rig = new TestRig();
    rig.setup('ide-port-file-missing-test');

    // Enable IDE mode, but do not create a port file or start a server.
    process.env['TERM_PROGRAM'] = 'vscode';
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = rig.testDir!;

    // Run a simple command that does not require the IDE.
    const result = await rig.run(
      "write a file named 'success.txt' with the content 'it works'",
    );

    // The CLI is designed to fail the IDE connection silently if the port file
    // is missing. First, we assert that no connection error was thrown.
    // Then, we assert that the CLI still works correctly by checking if our
    // command executed successfully.
    const fileContent = rig.readFile('success.txt');
    expect(fileContent.trim()).toBe('it works');
    expect(result).not.toContain('IDE connection error');
  });
});
