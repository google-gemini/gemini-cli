/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, printDebugInfo, validateModelOutput } from './test-helper.js';
import { getShellConfiguration } from '../packages/core/src/utils/shell-utils.js';

const { shell } = getShellConfiguration();

function getLineCountCommand(): { command: string; tool: string } {
  switch (shell) {
    case 'powershell':
      return {
        command: `(Get-Content test.txt).Length`,
        tool: 'Get-Content',
      };
    case 'cmd':
      return { command: `find /c /v "" test.txt`, tool: 'find' };
    case 'bash':
    default:
      return { command: `wc -l test.txt`, tool: 'wc' };
  }
}

describe('run_shell_command', () => {
  it('should be able to run a shell command', async () => {
    const rig = new TestRig();
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
    const rig = new TestRig();
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

  it('should run allowed sub-command in non-interactive mode', async () => {
    const rig = new TestRig();
    await rig.setup('should run allowed sub-command in non-interactive mode');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { tool } = getLineCountCommand();
    const prompt = `use ${tool} to tell me how many lines there are in ${testFile}`;

    // Provide the prompt via stdin to simulate non-interactive mode
    const result = await rig.run({
      stdin: prompt,
      args: [`--allowed-tools=run_shell_command(${tool})`],
    });

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  it('should succeed with no parens in non-interactive mode', async () => {
    const rig = new TestRig();
    await rig.setup('should succeed with no parens in non-interactive mode');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { tool } = getLineCountCommand();
    const prompt = `use ${tool} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run({
      stdin: prompt,
      args: ['--allowed-tools=run_shell_command'],
    });

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  it('should succeed with --yolo mode', async () => {
    const rig = new TestRig();
    await rig.setup('should succeed with --yolo mode');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { tool } = getLineCountCommand();
    const prompt = `use ${tool} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run(
      {
        prompt: prompt,
      },
      '--yolo',
    );

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  it('should work with ShellTool alias', async () => {
    const rig = new TestRig();
    await rig.setup('should work with ShellTool alias');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { tool } = getLineCountCommand();
    const prompt = `use ${tool} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run({
      stdin: prompt,
      args: [`--allowed-tools=ShellTool(${tool})`],
    });

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  //TODO - https://github.com/google-gemini/gemini-cli/issues/10737
  it.skip('should combine multiple --allowed-tools flags', async () => {
    const rig = new TestRig();
    await rig.setup('should combine multiple --allowed-tools flags');

    const { tool } = getLineCountCommand();
    const prompt = `use ${tool} and ls`;

    const result = await rig.run({
      stdin: prompt,
      args: [
        `--allowed-tools=run_shell_command(${tool})`,
        '--allowed-tools=run_shell_command(ls)',
      ],
    });

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  it('should allow all with "ShellTool" and other specifics', async () => {
    const rig = new TestRig();
    await rig.setup('should allow all with "ShellTool" and other specifics');

    const { tool } = getLineCountCommand();
    const prompt = `use date`;

    const result = await rig.run({
      stdin: prompt,
      args: [
        `--allowed-tools=run_shell_command(${tool})`,
        '--allowed-tools=run_shell_command',
      ],
    });

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();
  });

  it('should propagate environment variables to the child process', async () => {
    const rig = new TestRig();
    await rig.setup('should propagate environment variables');

    const varName = 'GEMINI_CLI_TEST_VAR';
    const varValue = `test-value-${Math.random().toString(36).substring(7)}`;
    process.env[varName] = varValue;

    try {
      const prompt = `Use echo to learn the value of the environment variable named ${varName} and tell me what it is.`;
      const result = await rig.run(prompt);

      const foundToolCall = await rig.waitForToolCall('run_shell_command');

      if (!foundToolCall || !result.includes(varValue)) {
        printDebugInfo(rig, result, {
          'Found tool call': foundToolCall,
          'Contains varValue': result.includes(varValue),
        });
      }

      expect(
        foundToolCall,
        'Expected to find a run_shell_command tool call',
      ).toBeTruthy();
      validateModelOutput(result, varValue, 'Env var propagation test');
      expect(result).toContain(varValue);
    } finally {
      delete process.env[varName];
    }
  });

  it('should run a platform-specific file listing command', async () => {
    const rig = new TestRig();
    await rig.setup('should run platform-specific file listing');
    const fileName = `test-file-${Math.random().toString(36).substring(7)}.txt`;
    rig.createFile(fileName, 'test content');

    const prompt = `Run a shell command to list the files in the current directory and tell me what they are.`;
    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('run_shell_command');

    // Debugging info
    if (!foundToolCall || !result.includes(fileName)) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Contains fileName': result.includes(fileName),
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    validateModelOutput(result, fileName, 'Platform-specific listing test');
    expect(result).toContain(fileName);
  });
});
