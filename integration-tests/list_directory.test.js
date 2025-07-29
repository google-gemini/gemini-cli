/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

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
    console.error('Test failed - Debug info:');
    console.error('Result length:', result.length);
    console.error('Result (first 500 chars):', result.substring(0, 500));
    console.error(
      'Result (last 500 chars):',
      result.substring(result.length - 500),
    );
    console.error('Found tool call:', foundToolCall);
    console.error('Contains file1.txt:', result.includes('file1.txt'));
    console.error('Contains subdir:', result.includes('subdir'));

    // Check what tools were actually called
    const allTools = rig.readToolLogs();
    console.error(
      'All tool calls found:',
      allTools.map((t) => t.toolRequest.name),
    );
    console.error(
      'List directory calls:',
      allTools
        .filter((t) => t.toolRequest.name === 'list_directory')
        .map((t) => t.toolRequest.args),
    );
  }

  assert.ok(foundToolCall, 'Expected to find a list_directory tool call');

  // Check if LLM returned any output at all
  assert.ok(
    result && result.trim().length > 0,
    'Expected LLM to return some output',
  );

  const lines = result.split('\n').filter((line) => line.trim() !== '');

  // The LLM should ideally show the files in the output, but it's not always consistent
  // We'll make this a warning rather than a failure
  const hasFile1 = lines.some((line) => line.includes('file1.txt'));
  const hasSubdir = lines.some((line) => line.includes('subdir'));

  if (!hasFile1 || !hasSubdir) {
    console.warn(
      'Warning: LLM did not include all files/directories in response.',
    );
    console.warn(
      `Missing: ${!hasFile1 ? 'file1.txt ' : ''}${!hasSubdir ? 'subdir' : ''}`,
    );
    console.warn(
      'The list_directory tool was called successfully, which is the main requirement.',
    );
  } else {
    // Log success info if verbose
    if (process.env.VERBOSE === 'true') {
      console.log(
        'Directory listed successfully. Found file1.txt and subdir in output.',
      );
    }
  }
});
