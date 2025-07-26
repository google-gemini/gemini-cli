/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test.skip('should be able to read multiple files', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  const file1 = rig.createFile('file1.txt', 'file 1 content');
  const file2 = rig.createFile('file2.txt', 'file 2 content');

  const prompt = `Read the files in this directory, list them and print them to the screen`;
  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('read_many_files');
  assert.deepEqual(toolCall, {
    tool_name: 'read_many_files',
    args: {
      paths: [file1, file2],
    },
  });

  const result = await cliPromise;
  assert.ok(result.includes('file 1 content'));
  assert.ok(result.includes('file 2 content'));
});
