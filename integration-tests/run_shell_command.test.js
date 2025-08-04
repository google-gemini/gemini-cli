/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

test('should be able to run a shell command', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to run a shell command');

  const prompt = `Please run the command "echo hello-world" and show me the output`;

  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('run_shell_command');

  // Add debugging information
  if (!foundToolCall || !result.includes('hello-world')) {
    printDebugInfo(rig, result, {
      'Found tool call': foundToolCall,
      'Contains hello-world': result.includes('hello-world'),
    });
  }

  assert.ok(foundToolCall, 'Expected to find a run_shell_command tool call');

  // Validate model output - will throw if no output, warn if missing expected content
  // Model often reports exit code instead of showing output
  validateModelOutput(
    result,
    ['hello-world', 'exit code 0'],
    'Shell command test',
  );
});

test('should be able to run a shell command via stdin', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to run a shell command via stdin');

  const prompt = `Please run the command "echo test-stdin" and show me what it outputs`;

  const result = await rig.run({ stdin: prompt });

  const foundToolCall = await rig.waitForToolCall('run_shell_command');

  // Add debugging information
  if (!foundToolCall || !result.includes('test-stdin')) {
    printDebugInfo(rig, result, {
      'Test type': 'Stdin test',
      'Found tool call': foundToolCall,
      'Contains test-stdin': result.includes('test-stdin'),
    });
  }

  assert.ok(foundToolCall, 'Expected to find a run_shell_command tool call');

  // Validate model output - will throw if no output, warn if missing expected content
  validateModelOutput(result, 'test-stdin', 'Shell command stdin test');
});
