/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to list a directory', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('file1.txt', 'file 1 content');
  rig.mkdir('subdir');
  rig.sync();

  const prompt = `Can you list the files in the current directory. Display them in the style of 'ls'`;
  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('list_directory');
  assert.deepEqual(toolCall, {
    tool_name: 'list_directory',
    args: {
      path: './',
    },
  });

  const result = await cliPromise;
  const lines = result.split('\n').filter((line) => line.trim() !== '');
  assert.ok(lines.some((line) => line.includes('file1.txt')));
  assert.ok(lines.some((line) => line.includes('subdir')));
});
