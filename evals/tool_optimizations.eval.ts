/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

/**
 * Behavioral evals to verify the optimizations made for Gemini 3 tools.
 */
describe('Tool Optimizations (Gemini 3)', () => {
  /**
   * write_file: Verify the agent provides full content and avoids placeholders.
   */
  evalTest('USUALLY_PASSES', {
    name: 'write_file should provide full content and avoid placeholders',
    prompt:
      'Update the add function in math.ts to also log the result. Provide the full file content.',
    files: {
      'math.ts': 'export const add = (a: number, b: number) => a + b;',
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const writeCall = toolCalls.find(
        (call) => call.toolRequest.name === 'write_file',
      );

      expect(writeCall, 'Agent should have called write_file').toBeDefined();

      const args = writeCall!.toolRequest.args as any;
      const content =
        typeof args === 'string' ? JSON.parse(args).content : args.content;

      expect(content).toContain('export const add');
      expect(content).toContain('console.log');
      expect(content).not.toMatch(/\/\/ \.\.\./);
      expect(content).not.toMatch(/\/* rest of code/i);
    },
  });

  /**
   * save_memory: Verify the agent doesn't save project-specific data to global memory.
   */
  evalTest('USUALLY_PASSES', {
    name: 'save_memory should not be used for project-specific context',
    prompt:
      'The main entry point for this project is src/main.ts. Remember this.',
    files: {
      'package.json': '{ "name": "my-project" }',
    },
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const memoryCall = toolCalls.find(
        (call) => call.toolRequest.name === 'save_memory',
      );

      // The agent should NOT call save_memory for this, as it is project-specific.
      // It might use write_file to a local GEMINI.md or just acknowledge it.
      expect(
        memoryCall,
        'Agent should NOT have called save_memory for project-specific data',
      ).toBeUndefined();
    },
  });

  /**
   * web_fetch: Verify the agent uses standard GitHub URLs directly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'web_fetch should be used directly with GitHub blob URLs',
    prompt:
      'Read the content of this file: https://github.com/google/gemini-cli/blob/main/README.md',
    assert: async (rig) => {
      const toolCalls = rig.readToolLogs();
      const fetchCall = toolCalls.find(
        (call) => call.toolRequest.name === 'web_fetch',
      );

      expect(fetchCall, 'Agent should have called web_fetch').toBeDefined();

      const args = fetchCall!.toolRequest.args as any;
      const prompt =
        typeof args === 'string' ? JSON.parse(args).prompt : args.prompt;

      // The agent should pass the original URL and not try to convert it to raw.githubusercontent.com manually,
      // as our tool handles it automatically now.
      expect(prompt).toContain(
        'github.com/google/gemini-cli/blob/main/README.md',
      );
    },
  });
});
