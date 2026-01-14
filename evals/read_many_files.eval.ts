/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  evalTest,
  validateModelOutput,
  printDebugInfo,
} from './test-helper.js';

describe('read_many_files', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should be able to read multiple files',
    params: {
      settings: { tools: { core: ['read_many_files', 'read_file'] } },
    },
    prompt:
      'Use the read_many_files tool to read the contents of file1.txt and file2.txt and then print the contents of each file.',
    beforeRun: async (rig) => {
      rig.createFile('file1.txt', 'file 1 content');
      rig.createFile('file2.txt', 'file 2 content');
    },
    assert: async (rig, result) => {
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
    },
  });
});
