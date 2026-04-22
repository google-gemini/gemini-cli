/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Background Process Monitoring', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should naturally use read output tool to find token',
    prompt:
      "Run the script using 'bash generate_token.sh'. It will emit a token after a short delay and continue running. Find the token and tell me what it is.",
    files: {
      'generate_token.sh': `#!/bin/bash
sleep 2
echo "TOKEN=xyz123"
sleep 100
`,
    },
    setup: async (rig) => {
      // Create .gemini directory to avoid file system error in test rig
      if (rig.homeDir) {
        const geminiDir = path.join(rig.homeDir, '.gemini');
        fs.mkdirSync(geminiDir, { recursive: true });
      }
    },
    assert: async (rig, result) => {
      const toolCalls = rig.readToolLogs();

      // Check if read_background_output was called
      const hasReadCall = toolCalls.some(
        (call) => call.toolRequest.name === 'read_background_output',
      );

      expect(
        hasReadCall,
        'Expected agent to call read_background_output to find the token',
      ).toBe(true);

      // Verify that the agent found the correct token
      expect(
        result.includes('xyz123'),
        `Expected agent to find the token xyz123. Agent output: ${result}`,
      ).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should naturally use list tool to verify multiple processes',
    prompt:
      "Start three background processes that run 'sleep 100', 'sleep 200', and 'sleep 300' respectively. Verify that all three are currently running.",
    setup: async (rig) => {
      // Create .gemini directory to avoid file system error in test rig
      if (rig.homeDir) {
        const geminiDir = path.join(rig.homeDir, '.gemini');
        fs.mkdirSync(geminiDir, { recursive: true });
      }
    },
    assert: async (rig, result) => {
      const toolCalls = rig.readToolLogs();

      // Check if list_background_processes was called
      const hasListCall = toolCalls.some(
        (call) => call.toolRequest.name === 'list_background_processes',
      );

      expect(
        hasListCall,
        'Expected agent to call list_background_processes',
      ).toBe(true);
    },
  });
});
