/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ShellExecutionService } from './shellExecutionService.js';

describe('ShellExecutionService virtual executions', () => {
  it('completes a virtual execution in the foreground', async () => {
    const { pid, result } = ShellExecutionService.createVirtualExecution();
    const onExit = vi.fn();
    const unsubscribe = ShellExecutionService.onExit(pid!, onExit);

    ShellExecutionService.appendVirtualOutput(pid!, 'Hello');
    ShellExecutionService.appendVirtualOutput(pid!, ' World');
    ShellExecutionService.completeVirtualExecution(pid!, { exitCode: 0 });

    const executionResult = await result;

    expect(executionResult.output).toBe('Hello World');
    expect(executionResult.backgrounded).toBeUndefined();
    expect(executionResult.exitCode).toBe(0);
    expect(executionResult.error).toBeNull();

    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribe();
  });

  it('supports backgrounding virtual executions and streaming additional output', async () => {
    const { pid, result } = ShellExecutionService.createVirtualExecution();
    const chunks: string[] = [];
    const onExit = vi.fn();

    const unsubscribeStream = ShellExecutionService.subscribe(pid!, (event) => {
      if (event.type === 'data' && typeof event.chunk === 'string') {
        chunks.push(event.chunk);
      }
    });
    const unsubscribeExit = ShellExecutionService.onExit(pid!, onExit);

    ShellExecutionService.appendVirtualOutput(pid!, 'Chunk 1');
    ShellExecutionService.background(pid!);

    const backgroundResult = await result;
    expect(backgroundResult.backgrounded).toBe(true);
    expect(backgroundResult.output).toBe('Chunk 1');

    ShellExecutionService.appendVirtualOutput(pid!, '\nChunk 2');
    ShellExecutionService.completeVirtualExecution(pid!, { exitCode: 0 });

    await vi.waitFor(() => {
      expect(chunks.join('')).toContain('Chunk 2');
      expect(onExit).toHaveBeenCalledWith(0, undefined);
    });

    unsubscribeStream();
    unsubscribeExit();
  });

  it('kills virtual executions via the existing kill API', async () => {
    const onKill = vi.fn();
    const { pid, result } = ShellExecutionService.createVirtualExecution(
      '',
      onKill,
    );

    ShellExecutionService.appendVirtualOutput(pid!, 'work');
    ShellExecutionService.kill(pid!);

    const killResult = await result;
    expect(onKill).toHaveBeenCalledTimes(1);
    expect(killResult.aborted).toBe(true);
    expect(killResult.exitCode).toBe(130);
    expect(killResult.error?.message).toContain('Operation cancelled by user');
  });
});
