/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test } from 'node:test';
import { TestRig } from './test-helper.js';

test('should be able to read a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to read a file');
  rig.createFile('test.txt', 'hello world');

  const result = await rig.run(
    `read the file test.txt and show me its contents`,
  );

  const foundToolCall = await rig.waitForToolCall('read_file');

  assert.ok(foundToolCall, 'Expected to find a read_file tool call');
  assert.ok(
    result.includes('hello world'),
    'Expected output to include file contents',
  );
});

test('should be able to write a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to write a file');
  rig.createFile('test.txt', '');

  await rig.run(`edit test.txt to have a hello world message`);

  const foundWriteToolCall = await rig.waitForToolCall('write_file');

  assert.ok(foundWriteToolCall, 'Expected to find a write_file tool call');

  const fileContent = rig.readFile('test.txt');
  assert.ok(
    fileContent.toLowerCase().includes('hello'),
    'Expected file to contain hello',
  );
});
