/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ShellExecutionService,
  type ShellExecutionResult,
} from './shellExecutionService.js';
import {
  ExecutionLifecycleService,
  type ExecutionCompletionOptions,
} from './executionLifecycleService.js';

const createResult = (): ShellExecutionResult => ({
  rawOutput: Buffer.from(''),
  output: '',
  exitCode: 0,
  signal: null,
  error: null,
  aborted: false,
  pid: 123,
  executionMethod: 'none',
});

describe('ExecutionLifecycleService', () => {
  it('creates executions through ShellExecutionService virtual execution API', () => {
    const onKill = vi.fn();
    const handle = {
      pid: 123,
      result: Promise.resolve(createResult()),
    };
    const createSpy = vi
      .spyOn(ShellExecutionService, 'createVirtualExecution')
      .mockReturnValue(handle);

    const created = ExecutionLifecycleService.createExecution('seed', onKill);

    expect(createSpy).toHaveBeenCalledWith('seed', onKill);
    expect(created).toBe(handle);
  });

  it('delegates append and completion to ShellExecutionService virtual APIs', () => {
    const appendSpy = vi.spyOn(ShellExecutionService, 'appendVirtualOutput');
    const completeSpy = vi.spyOn(
      ShellExecutionService,
      'completeVirtualExecution',
    );
    const options: ExecutionCompletionOptions = {
      exitCode: 0,
      signal: null,
    };

    ExecutionLifecycleService.appendOutput(123, 'delta');
    ExecutionLifecycleService.completeExecution(123, options);

    expect(appendSpy).toHaveBeenCalledWith(123, 'delta');
    expect(completeSpy).toHaveBeenCalledWith(123, options);
  });

  it('delegates backgrounding, subscriptions, exit callbacks, and kill', () => {
    const unsubscribe = vi.fn();
    const backgroundSpy = vi
      .spyOn(ShellExecutionService, 'background')
      .mockImplementation(() => {});
    const subscribeSpy = vi
      .spyOn(ShellExecutionService, 'subscribe')
      .mockReturnValue(unsubscribe);
    const onExitSpy = vi
      .spyOn(ShellExecutionService, 'onExit')
      .mockReturnValue(unsubscribe);
    const killSpy = vi
      .spyOn(ShellExecutionService, 'kill')
      .mockImplementation(() => {});

    const listener = vi.fn();
    const onExit = vi.fn();
    const returnedSub = ExecutionLifecycleService.subscribe(123, listener);
    const returnedExit = ExecutionLifecycleService.onExit(123, onExit);
    ExecutionLifecycleService.background(123);
    ExecutionLifecycleService.kill(123);

    expect(subscribeSpy).toHaveBeenCalledWith(123, listener);
    expect(onExitSpy).toHaveBeenCalledWith(123, onExit);
    expect(backgroundSpy).toHaveBeenCalledWith(123);
    expect(killSpy).toHaveBeenCalledWith(123);
    expect(returnedSub).toBe(unsubscribe);
    expect(returnedExit).toBe(unsubscribe);
  });

  it('delegates active checks and input writes', () => {
    const isActiveSpy = vi
      .spyOn(ShellExecutionService, 'isPtyActive')
      .mockReturnValue(true);
    const writeSpy = vi
      .spyOn(ShellExecutionService, 'writeToPty')
      .mockImplementation(() => {});

    const isActive = ExecutionLifecycleService.isActive(123);
    ExecutionLifecycleService.writeInput(123, 'input');

    expect(isActiveSpy).toHaveBeenCalledWith(123);
    expect(writeSpy).toHaveBeenCalledWith(123, 'input');
    expect(isActive).toBe(true);
  });
});
