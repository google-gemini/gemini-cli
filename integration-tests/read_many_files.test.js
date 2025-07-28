/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to read multiple files', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to read multiple files');
  rig.createFile('file1.txt', 'file 1 content');
  rig.createFile('file2.txt', 'file 2 content');

  const prompt = `Please use read_many_files to read file1.txt and file2.txt and show me what's in them`;

  await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('read_many_files');

  assert.ok(foundToolCall, 'Expected to find a read_many_files tool call');
});
