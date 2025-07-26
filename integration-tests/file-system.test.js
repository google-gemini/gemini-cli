/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test } from 'node:test';
import { TestRig } from './test-helper.js';

test('reads a file', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  const testFile = rig.createFile('test.txt', 'hello world');

  const cliPromise = rig.run(`read the file name test.txt`);

  const toolCall = await rig.waitForToolCall('read_file');
  assert.deepEqual(toolCall, {
    tool_name: 'read_file',
    args: { absolute_path: testFile },
  });

  await cliPromise;
});

test('writes a file', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  const testFile = rig.createFile('test.txt', '');

  const cliPromise = rig.run(`edit test.txt to have a hello world message`);

  const toolCall = await rig.waitForToolCall('write_file');
  assert.deepEqual(toolCall, {
    tool_name: 'write_file',
    args: {
      file_path: testFile,
      content: 'hello world',
    },
  });

  await cliPromise;

  const fileContent = rig.readFile('test.txt');
  assert.ok(fileContent.toLowerCase().includes('hello'));
});
