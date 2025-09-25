/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  E2ETestRig,
  printDebugInfo,
  validateModelOutput,
} from './test-helper.e2e.js';

describe('run_shell_command', () => {
  it('should be able to run a shell command', async () => {
    const rig = new E2ETestRig();
    await rig.setup('should be able to run a shell command');

    const prompt = `Please run the command "echo hello-world" and show me the output`;

    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('run_shell_command');

    // Add debugging information
    if (!foundToolCall || !result.includes('hello-world')) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Contains hello-world': result.includes('hello-world'),
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    // Model often reports exit code instead of showing output
    validateModelOutput(
      result,
      ['hello-world', 'exit code 0'],
      'Shell command test',
    );
  });

  it('should be able to run a shell command via stdin', async () => {
    const rig = new E2ETestRig();
    await rig.setup('should be able to run a shell command via stdin');

    const prompt = `Please run the command "echo test-stdin" and show me what it outputs`;

    const result = await rig.run({ stdin: prompt });

    const foundToolCall = await rig.waitForToolCall('run_shell_command');

    // Add debugging information
    if (!foundToolCall || !result.includes('test-stdin')) {
      printDebugInfo(rig, result, {
        'Test type': 'Stdin test',
        'Found tool call': foundToolCall,
        'Contains test-stdin': result.includes('test-stdin'),
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(result, 'test-stdin', 'Shell command stdin test');
  });

  it('should abort a long-running shell command with Ctrl+C', async () => {
    const rig = new E2ETestRig();
    await rig.setup('should abort a long-running shell command');

    // Create a separate JS file for the long-running command to avoid shell parsing issues.
    const scriptContent = `setTimeout(() => { console.log('this should not appear'); }, 10000);`;
    rig.createFile('long-running-script.js', scriptContent);

    const longRunningCommand = 'node long-running-script.js';
    const prompt = `run the command: ${longRunningCommand}`;

    const { ptyProcess, promise } = rig.runInteractive('--prompt', prompt);

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    // Wait for the tool call to be registered in telemetry.
    // This confirms the command has been started by the service.
    const toolCallStarted = await rig.waitForToolCall(
      'run_shell_command',
      15000,
    );
    expect(
      toolCallStarted,
      'The run_shell_command tool was never called',
    ).toBeTruthy();

    // Send Ctrl+C to abort the process.
    ptyProcess.write('\x03');

    const result = await promise;

    // Expect a graceful exit. The shell service should handle the SIGINT.
    // A non-zero exit code is acceptable if it's due to the signal.
    // The main thing is that it doesn't hang and timeout.
    expect(result.exitCode).not.toBe(null);

    // Check that the output indicates the operation was cancelled.
    expect(output).toContain('Operation cancelled');
    expect(output).not.toContain('this should not appear');
  }, 20000);
});
