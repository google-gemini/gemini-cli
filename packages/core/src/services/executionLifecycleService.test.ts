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
    ExecutionLifecycleService.resetForTest();
  });

  it('completes managed executions in the foreground and notifies exit subscribers', async () => {
    const handle = ExecutionLifecycleService.createExecution();
    if (handle.pid === undefined) {
      throw new Error('Expected execution ID.');
    }

    const onExit = vi.fn();
    const unsubscribe = ExecutionLifecycleService.onExit(handle.pid, onExit);

    ExecutionLifecycleService.appendOutput(handle.pid, 'Hello');
    ExecutionLifecycleService.appendOutput(handle.pid, ' World');
    ExecutionLifecycleService.completeExecution(handle.pid, {
      exitCode: 0,
    });

    const result = await handle.result;
    expect(result.output).toBe('Hello World');
    expect(result.executionMethod).toBe('none');
    expect(result.backgrounded).toBeUndefined();

    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribe();
  });

  it('supports explicit execution methods for managed executions', async () => {
    const handle = ExecutionLifecycleService.createExecution(
      '',
      undefined,
      'remote_agent',
    );
    if (handle.pid === undefined) {
      throw new Error('Expected execution ID.');
    }

    ExecutionLifecycleService.completeExecution(handle.pid, {
      exitCode: 0,
    });
    const result = await handle.result;
    expect(result.executionMethod).toBe('remote_agent');
  });

  it('supports backgrounding managed executions and continues streaming updates', async () => {
    const handle = ExecutionLifecycleService.createExecution();
    if (handle.pid === undefined) {
      throw new Error('Expected execution ID.');
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
    const unsubscribeExit = ExecutionLifecycleService.onExit(
      handle.pid,
      onExit,
    );

    ExecutionLifecycleService.appendOutput(handle.pid, 'Chunk 1');
    ExecutionLifecycleService.background(handle.pid);

    const backgroundResult = await handle.result;
    expect(backgroundResult.backgrounded).toBe(true);
    expect(backgroundResult.output).toBe('Chunk 1');

    ExecutionLifecycleService.appendOutput(handle.pid, '\nChunk 2');
    ExecutionLifecycleService.completeExecution(handle.pid, {
      exitCode: 0,
    });

    await vi.waitFor(() => {
      expect(chunks.join('')).toContain('Chunk 2');
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribeStream();
    unsubscribeExit();
  });

  it('kills managed executions and resolves with aborted result', async () => {
    const onKill = vi.fn();
    const handle = ExecutionLifecycleService.createExecution('', onKill);
    if (handle.pid === undefined) {
      throw new Error('Expected execution ID.');
    }

    ExecutionLifecycleService.appendOutput(handle.pid, 'work');
    ExecutionLifecycleService.kill(handle.pid);

    const result = await handle.result;
    expect(onKill).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.error?.message).toContain('Operation cancelled by user');
  });

  it('does not probe OS process state for completed non-process execution IDs', async () => {
    const handle = ExecutionLifecycleService.createExecution();
    if (handle.pid === undefined) {
      throw new Error('Expected execution ID.');
    }

    ExecutionLifecycleService.completeExecution(handle.pid, { exitCode: 0 });
    await handle.result;

    const processKillSpy = vi.spyOn(process, 'kill');
    expect(ExecutionLifecycleService.isActive(handle.pid)).toBe(false);
    expect(processKillSpy).not.toHaveBeenCalled();
    processKillSpy.mockRestore();
  });

  it('manages external executions through registration hooks', async () => {
    const writeInput = vi.fn();
    const isActive = vi.fn().mockReturnValue(true);
    const exitListener = vi.fn();
    const chunks: string[] = [];

    let output = 'seed';
    const handle: ExecutionHandle = ExecutionLifecycleService.attachExecution(
      4321,
      {
        executionMethod: 'child_process',
        getBackgroundOutput: () => output,
        getSubscriptionSnapshot: () => output,
        writeInput,
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

    ExecutionLifecycleService.completeWithResult(
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
  });

  it('supports late subscription catch-up after backgrounding an external execution', async () => {
    let output = 'seed';
    const onExit = vi.fn();
    const handle = ExecutionLifecycleService.attachExecution(4322, {
      executionMethod: 'child_process',
      getBackgroundOutput: () => output,
      getSubscriptionSnapshot: () => output,
    });

    ExecutionLifecycleService.onExit(4322, onExit);
    ExecutionLifecycleService.background(4322);

    const backgroundResult = await handle.result;
    expect(backgroundResult.backgrounded).toBe(true);
    expect(backgroundResult.output).toBe('seed');

    output += ' +late';
    ExecutionLifecycleService.emitEvent(4322, {
      type: 'data',
      chunk: ' +late',
    });

    const chunks: string[] = [];
    const unsubscribe = ExecutionLifecycleService.subscribe(4322, (event) => {
      if (event.type === 'data' && typeof event.chunk === 'string') {
        chunks.push(event.chunk);
      }
    });
    expect(chunks[0]).toBe('seed +late');

    output += ' +live';
    ExecutionLifecycleService.emitEvent(4322, {
      type: 'data',
      chunk: ' +live',
    });
    expect(chunks[chunks.length - 1]).toBe(' +live');

    ExecutionLifecycleService.completeWithResult(
      4322,
      createResult({
        pid: 4322,
        output,
        rawOutput: Buffer.from(output),
        executionMethod: 'child_process',
      }),
    );

    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });
    unsubscribe();
  });

  it('kills external executions and settles pending promises', async () => {
    const terminate = vi.fn();
    const onExit = vi.fn();
    const handle = ExecutionLifecycleService.attachExecution(4323, {
      executionMethod: 'child_process',
      initialOutput: 'running',
      kill: terminate,
    });
    ExecutionLifecycleService.onExit(4323, onExit);
    ExecutionLifecycleService.kill(4323);

    const result = await handle.result;
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.output).toBe('running');
    expect(result.error?.message).toContain('Operation cancelled by user');
    expect(onExit).toHaveBeenCalledWith(130, undefined);
  });

  it('rejects duplicate execution registration for active execution IDs', () => {
    ExecutionLifecycleService.attachExecution(4324, {
      executionMethod: 'child_process',
    });

    expect(() => {
      ExecutionLifecycleService.attachExecution(4324, {
        executionMethod: 'child_process',
      });
    }).toThrow('Execution 4324 is already attached.');
  });
});
