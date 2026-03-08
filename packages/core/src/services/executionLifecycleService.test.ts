/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExecutionLifecycleService,
  type ExecutionHandle,
  type ExecutionResult,
} from './executionLifecycleService.js';

const BASE_VIRTUAL_ID = 2_000_000_000;

function resetLifecycleState() {
  (
    ExecutionLifecycleService as unknown as {
      activeExecutions: Map<number, unknown>;
      activeResolvers: Map<number, unknown>;
      activeListeners: Map<number, unknown>;
      exitedExecutionInfo: Map<number, unknown>;
      nextVirtualExecutionId: number;
    }
  ).activeExecutions.clear();
  (
    ExecutionLifecycleService as unknown as {
      activeExecutions: Map<number, unknown>;
      activeResolvers: Map<number, unknown>;
      activeListeners: Map<number, unknown>;
      exitedExecutionInfo: Map<number, unknown>;
      nextVirtualExecutionId: number;
    }
  ).activeResolvers.clear();
  (
    ExecutionLifecycleService as unknown as {
      activeExecutions: Map<number, unknown>;
      activeResolvers: Map<number, unknown>;
      activeListeners: Map<number, unknown>;
      exitedExecutionInfo: Map<number, unknown>;
      nextVirtualExecutionId: number;
    }
  ).activeListeners.clear();
  (
    ExecutionLifecycleService as unknown as {
      activeExecutions: Map<number, unknown>;
      activeResolvers: Map<number, unknown>;
      activeListeners: Map<number, unknown>;
      exitedExecutionInfo: Map<number, unknown>;
      nextVirtualExecutionId: number;
    }
  ).exitedExecutionInfo.clear();
  (
    ExecutionLifecycleService as unknown as {
      activeExecutions: Map<number, unknown>;
      activeResolvers: Map<number, unknown>;
      activeListeners: Map<number, unknown>;
      exitedExecutionInfo: Map<number, unknown>;
      nextVirtualExecutionId: number;
    }
  ).nextVirtualExecutionId = BASE_VIRTUAL_ID;
}

function createResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    rawOutput: Buffer.from(''),
    output: '',
    exitCode: 0,
    signal: null,
    error: null,
    aborted: false,
    pid: 123,
    executionMethod: 'child_process',
    ...overrides,
  };
}

describe('ExecutionLifecycleService', () => {
  beforeEach(() => {
    resetLifecycleState();
  });

  it('completes virtual executions in the foreground and notifies exit subscribers', async () => {
    const handle = ExecutionLifecycleService.createExecution();
    if (handle.pid === undefined) {
      throw new Error('Expected virtual execution ID.');
    }

    const onExit = vi.fn();
    const unsubscribe = ExecutionLifecycleService.onExit(handle.pid, onExit);

    ExecutionLifecycleService.appendOutput(handle.pid, 'Hello');
    ExecutionLifecycleService.appendOutput(handle.pid, ' World');
    ExecutionLifecycleService.completeExecution(handle.pid, { exitCode: 0 });

    const result = await handle.result;
    expect(result.output).toBe('Hello World');
    expect(result.executionMethod).toBe('none');
    expect(result.backgrounded).toBeUndefined();

    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribe();
  });

  it('supports backgrounding virtual executions and continues streaming updates', async () => {
    const handle = ExecutionLifecycleService.createExecution();
    if (handle.pid === undefined) {
      throw new Error('Expected virtual execution ID.');
    }

    const chunks: string[] = [];
    const onExit = vi.fn();

    const unsubscribeStream = ExecutionLifecycleService.subscribe(
      handle.pid,
      (event) => {
        if (event.type === 'data' && typeof event.chunk === 'string') {
          chunks.push(event.chunk);
        }
      },
    );
    const unsubscribeExit = ExecutionLifecycleService.onExit(handle.pid, onExit);

    ExecutionLifecycleService.appendOutput(handle.pid, 'Chunk 1');
    ExecutionLifecycleService.background(handle.pid);

    const backgroundResult = await handle.result;
    expect(backgroundResult.backgrounded).toBe(true);
    expect(backgroundResult.output).toBe('Chunk 1');

    ExecutionLifecycleService.appendOutput(handle.pid, '\nChunk 2');
    ExecutionLifecycleService.completeExecution(handle.pid, { exitCode: 0 });

    await vi.waitFor(() => {
      expect(chunks.join('')).toContain('Chunk 2');
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribeStream();
    unsubscribeExit();
  });

  it('kills virtual executions and resolves with aborted result', async () => {
    const onKill = vi.fn();
    const handle = ExecutionLifecycleService.createExecution('', onKill);
    if (handle.pid === undefined) {
      throw new Error('Expected virtual execution ID.');
    }

    ExecutionLifecycleService.appendOutput(handle.pid, 'work');
    ExecutionLifecycleService.kill(handle.pid);

    const result = await handle.result;
    expect(onKill).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.error?.message).toContain('Operation cancelled by user');
  });

  it('manages external executions through registration hooks', async () => {
    const writeInput = vi.fn();
    const terminate = vi.fn();
    const isActive = vi.fn().mockReturnValue(true);
    const exitListener = vi.fn();
    const chunks: string[] = [];

    let output = 'seed';
    const handle: ExecutionHandle = ExecutionLifecycleService.registerExecution(
      4321,
      {
        executionMethod: 'child_process',
        getBackgroundOutput: () => output,
        getSubscriptionSnapshot: () => output,
        writeInput,
        kill: terminate,
        isActive,
      },
    );

    const unsubscribe = ExecutionLifecycleService.subscribe(4321, (event) => {
      if (event.type === 'data' && typeof event.chunk === 'string') {
        chunks.push(event.chunk);
      }
    });
    ExecutionLifecycleService.onExit(4321, exitListener);

    ExecutionLifecycleService.writeInput(4321, 'stdin');
    expect(writeInput).toHaveBeenCalledWith('stdin');
    expect(ExecutionLifecycleService.isActive(4321)).toBe(true);

    const firstChunk = { type: 'data', chunk: ' +delta' } as const;
    ExecutionLifecycleService.emitEvent(4321, firstChunk);
    output += firstChunk.chunk;

    ExecutionLifecycleService.background(4321);
    const backgroundResult = await handle.result;
    expect(backgroundResult.backgrounded).toBe(true);
    expect(backgroundResult.output).toBe('seed +delta');
    expect(backgroundResult.executionMethod).toBe('child_process');

    ExecutionLifecycleService.finalizeExecution(
      4321,
      createResult({
        pid: 4321,
        output: 'seed +delta done',
        rawOutput: Buffer.from('seed +delta done'),
        executionMethod: 'child_process',
      }),
    );

    await vi.waitFor(() => {
      expect(exitListener).toHaveBeenCalledWith(0, undefined);
    });

    const lateExit = vi.fn();
    ExecutionLifecycleService.onExit(4321, lateExit);
    expect(lateExit).toHaveBeenCalledWith(0, undefined);

    unsubscribe();

    const killHandle = ExecutionLifecycleService.registerExecution(4322, {
      executionMethod: 'child_process',
      kill: terminate,
    });
    expect(killHandle.pid).toBe(4322);
    ExecutionLifecycleService.kill(4322);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
