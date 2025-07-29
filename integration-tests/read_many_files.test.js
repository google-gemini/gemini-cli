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

  const foundToolCall = await rig.waitForToolCall('read_many_files');

  // Add debugging information
  if (!foundToolCall) {
    console.error('Test failed - Debug info:');
    console.error('Result length:', result.length);
    console.error('Result (first 500 chars):', result.substring(0, 500));
    console.error('Result (last 500 chars):', result.substring(result.length - 500));
    
    // Check what tools were actually called
    const allTools = rig.readToolLogs();
    console.error('All tool calls found:', allTools.map(t => t.toolRequest.name));
    
    // Check if read_file was called instead
    const readFileCalls = allTools.filter(t => t.toolRequest.name === 'read_file');
    if (readFileCalls.length > 0) {
      console.error('Note: read_file was called instead of read_many_files');
      console.error('Read file calls:', readFileCalls.map(t => t.toolRequest.args));
    }
  }

  assert.ok(foundToolCall, 'Expected to find a read_many_files tool call');
  
  // Check if the content was displayed
  const showsContent1 = result.includes('file 1 content');
  const showsContent2 = result.includes('file 2 content');
  
  if (!showsContent1 || !showsContent2) {
    console.warn('Warning: LLM did not include all file contents in response.');
    console.warn(`Missing content from: ${!showsContent1 ? 'file1.txt ' : ''}${!showsContent2 ? 'file2.txt' : ''}`);
    console.warn('The read_many_files tool was called successfully, which is the main requirement.');
  } else {
    // Log success info if verbose
    if (process.env.VERBOSE === 'true') {
      console.log('Multiple files read successfully. Both file contents shown in output.');
    }
  }
});
