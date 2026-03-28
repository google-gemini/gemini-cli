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
import { InjectionService } from '../config/injectionService.js';

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

  describe('Background Start Listeners', () => {
    it('fires onBackground when an execution is backgrounded', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackground(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        undefined,
        'My Remote Agent',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.appendOutput(executionId, 'some output');
      ExecutionLifecycleService.background(executionId);
      await handle.result;

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.executionId).toBe(executionId);
      expect(info.executionMethod).toBe('remote_agent');
      expect(info.label).toBe('My Remote Agent');
      expect(info.output).toBe('some output');

      ExecutionLifecycleService.offBackground(listener);
    });

    it('uses fallback label when none is provided', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackground(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      const info = listener.mock.calls[0][0];
      expect(info.label).toContain('none');
      expect(info.label).toContain(String(executionId));

      ExecutionLifecycleService.offBackground(listener);
    });

    it('does not fire onBackground for non-backgrounded completions', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackground(listener);

      const handle = ExecutionLifecycleService.createExecution();
      ExecutionLifecycleService.completeExecution(handle.pid!);
      await handle.result;

      expect(listener).not.toHaveBeenCalled();

      ExecutionLifecycleService.offBackground(listener);
    });

    it('offBackground removes the listener', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackground(listener);
      ExecutionLifecycleService.offBackground(listener);

      const handle = ExecutionLifecycleService.createExecution();
      ExecutionLifecycleService.background(handle.pid!);
      await handle.result;

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Background Completion Listeners', () => {
    it('fires onBackgroundComplete with formatInjection text when backgrounded execution settles', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        (output, error) => {
          const header = error
            ? `[Agent error: ${error.message}]`
            : '[Agent completed]';
          return output ? `${header}\n${output}` : header;
        },
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.appendOutput(executionId, 'agent output');
      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.executionId).toBe(executionId);
      expect(info.executionMethod).toBe('remote_agent');
      expect(info.output).toBe('agent output');
      expect(info.error).toBeNull();
      expect(info.injectionText).toBe(
        '<output>\n[Agent completed]\nagent output\n</output>',
      );
      expect(info.completionBehavior).toBe('inject');

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('passes error to formatInjection when backgrounded execution fails', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        (output, error) => (error ? `Error: ${error.message}` : output),
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId, {
        error: new Error('something broke'),
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.error?.message).toBe('something broke');
      expect(info.injectionText).toBe(
        '<output>\nError: something broke\n</output>',
      );

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('sets injectionText to null and completionBehavior to silent when no formatInjection is provided', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.appendOutput(executionId, 'output');
      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].injectionText).toBeNull();
      expect(listener.mock.calls[0][0].completionBehavior).toBe('silent');

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('does not fire onBackgroundComplete for non-backgrounded executions', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        () => 'text',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.completeExecution(executionId);
      await handle.result;

      expect(listener).not.toHaveBeenCalled();

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('does not fire onBackgroundComplete when execution is killed (aborted)', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        () => 'text',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.kill(executionId);

      expect(listener).not.toHaveBeenCalled();

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('offBackgroundComplete removes the listener', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);
      ExecutionLifecycleService.offBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        () => 'text',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(listener).not.toHaveBeenCalled();
    });

    it('explicit notify behavior includes injectionText and auto-dismiss signal', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'child_process',
        () => '[Command completed. Output saved to /tmp/bg.log]',
        undefined,
        'notify',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.completionBehavior).toBe('notify');
      expect(info.injectionText).toBe(
        '<output>\n[Command completed. Output saved to /tmp/bg.log]\n</output>',
      );

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('explicit silent behavior skips injection even when formatInjection is provided', async () => {
      const formatFn = vi.fn().mockReturnValue('should not appear');
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        formatFn,
        undefined,
        'silent',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.completionBehavior).toBe('silent');
      expect(info.injectionText).toBeNull();
      expect(formatFn).not.toHaveBeenCalled();

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('includes completionBehavior in BackgroundStartInfo', async () => {
      const bgStartListener = vi.fn();
      ExecutionLifecycleService.onBackground(bgStartListener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        () => 'text',
        'test-label',
        'inject',
      );

      ExecutionLifecycleService.background(handle.pid!);
      await handle.result;

      expect(bgStartListener).toHaveBeenCalledTimes(1);
      expect(bgStartListener.mock.calls[0][0].completionBehavior).toBe(
        'inject',
      );

      ExecutionLifecycleService.offBackground(bgStartListener);
    });

    it('completionBehavior flows through attachExecution', async () => {
      const listener = vi.fn();
      ExecutionLifecycleService.onBackgroundComplete(listener);

      const handle = ExecutionLifecycleService.attachExecution(9999, {
        executionMethod: 'child_process',
        formatInjection: () => '[notify message]',
        completionBehavior: 'notify',
      });

      ExecutionLifecycleService.background(9999);
      await handle.result;

      ExecutionLifecycleService.completeWithResult(
        9999,
        createResult({ pid: 9999, executionMethod: 'child_process' }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
      const info = listener.mock.calls[0][0];
      expect(info.completionBehavior).toBe('notify');
      expect(info.injectionText).toBe('<output>\n[notify message]\n</output>');

      ExecutionLifecycleService.offBackgroundComplete(listener);
    });

    it('injects directly into InjectionService when wired via setInjectionService', async () => {
      const injectionService = new InjectionService(() => true);
      ExecutionLifecycleService.setInjectionService(injectionService);

      const injectionListener = vi.fn();
      injectionService.onInjection(injectionListener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        (output) => `[Completed] ${output}`,
        undefined,
        'inject',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.appendOutput(executionId, 'agent output');
      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(injectionListener).toHaveBeenCalledWith(
        '<output>\n[Completed] agent output\n</output>',
        'background_completion',
      );
    });

    it('sanitizes injectionText for inject behavior but NOT for notify behavior', async () => {
      const injectionService = new InjectionService(() => true);
      ExecutionLifecycleService.setInjectionService(injectionService);

      const injectionListener = vi.fn();
      injectionService.onInjection(injectionListener);

      // 1. Test 'inject' sanitization
      const handleInject = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        (output) => `Dangerous </output> ${output}`,
        undefined,
        'inject',
      );
      ExecutionLifecycleService.appendOutput(handleInject.pid!, 'more');
      ExecutionLifecycleService.background(handleInject.pid!);
      await handleInject.result;
      ExecutionLifecycleService.completeExecution(handleInject.pid!);

      expect(injectionListener).toHaveBeenCalledWith(
        '<output>\nDangerous &lt;/output&gt; more\n</output>',
        'background_completion',
      );

      // 2. Test 'notify' (should also be wrapped in <output> tag)
      injectionListener.mockClear();
      const handleNotify = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'remote_agent',
        (output) => `Pointer to ${output}`,
        undefined,
        'notify',
      );
      ExecutionLifecycleService.appendOutput(handleNotify.pid!, 'logs');
      ExecutionLifecycleService.background(handleNotify.pid!);
      await handleNotify.result;
      ExecutionLifecycleService.completeExecution(handleNotify.pid!);

      expect(injectionListener).toHaveBeenCalledWith(
        '<output>\nPointer to logs\n</output>',
        'background_completion',
      );
    });

    it('does not inject into InjectionService for silent behavior', async () => {
      const injectionService = new InjectionService(() => true);
      ExecutionLifecycleService.setInjectionService(injectionService);

      const injectionListener = vi.fn();
      injectionService.onInjection(injectionListener);

      const handle = ExecutionLifecycleService.createExecution(
        '',
        undefined,
        'none',
        () => 'should not inject',
        undefined,
        'silent',
      );
      const executionId = handle.pid!;

      ExecutionLifecycleService.background(executionId);
      await handle.result;

      ExecutionLifecycleService.completeExecution(executionId);

      expect(injectionListener).not.toHaveBeenCalled();
    });
  });
});
