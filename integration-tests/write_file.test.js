/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { TestRig, createToolCallErrorMessage } from './test-helper.js';

test('should be able to write a file', async () => {
  const rig = new TestRig();
  await rig.setup('should be able to write a file');
  const prompt = `show me an example of using the write tool. put a dad joke in dad.txt`;

  const result = await rig.run(prompt);

  const foundToolCall = await rig.waitForToolCall('write_file');

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

  const allTools = rig.readToolLogs();
  assert.ok(
    foundToolCall,
    createToolCallErrorMessage(
      'write_file',
      allTools.map((t) => t.toolRequest.name),
      result,
    ),
  );

  // Check if LLM returned any output at all
  assert.ok(
    result && result.trim().length > 0,
    'Expected LLM to return some output',
  );

  const newFilePath = 'dad.txt';

  const newFileContent = rig.readFile(newFilePath);

  // Add debugging for file content
  if (newFileContent === '') {
    console.error('File was created but is empty');
    console.error(
      'Tool calls:',
      rig.readToolLogs().map((t) => ({
        name: t.toolRequest.name,
        args: t.toolRequest.args,
      })),
    );
  }

  assert.notEqual(newFileContent, '', 'Expected file to have content');

  // Log success info if verbose
  if (process.env.VERBOSE === 'true') {
    console.log(
      'File created successfully with content:',
      newFileContent.substring(0, 100) + '...',
    );
  }
});
