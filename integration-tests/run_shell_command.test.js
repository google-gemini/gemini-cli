/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

test('should be able to run a shell command', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to run a shell command');

  const prompt = `Please run: echo hello-world`;

  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('run_shell_command');

  assert.ok(foundToolCall, 'Expected to find a run_shell_command tool call');
  assert.ok(result.includes('hello-world'));
});

test('should be able to run a shell command via stdin', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to run a shell command via stdin');

  const prompt = `Please run: echo test-stdin`;

  const result = await rig.run({ stdin: prompt });

  const foundToolCall = await rig.waitForToolCall('run_shell_command');

  assert.ok(foundToolCall, 'Expected to find a run_shell_command tool call');
  assert.ok(result.includes('test-stdin'));
});
