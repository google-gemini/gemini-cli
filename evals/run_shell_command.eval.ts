/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  evalTest,
  printDebugInfo,
  validateModelOutput,
} from './test-helper.js';
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

describe('run_shell_command', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should be able to run a shell command',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    prompt: 'Please run the command "echo hello-world" and show me the output',
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForToolCall('run_shell_command');
      expect(foundToolCall).toBeTruthy();
      validateModelOutput(
        result,
        ['hello-world', 'exit code 0'],
        'Shell command test',
      );
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should be able to run a shell command via stdin',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    prompt:
      'Please run the command "echo test-stdin" and show me what it outputs',
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForToolCall('run_shell_command');
      expect(foundToolCall).toBeTruthy();
      validateModelOutput(result, 'test-stdin', 'Shell command stdin test');
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should succeed with --yolo mode',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    args: '--yolo',
    prompt: 'use wc -l to tell me how many lines there are in test.txt',
    beforeRun: async (rig) => {
      rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    },
    assert: async (rig, result) => {
      const foundToolCall = await rig.waitForToolCall('run_shell_command');
      expect(foundToolCall).toBeTruthy();
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should reject commands not on the allowlist',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    args: `--allowed-tools=run_shell_command(${getAllowedListCommand()})`,
    prompt:
      'I am testing allowed tools. Attempt to run "cat test.txt" to read it. If it fails, respond with FAIL, else SUCCESS.',
    yolo: false,
    beforeRun: async (rig) => {
      rig.createFile('test.txt', 'Disallowed command check\n');
    },
    assert: async (rig, result) => {
      expect(result).toContain('FAIL');
      const toolLogs = rig
        .readToolLogs()
        .filter((l) => l.toolRequest.name === 'run_shell_command');
      const failureLog = toolLogs.find((l) =>
        l.toolRequest.args.toLowerCase().includes('cat'),
      );
      expect(failureLog?.toolRequest.success).toBe(false);
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'should propagate environment variables to the child process',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    prompt:
      'Use echo to learn the value of GEMINI_CLI_TEST_VAR and tell me what it is.',
    beforeRun: async (rig) => {
      process.env['GEMINI_CLI_TEST_VAR'] = 'test-value-123';
    },
    assert: async (rig, result) => {
      try {
        expect(result).toContain('test-value-123');
      } finally {
        delete process.env['GEMINI_CLI_TEST_VAR'];
      }
    },
  });

  evalTest('ALWAYS_PASSES', {
    name: 'rejects invalid shell expressions',
    params: {
      settings: { tools: { core: ['run_shell_command'] } },
    },
    prompt:
      'Run the command "echo hello >> > file" (which is invalid). If it fails, return FAIL, else SUCCESS.',
    assert: async (rig, result) => {
      expect(result).toContain('FAIL');
      const foundToolCall = await rig.waitForToolCall('run_shell_command');
      expect(foundToolCall).toBe(true);
      const toolLogs = rig
        .readToolLogs()
        .filter((l) => l.toolRequest.name === 'run_shell_command');
      expect(toolLogs.some((l) => !l.toolRequest.success)).toBe(true);
    },
  });
});
