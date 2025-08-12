/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

test('should be able to replace content in a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to replace content in a file');

  const fileName = 'file_to_replace.txt';
  const originalContent = 'original content';
  const expectedContent = 'replaced content';

  rig.createFile(fileName, originalContent);
  const prompt = `Can you replace 'original' with 'replaced' in the file 'file_to_replace.txt'`;

  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('replace');

  // Add debugging information
  if (!foundToolCall) {
    printDebugInfo(rig, result);
  }

  assert.ok(foundToolCall, 'Expected to find a replace tool call');

  // Validate model output - will throw if no output, warn if missing expected content
  validateModelOutput(
    result,
    ['replaced', 'file_to_replace.txt'],
    'Replace content test',
  );

  const newFileContent = rig.readFile(fileName);

  // Add debugging for file content
  if (newFileContent !== expectedContent) {
    console.error('File content mismatch - Debug info:');
    console.error('Expected:', expectedContent);
    console.error('Actual:', newFileContent);
    console.error(
      'Tool calls:',
      rig.readToolLogs().map((t) => ({
        name: t.toolRequest.name,
        args: t.toolRequest.args,
      })),
    );
  }

  assert.strictEqual(
    newFileContent,
    expectedContent,
    'File content should be updated correctly',
  );

  // Log success info if verbose
  if (process.env.VERBOSE === 'true') {
    console.log('File replaced successfully. New content:', newFileContent);
  }
});
