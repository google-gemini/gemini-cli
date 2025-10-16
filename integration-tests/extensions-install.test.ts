/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, test, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const extension = `{
  "name": "test-extension",
  "version": "0.0.1"
}`;

const extensionUpdate = `{
  "name": "test-extension",
  "version": "0.0.2"
}`;

let rig: TestRig;

beforeEach(() => {
  rig = new TestRig();
});

afterEach(async (ctx) => {
  await rig.cleanup(ctx);
});

test('installs a local extension, verifies a command, and updates it', async () => {
  rig.setup('extension install test');
  const testServerPath = join(rig.testDir!, 'gemini-extension.json');
  writeFileSync(testServerPath, extension);
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

  const listResult = await rig.runCommand(['extensions', 'list']);
  expect(listResult).toContain('test-extension');
  writeFileSync(testServerPath, extensionUpdate);
  const updateResult = await rig.runCommand([
    'extensions',
    'update',
    `test-extension`,
  ]);
  expect(updateResult).toContain('0.0.2');

  await rig.runCommand(['extensions', 'uninstall', 'test-extension']);
});
