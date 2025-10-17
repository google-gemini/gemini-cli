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
    case 'cmd':
      return { command: `find /c /v`, tool: 'find' };
    case 'bash':
    default:
      return { command: `wc -l`, tool: 'wc' };
  }
}

function getInvalidCommand(): string {
  switch (shell) {
    case 'powershell':
      return `Get-ChildItem | | Select-Object`;
    case 'cmd':
      return `dir | | findstr foo`;
    case 'bash':
    default:
      return `echo "hello" > > file`;
  }
}

function getAllowedListCommand(): string {
  switch (shell) {
    case 'powershell':
      return 'Get-ChildItem';
    case 'cmd':
      return 'dir';
    case 'bash':
    default:
      return 'ls';
  }
}

function getDisallowedFileReadCommand(testFile: string): {
  command: string;
  tool: string;
} {
  const quotedPath = `"${testFile}"`;
  switch (shell) {
    case 'powershell':
      return { command: `Get-Content ${quotedPath}`, tool: 'Get-Content' };
    case 'cmd':
      return { command: `type ${quotedPath}`, tool: 'type' };
    case 'bash':
    default:
      return { command: `cat ${quotedPath}`, tool: 'cat' };
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
    const { tool, command } = getLineCountCommand();
    const prompt = `use ${command} to tell me how many lines there are in ${testFile}`;

    // Provide the prompt via stdin to simulate non-interactive mode
    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      `--allowed-tools=run_shell_command(${tool})`,
    );

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      const toolLogs = rig.readToolLogs().map(({ toolRequest }) => ({
        name: toolRequest.name,
        success: toolRequest.success,
        args: toolRequest.args,
      }));
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Allowed tools flag': `run_shell_command(${tool})`,
        Prompt: prompt,
        'Tool logs': toolLogs,
        Result: result,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    const toolCall = rig
      .readToolLogs()
      .filter(
        (toolCall) => toolCall.toolRequest.name === 'run_shell_command',
      )[0];
    expect(toolCall.toolRequest.success).toBe(true);
  });

  it('should succeed with no parens in non-interactive mode', async () => {
    const rig = new TestRig();
    await rig.setup('should succeed with no parens in non-interactive mode');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { command } = getLineCountCommand();
    const prompt = `use ${command} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      '--allowed-tools=run_shell_command',
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

    const toolCall = rig
      .readToolLogs()
      .filter(
        (toolCall) => toolCall.toolRequest.name === 'run_shell_command',
      )[0];
    expect(toolCall.toolRequest.success).toBe(true);
  });

  it('should succeed with --yolo mode', async () => {
    const rig = new TestRig();
    await rig.setup('should succeed with --yolo mode');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { command } = getLineCountCommand();
    const prompt = `use ${command} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run({
      prompt: prompt,
      yolo: true,
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

    const toolCall = rig
      .readToolLogs()
      .filter(
        (toolCall) => toolCall.toolRequest.name === 'run_shell_command',
      )[0];
    expect(toolCall.toolRequest.success).toBe(true);
  });

  it('should work with ShellTool alias', async () => {
    const rig = new TestRig();
    await rig.setup('should work with ShellTool alias');

    const testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const { tool, command } = getLineCountCommand();
    const prompt = `use ${command} to tell me how many lines there are in ${testFile}`;

    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      `--allowed-tools=ShellTool(${tool})`,
    );

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall) {
      const toolLogs = rig.readToolLogs().map(({ toolRequest }) => ({
        name: toolRequest.name,
        success: toolRequest.success,
        args: toolRequest.args,
      }));
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        'Allowed tools flag': `ShellTool(${tool})`,
        Prompt: prompt,
        'Tool logs': toolLogs,
        Result: result,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    const toolCall = rig
      .readToolLogs()
      .filter(
        (toolCall) => toolCall.toolRequest.name === 'run_shell_command',
      )[0];
    expect(toolCall.toolRequest.success).toBe(true);
  });

  // TODO(#11062): Un-skip this once we can make it reliable by using hard coded
  // model responses.
  it.skip('should combine multiple --allowed-tools flags', async () => {
    const rig = new TestRig();
    await rig.setup('should combine multiple --allowed-tools flags');

    const { tool, command } = getLineCountCommand();
    const prompt =
      `use both ${command} and ls to count the number of lines in files in this ` +
      `directory. Do not pipe these commands into each other, run them separately.`;

    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      `--allowed-tools=run_shell_command(${tool})`,
      '--allowed-tools=run_shell_command(ls)',
    );

    for (const expected in ['ls', tool]) {
      const foundToolCall = await rig.waitForToolCall(
        'run_shell_command',
        15000,
        (args) => args.toLowerCase().includes(`"command": "${expected}`),
      );

      if (!foundToolCall) {
        printDebugInfo(rig, result, {
          'Found tool call': foundToolCall,
        });
      }

      expect(
        foundToolCall,
        `Expected to find a run_shell_command tool call to "${expected}",` +
          ` got ${rig.readToolLogs().join('\n')}`,
      ).toBeTruthy();
    }

    const toolLogs = rig
      .readToolLogs()
      .filter((toolCall) => toolCall.toolRequest.name === 'run_shell_command');
    expect(toolLogs.length, toolLogs.join('\n')).toBeGreaterThanOrEqual(2);
    for (const toolLog of toolLogs) {
      expect(
        toolLog.toolRequest.success,
        `Expected tool call ${toolLog} to succeed`,
      ).toBe(true);
    }
  });

  it.skip('should reject commands not on the allowlist', async () => {
    const rig = new TestRig();
    await rig.setup('should reject commands not on the allowlist');

    const testFile = rig.createFile('test.txt', 'Disallowed command check\n');
    const allowedCommand = getAllowedListCommand();
    const disallowed = getDisallowedFileReadCommand(testFile);
    const prompt =
      `I am testing the allowed tools configuration. ` +
      `Attempt to run "${disallowed.command}" to read the contents of ${testFile}. ` +
      `If the command fails because it is not permitted, respond with the single word FAIL. ` +
      `If it succeeds, respond with SUCCESS.`;

    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      `--allowed-tools=run_shell_command(${allowedCommand})`,
    );

    if (!result.toLowerCase().includes('fail')) {
      printDebugInfo(rig, result, {
        Result: result,
        AllowedCommand: allowedCommand,
        DisallowedCommand: disallowed.command,
      });
    }
    expect(result).toContain('FAIL');

    const foundToolCall = await rig.waitForToolCall(
      'run_shell_command',
      15000,
      (args) => args.toLowerCase().includes(disallowed.tool.toLowerCase()),
    );

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        ToolLogs: rig.readToolLogs(),
      });
    }
    expect(foundToolCall).toBe(true);

    const toolLogs = rig
      .readToolLogs()
      .filter((toolLog) => toolLog.toolRequest.name === 'run_shell_command');
    const failureLog = toolLogs.find((toolLog) =>
      toolLog.toolRequest.args
        .toLowerCase()
        .includes(disallowed.tool.toLowerCase()),
    );

    if (!failureLog || failureLog.toolRequest.success) {
      printDebugInfo(rig, result, {
        ToolLogs: toolLogs,
        DisallowedTool: disallowed.tool,
      });
    }

    expect(
      failureLog,
      'Expected failing run_shell_command invocation',
    ).toBeTruthy();
    expect(failureLog!.toolRequest.success).toBe(false);
  });

  it('should allow all with "ShellTool" and other specific tools', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should allow all with "ShellTool" and other specific tools',
    );

    const { tool } = getLineCountCommand();
    const prompt = `Please run the command "echo test-allow-all" and show me the output`;

    const result = await rig.run(
      {
        stdin: prompt,
        yolo: false,
      },
      `--allowed-tools=run_shell_command(${tool})`,
      '--allowed-tools=run_shell_command',
    );

    const foundToolCall = await rig.waitForToolCall('run_shell_command', 15000);

    if (!foundToolCall || !result.includes('test-allow-all')) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        Result: result,
      });
    }

    expect(
      foundToolCall,
      'Expected to find a run_shell_command tool call',
    ).toBeTruthy();

    const toolCall = rig
      .readToolLogs()
      .filter(
        (toolCall) => toolCall.toolRequest.name === 'run_shell_command',
      )[0];
    expect(toolCall.toolRequest.success).toBe(true);

    // Validate model output - will throw if no output, warn if missing expected content
    validateModelOutput(
      result,
      'test-allow-all',
      'Shell command stdin allow all',
    );
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

  it('rejects invalid shell expressions', async () => {
    const rig = new TestRig();
    await rig.setup('rejects invalid shell expressions');
    const invalidCommand = getInvalidCommand();
    const result = await rig.run(
      `I am testing the error handling of the run_shell_command tool. Please attempt to run the following command, which I know has invalid syntax: \`${invalidCommand}\`. If the command fails as expected, please return the word FAIL, otherwise return the word SUCCESS.`,
    );
    expect(result).toContain('FAIL');

    const escapedInvalidCommand = JSON.stringify(invalidCommand).slice(1, -1);
    const foundToolCall = await rig.waitForToolCall(
      'run_shell_command',
      15000,
      (args) =>
        args.toLowerCase().includes(escapedInvalidCommand.toLowerCase()),
    );

    if (!foundToolCall) {
      printDebugInfo(rig, result, {
        'Found tool call': foundToolCall,
        EscapedCommand: escapedInvalidCommand,
        ToolLogs: rig.readToolLogs(),
      });
    }
    expect(foundToolCall).toBe(true);

    const toolLogs = rig
      .readToolLogs()
      .filter((toolLog) => toolLog.toolRequest.name === 'run_shell_command');
    const failureLog = toolLogs.find((toolLog) =>
      toolLog.toolRequest.args
        .toLowerCase()
        .includes(escapedInvalidCommand.toLowerCase()),
    );

    if (!failureLog || failureLog.toolRequest.success) {
      printDebugInfo(rig, result, {
        ToolLogs: toolLogs,
        EscapedCommand: escapedInvalidCommand,
      });
    }

    expect(
      failureLog,
      'Expected failing run_shell_command invocation for invalid syntax',
    ).toBeTruthy();
    expect(failureLog!.toolRequest.success).toBe(false);
  });
});
