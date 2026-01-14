/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { TestMcpServer } from './test-mcp-server.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonStringify } from '@google/gemini-cli-core/src/utils/safeJsonStringify.js';
import { env } from 'node:process';
import { platform } from 'node:os';

import stripAnsi from 'strip-ansi';

const itIf = (condition: boolean) => (condition ? it : it.skip);

describe('extension reloading', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  const sandboxEnv = env['GEMINI_SANDBOX'];
  // Fails in linux non-sandbox e2e tests
  // TODO(#14527): Re-enable this once fixed
  // Fails in sandbox mode, can't check for local extension updates.
  itIf(
    (!sandboxEnv || sandboxEnv === 'false') &&
      platform() !== 'win32' &&
      platform() !== 'linux',
  )(
    'installs a local extension, updates it, checks it was reloaded properly',
    async () => {
      const serverA = new TestMcpServer();
      const portA = await serverA.start({
        hello: () => ({ content: [{ type: 'text', text: 'world' }] }),
      });
      const extension = {
        name: 'test-extension',
        version: '0.0.1',
        mcpServers: {
          'test-server': {
            httpUrl: `http://localhost:${portA}/mcp`,
          },
        },
      };

      rig.setup('extension reload test', {
        settings: {
          experimental: { extensionReloading: true },
        },
      });
      const testServerPath = join(rig.testDir!, 'gemini-extension.json');
      writeFileSync(testServerPath, safeJsonStringify(extension, 2));
      // defensive cleanup from previous tests.
      try {
        await rig.runCommand(['extensions', 'uninstall', 'test-extension']);
      } catch {
        /* empty */
      }

      const result = await rig.runCommand(
        ['extensions', 'install', `${rig.testDir!}`],
        { stdin: 'y\n' },
      );
      expect(result).toContain('test-extension');

      // Now create the update, but its not installed yet
      const serverB = new TestMcpServer();
      const portB = await serverB.start({
        goodbye: () => ({ content: [{ type: 'text', text: 'world' }] }),
      });
      extension.version = '0.0.2';
      extension.mcpServers['test-server'].httpUrl =
        `http://localhost:${portB}/mcp`;
      writeFileSync(testServerPath, safeJsonStringify(extension, 2));

      // Start the CLI.
      const run = await rig.runInteractive({ args: '--debug' });
      await run.expectText('You have 1 extension with an update available');
      // See the outdated extension
      await run.sendText('/extensions list');
      await run.type('\r');
      await run.expectText(
        'test-extension (v0.0.1) - active (update available)',
      );
      // Wait for the UI to settle and retry the command until we see the update
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Poll for the updated list
      await rig.pollCommand(
        async () => {
          await run.sendText('/mcp list');
          await run.type('\r');
        },
        () => {
          const output = stripAnsi(run.output);
          return (
            output.includes(
              'test-server (from test-extension) - Ready (1 tool)',
            ) && output.includes('- hello')
          );
        },
        30000, // 30s timeout
      );

      // Update the extension, expect the list to update, and mcp servers as well.
      await run.sendKeys('\u0015/extensions update test-extension');
      await run.expectText('/extensions update test-extension');
      await run.type('\r');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await run.type('\r');
      await run.expectText(
        ` * test-server (remote): http://localhost:${portB}/mcp`,
      );
      await run.type('\r'); // consent
      await run.expectText(
        'Extension "test-extension" successfully updated: 0.0.1 → 0.0.2',
      );

      // Poll for the updated extension version
      await rig.pollCommand(
        async () => {
          await run.sendText('/extensions list');
          await run.type('\r');
        },
        () =>
          stripAnsi(run.output).includes(
            'test-extension (v0.0.2) - active (updated)',
          ),
        30000,
      );

      // Poll for the updated mcp tool
      await rig.pollCommand(
        async () => {
          await run.sendText('/mcp list');
          await run.type('\r');
        },
        () => {
          const output = stripAnsi(run.output);
          return (
            output.includes(
              'test-server (from test-extension) - Ready (1 tool)',
            ) && output.includes('- goodbye')
          );
        },
        30000,
      );

      await run.sendText('/quit');
      await run.type('\r');

      // Clean things up.
      await serverA.stop();
      await serverB.stop();
      await rig.runCommand(['extensions', 'uninstall', 'test-extension']);
    },
  );
});
