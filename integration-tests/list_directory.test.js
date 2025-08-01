/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

test('should be able to list a directory', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to list a directory');
  rig.createFile('file1.txt', 'file 1 content');
  rig.mkdir('subdir');
  rig.sync();

  // Add explicit wait for filesystem changes to propagate in containers
  await new Promise((resolve) => setTimeout(resolve, 100));

  const prompt = `Can you list the files in the current directory. Display them in the style of 'ls'`;

  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('list_directory');

  // Add debugging information
  if (
    !foundToolCall ||
    !result.includes('file1.txt') ||
    !result.includes('subdir')
  ) {
    const allTools = printDebugInfo(rig, result, {
      'Found tool call': foundToolCall,
      'Contains file1.txt': result.includes('file1.txt'),
      'Contains subdir': result.includes('subdir'),
    });

    console.error(
      'List directory calls:',
      allTools
        .filter((t) => t.toolRequest.name === 'list_directory')
        .map((t) => t.toolRequest.args),
    );
  }

  assert.ok(foundToolCall, 'Expected to find a list_directory tool call');

  // Validate model output - will throw if no output, warn if missing expected content
  validateModelOutput(result, ['file1.txt', 'subdir'], 'List directory test');
});
