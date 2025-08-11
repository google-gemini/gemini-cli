/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { TestRig } from './test-helper.js';
import * as fs from 'fs';
import * as path from 'path';

describe('extension-commands', () => {
  test('should run extension command', (t) => {
    const rig = new TestRig();
    rig.setup(t.name);

    const extensionDir = path.join(
      rig.testDir,
      '.gemini',
      'extensions',
      'my-extension',
    );
    const commandsDir = path.join(extensionDir, 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const extensionConfig = {
      name: 'my-extension',
      version: '1.0.0',
    };
    fs.writeFileSync(
      path.join(extensionDir, 'gemini-extension.json'),
      JSON.stringify(extensionConfig),
    );

    const command = `
name = "hello"
prompt = "echo hello from extension"
`;
    fs.writeFileSync(path.join(commandsDir, 'hello.toml'), command);

    const output = rig.run('/hello');
    assert.ok(output.includes('hello from extension'));
  });
});
