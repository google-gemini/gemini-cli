/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
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

  afterEach(async () => await rig.cleanup());

  it('should be able to list a directory', async () => {
    await rig.setup('should be able to list a directory', {
      settings: { tools: { core: ['list_directory'] } },
    });
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

    const result = await rig.run({ args: prompt });

    try {
      await rig.expectToolCallSuccess(['list_directory']);
    } catch (e) {
      // Add debugging information
      if (!result.includes('file1.txt') || !result.includes('subdir')) {
        const allTools = printDebugInfo(rig, result, {
          'Found tool call': false,
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
      throw e;
    }

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(result, ['file1.txt', 'subdir'], 'List directory test');
  });
});
