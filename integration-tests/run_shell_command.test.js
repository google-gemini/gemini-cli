/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to run a shell command', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('blah.txt', 'some content');

  const prompt = `Can you use ls to list the contexts of the current folder`;
  const cliPromise = rig.run(prompt);

  const toolCall = await rig.waitForToolCall('run_shell_command');
  assert.deepEqual(toolCall, {
    tool_name: 'run_shell_command',
    args: {
      command: 'ls',
    },
  });

  const result = await cliPromise;
  assert.ok(result.includes('blah.txt'));
});

test('should be able to run a shell command via stdin', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  rig.createFile('blah.txt', 'some content');

  const prompt = `Can you use ls to list the contexts of the current folder`;
  const cliPromise = rig.run({ stdin: prompt });

  const toolCall = await rig.waitForToolCall('run_shell_command');
  assert.deepEqual(toolCall, {
    tool_name: 'run_shell_command',
    args: {
      command: 'ls',
    },
  });

  const result = await cliPromise;
  assert.ok(result.includes('blah.txt'));
});
