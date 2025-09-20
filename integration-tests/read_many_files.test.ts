/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('read_many_files', () => {
  it('should be able to read multiple files', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to read multiple files');
    rig.createFile('file1.txt', 'file 1 content');
    rig.createFile('file2.txt', 'file 2 content');

    const prompt = `Use the read_many_files tool to read the contents of file1.txt and file2.txt and then print the contents of each file.`;

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

    expect(
      foundValidPattern,
      'Expected to find either read_many_files or multiple read_file tool calls',
    ).toBeTruthy();

    // Validate model output - will throw if no output
    validateModelOutput(result, null, 'Read many files test');
  });
});
