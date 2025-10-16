/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
  poll,
  printDebugInfo,
  validateModelOutput,
} from './test-helper.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('list_directory', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async (ctx) => {
    await rig.cleanup(ctx);
  });

  it('should be able to list a directory', async () => {
    await rig.setup('should be able to list a directory');
    rig.createFile('file1.txt', 'file 1 content');
    rig.mkdir('subdir');
    rig.sync();

    // Poll for filesystem changes to propagate in containers
    await poll(
      () => {
        // Check if the files exist in the test directory
        const file1Path = join(rig.testDir!, 'file1.txt');
        const subdirPath = join(rig.testDir!, 'subdir');
        return existsSync(file1Path) && existsSync(subdirPath);
      },
      1000, // 1 second max wait
      50, // check every 50ms
    );

    const prompt = `Can you list the files in the current directory.`;

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

    expect(
      foundToolCall,
      'Expected to find a list_directory tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(result, ['file1.txt', 'subdir'], 'List directory test');
  });
});
