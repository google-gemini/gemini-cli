/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig, InteractiveRun } from './test-helper.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  writeFileSync,
  mkdirSync,
  symlinkSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { GEMINI_DIR } from '@google/gemini-cli-core';
import * as pty from '@lydell/node-pty';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '..', 'bundle/gemini.js');

const extension = `{
  "name": "test-symlink-extension",
  "version": "0.0.1"
}`;

const otherExtension = `{
  "name": "malicious-extension",
  "version": "6.6.6"
}`;

describe('extension symlink install spoofing protection', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('canonicalizes the trust path and prevents symlink spoofing', async () => {
    // Enable folder trust for this test
    rig.setup('symlink spoofing test', {
      settings: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
    });

    const realExtPath = join(rig.testDir!, 'real-extension');
    mkdirSync(realExtPath);
    writeFileSync(join(realExtPath, 'gemini-extension.json'), extension);

    const maliciousExtPath = join(
      os.tmpdir(),
      `malicious-extension-${Date.now()}`,
    );
    mkdirSync(maliciousExtPath);
    writeFileSync(
      join(maliciousExtPath, 'gemini-extension.json'),
      otherExtension,
    );

    const symlinkPath = join(rig.testDir!, 'symlink-extension');
    symlinkSync(realExtPath, symlinkPath);

    // Function to run a command with a PTY to avoid headless mode
    const runPty = (args: string[]) => {
      const ptyProcess = pty.spawn(process.execPath, [BUNDLE_PATH, ...args], {
        name: 'xterm-color',
        cols: 80,
        rows: 80,
        cwd: rig.testDir!,
        env: {
          ...process.env,
          GEMINI_CLI_HOME: rig.homeDir!,
          GEMINI_CLI_INTEGRATION_TEST: 'true',
          GEMINI_PTY_INFO: 'node-pty',
        },
      });
      return new InteractiveRun(ptyProcess);
    };

    // 1. Install via symlink, trust it
    const run1 = runPty(['extensions', 'install', symlinkPath]);
    await run1.expectText('Do you want to trust this folder', 30000);
    await run1.type('y\r');
    await run1.expectText('trust this workspace', 30000);
    await run1.type('y\r');
    await run1.expectText('Do you want to continue', 30000);
    await run1.type('y\r');
    await run1.expectText('installed successfully', 30000);
    await run1.kill();

    // 2. Verify trustedFolders.json contains the REAL path, not the symlink path
    const trustedFoldersPath = join(
      rig.homeDir!,
      GEMINI_DIR,
      'trustedFolders.json',
    );
    // Wait for file to be written
    let attempts = 0;
    while (!fs.existsSync(trustedFoldersPath) && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    const trustedFolders = JSON.parse(
      readFileSync(trustedFoldersPath, 'utf-8'),
    );
    const trustedPaths = Object.keys(trustedFolders);
    const canonicalRealExtPath = fs.realpathSync(realExtPath);

    expect(trustedPaths).toContain(canonicalRealExtPath);
    expect(trustedPaths).not.toContain(symlinkPath);

    // 3. Swap the symlink to point to the malicious extension
    unlinkSync(symlinkPath);
    symlinkSync(maliciousExtPath, symlinkPath);

    // 4. Try to install again via the same symlink path.
    // It should NOT be trusted because the real path changed.
    const run2 = runPty(['extensions', 'install', symlinkPath]);
    await run2.expectText('Do you want to trust this folder', 30000);
    await run2.type('n\r');
    await run2.expectText('Installation aborted', 30000);
    await run2.kill();
  }, 60000);
});
