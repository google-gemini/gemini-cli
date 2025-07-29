/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig } from './test-helper.js';

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
    console.error('Test failed - Debug info:');
    console.error('Result length:', result.length);
    console.error('Result (first 500 chars):', result.substring(0, 500));
    console.error(
      'Result (last 500 chars):',
      result.substring(result.length - 500),
    );

    // Check what tools were actually called
    const allTools = rig.readToolLogs();
    console.error(
      'All tool calls found:',
      allTools.map((t) => t.toolRequest.name),
    );
  }

  assert.ok(foundToolCall, 'Expected to find a replace tool call');

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
