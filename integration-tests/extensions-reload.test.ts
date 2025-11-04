/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe } from 'vitest';
import { TestRig } from './test-helper.js';
import { TestMcpServer } from './test-mcp-server.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonStringify } from '@google/gemini-cli-core/src/utils/safeJsonStringify.js';
import { env } from 'node:process';
import { platform } from 'node:os';

const itIf = (condition: boolean) => (condition ? it : it.skip);

describe('extension reloading', () => {
  const sandboxEnv = env['GEMINI_SANDBOX'];

  // Fails in sandbox mode, can't check for local extension updates.
  itIf((!sandboxEnv || sandboxEnv === 'false') && platform() !== 'win32')(
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

      const rig = new TestRig();
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
      const run = await rig.runInteractive('--debug');
      await run.expectText('You have 1 extension with an update available');
      // See the outdated extension
      await run.sendText('/extensions list');
      await run.type('\r');
      await run.expectText(
        'test-extension (v0.0.1) - active (update available)',
      );
      await run.sendText('/mcp list');
      await run.type('\r');
      await run.expectText(
        'test-server (from test-extension) - Ready (1 tool)',
      );
      await run.expectText('- hello');

      // Update the extension, expect the list to update, and mcp servers as well.
      await run.sendText('/extensions update test-extension');
      await run.type('\r');
      await run.expectText(
        ` * test-server (remote): http://localhost:${portB}/mcp`,
      );
      await run.type('\r'); // consent
      await run.expectText(
        'Extension "test-extension" successfully updated: 0.0.1 → 0.0.2',
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await run.sendText('/extensions list');
      await run.type('\r');
      await run.expectText('test-extension (v0.0.2) - active (updated)');
      await run.sendText('/mcp list');
      await run.type('\r');
      await run.expectText(
        'test-server (from test-extension) - Ready (1 tool)',
      );
      await run.expectText('- goodbye');
      await run.sendText('/quit');
      await run.sendKeys('\r');

      // Clean things up.
      await serverA.stop();
      await serverB.stop();
      await rig.runCommand(['extensions', 'uninstall', 'test-extension']);
      await rig.cleanup();
    },
  );
});
