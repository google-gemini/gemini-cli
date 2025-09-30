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

  it('should send tool calls to the IDE server', async () => {
    rig = new TestRig();
    rig.setup('ide-client-test');

    server = new TestMcpServer();
    const port = await server.start();

    // Set env vars to make the CLI think it's connected to an IDE
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = String(port);
    process.env['TERM_PROGRAM'] = 'vscode';
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = rig.testDir!;

    const prompt =
      "Please create a file named 'test.txt' with the content 'hello world'";
    await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('write_file');

    expect(
      foundToolCall,
      'Expected to find a write_file tool call',
    ).toBeTruthy();
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
