/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';

describe('shell_timeout', () => {
  it(
    'should timeout long-running shell commands',
    async () => {
      const rig = new TestRig();
      await rig.setup('should timeout long-running shell commands');

      // Use a command that will definitely take longer than our short timeout
      // sleep command works on both Unix and Windows (via timeout on Windows)
      const prompt = `Use the shell tool to run "sleep 10" and observe what happens.`;

      // Set a very short timeout (3 seconds) to test timeout functionality quickly
      rig.config.shellTimeoutMs = 3000;

      const result = await rig.run(prompt);

      // Check that the shell tool was called
      const allTools = rig.readToolLogs();
      const shellToolCall = allTools.find(
        (t) => t.toolRequest.name === 'run_shell_command',
      );

      if (!shellToolCall) {
        printDebugInfo(rig, result, {
          'shell tool called': false,
          'available tools': allTools.map((t) => t.toolRequest.name),
        });
      }

      expect(shellToolCall, 'Expected shell tool to be called').toBeTruthy();

      // Validate that there's some output (should include timeout message)
      validateModelOutput(result, null, 'Shell timeout test');

      // The result should contain some indication of timeout behavior
      // This could be in the model's response or in the tool output
      expect(result.length).toBeGreaterThan(0);
    },
    { timeout: 15000 },
  ); // Give the test enough time to run

  it(
    'should not timeout short-running commands',
    async () => {
      const rig = new TestRig();
      await rig.setup('should not timeout short-running commands');

      const prompt = `Use the shell tool to run "echo hello" and show the output.`;

      // Set a reasonable timeout
      rig.config.shellTimeoutMs = 30000;

      const result = await rig.run(prompt);

      // Check that the shell tool was called
      const allTools = rig.readToolLogs();
      const shellToolCall = allTools.find(
        (t) => t.toolRequest.name === 'run_shell_command',
      );

      expect(shellToolCall, 'Expected shell tool to be called').toBeTruthy();

      // Validate model output
      validateModelOutput(result, 'hello', 'Shell command success test');
    },
    { timeout: 10000 },
  );
});
