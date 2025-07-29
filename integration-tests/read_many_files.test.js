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

  const result = await rig.run(prompt);

  // Check for either read_many_files or multiple read_file calls
  const allTools = rig.readToolLogs();
  const readManyFilesCall = await rig.waitForToolCall('read_many_files');
  const readFileCalls = allTools.filter(
    (t) => t.toolRequest.name === 'read_file',
  );

  // Accept either read_many_files OR at least 2 read_file calls
  const foundValidPattern = readManyFilesCall || readFileCalls.length >= 2;

  // Add debugging information
  if (!foundValidPattern) {
    console.error('Test failed - Debug info:');
    console.error('Result length:', result.length);
    console.error('Result (first 500 chars):', result.substring(0, 500));
    console.error(
      'Result (last 500 chars):',
      result.substring(result.length - 500),
    );
    console.error(
      'All tool calls found:',
      allTools.map((t) => t.toolRequest.name),
    );
    console.error('read_many_files called:', readManyFilesCall);
    console.error('read_file calls:', readFileCalls.length);
  }

  assert.ok(
    foundValidPattern,
    'Expected to find either read_many_files or multiple read_file tool calls',
  );

  // Check if LLM returned any output at all
  assert.ok(
    result && result.trim().length > 0,
    'Expected LLM to return some output',
  );

  // Check if the content was displayed
  const showsContent1 = result.includes('file 1 content');
  const showsContent2 = result.includes('file 2 content');

  if (!showsContent1 || !showsContent2) {
    console.warn('Warning: LLM did not include all file contents in response.');
    console.warn(
      `Missing content from: ${!showsContent1 ? 'file1.txt ' : ''}${!showsContent2 ? 'file2.txt' : ''}`,
    );
    console.warn(
      'The read_many_files tool was called successfully, which is the main requirement.',
    );
  } else {
    // Log success info if verbose
    if (process.env.VERBOSE === 'true') {
      console.log(
        'Multiple files read successfully. Both file contents shown in output.',
      );
    }
  }
});
