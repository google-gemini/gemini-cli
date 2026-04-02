/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

// Set dummy API key to satisfy CLI checks if not present
if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'dummy_key_for_eval';
}

describe('Background Process Monitoring', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should use list and read output tools',
    prompt: "Start a background process that prints 'Task Started' immediately, sleeps for 10 seconds, and then prints 'Task Finished'. After starting it, use the background process tools to find its PID and read its output to verify 'Task Started' was printed.",
    setup: async (rig) => {
      // Create .gemini directory to avoid file system error in test rig
      if (rig.homeDir) {
        const geminiDir = path.join(rig.homeDir, '.gemini');
        fs.mkdirSync(geminiDir, { recursive: true });
      }
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      
      // Check if list_background_processes was called
      const hasListCall = toolCalls.some(
        (call) => call.toolRequest.name === 'list_background_processes',
      );

      expect(
        hasListCall,
        'Expected agent to call list_background_processes',
      ).toBe(true);

      // Check if read_background_output was called
      const hasReadCall = toolCalls.some(
        (call) => call.toolRequest.name === 'read_background_output',
      );

      expect(
        hasReadCall,
        'Expected agent to call read_background_output',
      ).toBe(true);
    },
  });
});
