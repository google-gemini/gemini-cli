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
    suiteName: 'default',
    suiteType: 'behavioral',
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
      // 1) Verify the generalist agent was invoked via invoke_agent
      const foundToolCall = await rig.waitForToolCall(
        'invoke_agent',
        undefined,
        (args) => {
          try {
            const parsed = JSON.parse(args);
            return parsed.agent_name === 'generalist';
          } catch {
            return false;
          }
        },
      );
      expect(
        foundToolCall,
        'Expected to find an invoke_agent tool call for generalist agent',
      ).toBeTruthy();

      // 2) Verify the file was created as expected
      const filePath = path.join(rig.testDir!, 'generalist_test_file.txt');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.trim()).toBe('success');
    },
  });
});
