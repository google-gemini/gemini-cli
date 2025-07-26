/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to write a file', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  const prompt = `show me an example of using the write tool. put a dad joke in dad.txt`;

  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('write_file');
  assert.strictEqual(toolCall.tool_name, 'write_file');
  assert.strictEqual(toolCall.args.file_path, 'dad.txt');
  assert.ok(toolCall.args.content.length > 0);

  await cliPromise;

  const newFilePath = 'dad.txt';

  const newFileContent = rig.readFile(newFilePath);
  assert.notEqual(newFileContent, '');
});
