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
    name: 'should start a server in background and curl it',
    prompt: 'Start a simple HTTP server on port 8000 in the background using python3, and then use curl to fetch from it to verify it works.',
    setup: async (rig) => {
      // Create .gemini directory to avoid file system error in test rig
      if (rig.homeDir) {
        const geminiDir = path.join(rig.homeDir, '.gemini');
        fs.mkdirSync(geminiDir, { recursive: true });
      }
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const shellCalls = toolCalls.filter(
        (call) => call.toolRequest.name === 'run_shell_command',
      );

      // Check if any call used is_background: true
      const hasBackgroundCall = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            return false;
          }
        }
        return (args as any)['is_background'] === true;
      });

      expect(
        hasBackgroundCall,
        'Expected agent to call run_shell_command with is_background: true',
      ).toBe(true);

      // Check if any call used curl
      const hasCurlCall = shellCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            return false;
          }
        }
        const cmd = (args as any)['command'];
        return cmd && cmd.includes('curl');
      });

      expect(
        hasCurlCall,
        'Expected agent to call run_shell_command with curl',
      ).toBe(true);
    },
  });
});
