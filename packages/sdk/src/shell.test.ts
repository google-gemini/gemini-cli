/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { SdkAgentShell } from './shell.js';
import { ShellExecutionService, type Config as CoreConfig } from '@google/gemini-cli-core';

describe('SdkAgentShell', () => {
  const createMockConfig = () => {
    return {
      getWorkingDir: () => '/mock/cwd',
      getShellExecutionConfig: () => ({
        sanitizationConfig: {
          allowedEnvironmentVariables: ['TEST_VAR', 'FOO'],
        },
        sandboxManager: {
          wrapCommand: async (cmd: string) => cmd,
        },
      }),
      messageBus: {
        publish: vi.fn(),
        subscribe: vi.fn(),
      },
      getPolicyEngine: () => ({
        checkCommand: () => ({ allowed: true }),
      }),
    } as unknown as CoreConfig;
  };

  it('merges custom environment variables into execution config', async () => {
    const mockConfig = createMockConfig();
    const executeSpy = vi.spyOn(ShellExecutionService, 'execute').mockResolvedValue({
      pid: 1234,
      result: Promise.resolve({
        output: 'test-output',
        exitCode: 0,
      }),
    } as any);

    const shell = new SdkAgentShell(mockConfig);
    const result = await shell.exec('echo $FOO', {
      env: { FOO: 'bar' },
    });

    expect(executeSpy).toHaveBeenCalled();
    const passedConfig = executeSpy.mock.calls[0][5];
    expect(passedConfig.env).toBeDefined();
    expect(passedConfig.env.FOO).toBe('bar');
    expect(result.output).toBe('test-output');
    expect(result.exitCode).toBe(0);

    executeSpy.mockRestore();
  });

  it('handles external AbortSignal cancellation', async () => {
    const mockConfig = createMockConfig();
    const abortController = new AbortController();

    let receivedSignal: AbortSignal | undefined;
    const executeSpy = vi.spyOn(ShellExecutionService, 'execute').mockImplementation(
      async (_cmd, _cwd, _cb, signal) => {
        receivedSignal = signal;
        return {
          pid: 1234,
          result: new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve({
                output: 'aborted',
                exitCode: 130,
              });
            });
          }),
        } as any;
      },
    );

    const shell = new SdkAgentShell(mockConfig);
    const execPromise = shell.exec('sleep 10', {
      signal: abortController.signal,
    });

    abortController.abort(new Error('User aborted'));
    const result = await execPromise;

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.output).toBe('aborted');

    executeSpy.mockRestore();
  });

  it('handles execution timeout and returns error', async () => {
    const mockConfig = createMockConfig();

    const executeSpy = vi.spyOn(ShellExecutionService, 'execute').mockImplementation(
      async (_cmd, _cwd, _cb, signal) => {
        return {
          pid: 1234,
          result: new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve({
                output: 'killed after timeout',
                exitCode: 124,
              });
            });
          }),
        } as any;
      },
    );

    const shell = new SdkAgentShell(mockConfig);
    const result = await shell.exec('sleep 10', {
      timeoutSeconds: 0.05, // 50ms timeout for test
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Command timed out');
    expect(result.output).toBe('killed after timeout');

    executeSpy.mockRestore();
  });
});
