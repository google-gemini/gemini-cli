/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to write a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to write a file');
  const prompt = `show me an example of using the write tool. put a dad joke in dad.txt`;

  await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('write_file');

  assert.ok(foundToolCall, 'Expected to find a write_file tool call');

  const newFilePath = 'dad.txt';

  const newFileContent = rig.readFile(newFilePath);
  assert.notEqual(newFileContent, '');
});
