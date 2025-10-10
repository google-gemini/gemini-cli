/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
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
    const prompt = 'replace the content in `test.txt` from "original" to "new"';
    const env = {
      GEMINI_CLI_IDE_SERVER_PORT: String(port),
      TERM_PROGRAM: 'vscode',
      GEMINI_CLI_IDE_WORKSPACE_PATH: rig.testDir!,
    };
    const run = rig.runInteractive({ env }, '--prompt', prompt);
    ptyProcess = run.ptyProcess;

    // 5. Race two promises:
    //    - prematureExitPromise: Fails the test if the CLI exits before the spy is called.
    //    - serverPromise: Succeeds the test if the spy is called.
    const prematureExitPromise = run.promise.then(({ output }) => {
      const errorReportPathMatch = output.match(
        /Full report available at: (.*\.json)/,
      );
      let reportContent = 'No error report file found.';
      if (errorReportPathMatch && errorReportPathMatch[1]) {
        try {
          // In the CI environment, the path is inside the container.
          // We assume the /tmp directory is readable.
          reportContent = fs.readFileSync(errorReportPathMatch[1], 'utf-8');
        } catch (e) {
          reportContent = `Error reading report file: ${(e as Error).message}`;
        }
      }
      return Promise.reject(
        new Error(
          `PTY process exited prematurely with output:\n${output}\n\nError Report:\n${reportContent}`,
        ),
      );
    });

    const serverPromise = vi.waitUntil(
      () => server!.getOpenDiffSpy().mock.calls.length > 0,
      {
        timeout: 30000, // 30 second timeout
      },
    );

    await Promise.race([prematureExitPromise, serverPromise]);

    // 6. If we reach here, serverPromise resolved first. Assert the spy was called.
    expect(server.getOpenDiffSpy()).toHaveBeenCalled();
  });
});
