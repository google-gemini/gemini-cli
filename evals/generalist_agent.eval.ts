/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('generalist_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should be able to use generalist agent by explicitly asking the main agent to invoke it',
    params: {
      settings: {
        agents: {
          overrides: {
            generalist: { enabled: true },
          },
        },
      },
    },
    prompt:
      'Please use the generalist agent to create a file called "generalist_test_file.txt" containing exactly the following text: success',
    assert: async (rig) => {
      // 1) Verify the generalist agent was invoked
      const foundToolCall = await rig.waitForToolCall('generalist');
      expect(
        foundToolCall,
        'Expected to find a tool call for generalist agent',
      ).toBeTruthy();

      // 2) Verify the file was created as expected
      const filePath = path.join(rig.testDir!, 'generalist_test_file.txt');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.trim()).toBe('success');
    },
  });
});
