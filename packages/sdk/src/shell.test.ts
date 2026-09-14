/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config as CoreConfig } from '@google/gemini-cli-core';
import { SdkAgentShell } from './shell.js';

const executeMock = vi.fn();
const shouldConfirmExecute = vi.fn();

vi.mock('@google/gemini-cli-core', () => ({
  ShellExecutionService: {
    execute: (...args: unknown[]) => executeMock(...args),
  },
  ShellTool: class {
    build() {
      return { shouldConfirmExecute };
    }
  },
}));

/** Resolves only when the abort signal fires, like a command that outlives its wait. */
const hangsUntilAborted = (signal: AbortSignal) => ({
  result: new Promise((resolve) => {
    signal.addEventListener('abort', () =>
      resolve({ output: 'partial', exitCode: null }),
    );
  }),
});

describe('SdkAgentShell.exec', () => {
  const shellExecutionConfig = {
    env: { PATH: '/usr/bin', SECRET: 'from-config' },
    sanitizationConfig: {},
  };
  const config = {
    getWorkingDir: () => '/work',
    getShellExecutionConfig: () => shellExecutionConfig,
    messageBus: undefined,
  } as unknown as CoreConfig;

  const envPassedToShell = () =>
    (executeMock.mock.calls[0][5] as { env?: Record<string, string> }).env;

  beforeEach(() => {
    vi.clearAllMocks();
    shouldConfirmExecute.mockResolvedValue(false);
    executeMock.mockResolvedValue({
      result: Promise.resolve({ output: 'ok', exitCode: 0 }),
    });
  });

  it('merges the caller env into the default one rather than replacing it', async () => {
    await new SdkAgentShell(config).exec('env', { env: { FOO: 'bar' } });

    expect(envPassedToShell()).toEqual({
      PATH: '/usr/bin',
      SECRET: 'from-config',
      FOO: 'bar',
    });
  });

  it('lets the caller override one variable without dropping the rest', async () => {
    await new SdkAgentShell(config).exec('env', { env: { PATH: '/opt/bin' } });

    expect(envPassedToShell()).toEqual({
      PATH: '/opt/bin',
      SECRET: 'from-config',
    });
  });

  it('passes the shell config through untouched when no env is given', async () => {
    await new SdkAgentShell(config).exec('env');

    expect(executeMock.mock.calls[0][5]).toBe(shellExecutionConfig);
  });

  it('aborts a command that outlives timeoutSeconds and reports the timeout', async () => {
    vi.useFakeTimers();
    executeMock.mockImplementation((...args: unknown[]) =>
      hangsUntilAborted(args[3] as AbortSignal),
    );

    const pending = new SdkAgentShell(config).exec('sleep 30', {
      timeoutSeconds: 1,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    vi.useRealTimers();

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('timed out after 1 seconds');
    // Whatever the command produced before it was stopped is still returned.
    expect(result.output).toBe('partial');
  });

  it('leaves a command that finishes in time alone', async () => {
    vi.useFakeTimers();

    const result = await new SdkAgentShell(config).exec('true', {
      timeoutSeconds: 5,
    });
    vi.useRealTimers();

    expect(result.error).toBeUndefined();
    expect(result.exitCode).toBe(0);
  });

  it('treats a non-positive timeout as no limit', async () => {
    vi.useFakeTimers();
    executeMock.mockImplementation((...args: unknown[]) =>
      hangsUntilAborted(args[3] as AbortSignal),
    );

    const controller = new AbortController();
    const pending = new SdkAgentShell(config).exec('sleep 30', {
      timeoutSeconds: 0,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    // Still running after a minute, so nothing armed a timer.
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Let the test finish rather than leaving a promise hanging.
    (executeMock.mock.calls[0][3] as AbortSignal).dispatchEvent(
      new Event('abort'),
    );
    await pending;
    controller.abort();
    vi.useRealTimers();
  });
});
