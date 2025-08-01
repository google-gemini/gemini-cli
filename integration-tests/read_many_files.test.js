/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

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
    printDebugInfo(rig, result, {
      'read_many_files called': readManyFilesCall,
      'read_file calls': readFileCalls.length,
    });
  }

  assert.ok(
    foundValidPattern,
    'Expected to find either read_many_files or multiple read_file tool calls',
  );

  // Validate model output - will throw if no output, warn if missing expected content
  validateModelOutput(
    result,
    ['file 1 content', 'file 2 content'],
    'Read many files test',
  );
});
