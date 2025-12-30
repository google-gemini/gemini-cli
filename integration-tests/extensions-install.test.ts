/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  setupTestRig,
  cleanupTestRig,
  type LocalTestContext,
} from './test-helper.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const extension = `{
  "name": "test-extension-install",
  "version": "0.0.1"
}`;

const extensionUpdate = `{
  "name": "test-extension-install",
  "version": "0.0.2"
}`;

describe('extension install', () => {
  beforeEach<LocalTestContext>(setupTestRig);
  afterEach<LocalTestContext>(cleanupTestRig);

  it<LocalTestContext>('installs a local extension, verifies a command, and updates it', async ({
    rig,
  }) => {
    rig.setup('extension install test');
    const extensionSourceDir = join(rig.testDir!, 'extension-source');
    rig.mkdir('extension-source');
    const testServerPath = join(extensionSourceDir, 'gemini-extension.json');
    writeFileSync(testServerPath, extension);
    try {
      const result = await rig.runCommand(
        ['extensions', 'install', extensionSourceDir],
        { stdin: 'y\n' },
      );
      expect(result).toContain('test-extension-install');

      const listResult = await rig.runCommand(['extensions', 'list']);
      expect(listResult).toContain('test-extension-install');
      writeFileSync(testServerPath, extensionUpdate);
      const updateResult = await rig.runCommand([
        'extensions',
        'update',
        `test-extension-install`,
      ]);
      expect(updateResult).toContain('0.0.2');
    } finally {
      await rig.runCommand([
        'extensions',
        'uninstall',
        'test-extension-install',
      ]);
    }
  });
});
