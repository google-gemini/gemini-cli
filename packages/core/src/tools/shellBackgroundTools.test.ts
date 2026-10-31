/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';
import {
  ListBackgroundProcessesTool,
  ReadBackgroundOutputTool,
} from './shellBackgroundTools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import fs from 'node:fs';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

describe('Background Tools', () => {
  let listTool: ListBackgroundProcessesTool;
  let readTool: ReadBackgroundOutputTool;
  const bus = createMockMessageBus();

  beforeEach(() => {
    vi.restoreAllMocks();
    const mockContext = {
      config: { getSessionId: () => 'default' },
    } as unknown as AgentLoopContext;
    listTool = new ListBackgroundProcessesTool(mockContext, bus);
    readTool = new ReadBackgroundOutputTool(mockContext, bus);

    // Clear history to avoid state leakage from previous runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.clear();
  });

  it('list_background_processes should return empty message when no processes', async () => {
    const invocation = listTool.build({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(result.llmContent).toBe('No background processes found.');
  });

  it('list_background_processes should list processes after they are backgrounded', async () => {
    const pid = 99999 + Math.floor(Math.random() * 1000);

    // Simulate adding to history
    // Since background method relies on activePtys/activeChildProcesses,
    // we should probably mock those or just call the history add logic if we can't easily trigger background.
    // Wait, ShellExecutionService.background() reads from activePtys/activeChildProcesses!
    // So we MUST populate them or mock them!
    // Let's use vi.spyOn or populate the map if accessible?
    // activePtys is private static.
    // Mock active process map to provide sessionId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).activeChildProcesses.set(pid, {
      process: {},
      state: { output: '' },
      command: 'unknown command',
      sessionId: 'default',
    });
    ExecutionLifecycleService.attachExecution(pid, {
      executionMethod: 'child_process',
    });

    ShellExecutionService.background(pid, 'default', 'unknown command');

    const invocation = listTool.build({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain(
      `[PID ${pid}] RUNNING: \`unknown command\``,
    );
  });

  it('list_background_processes should show exited status with code or signal', async () => {
    const pid = 98989;
    const history = new Map();
    history.set(pid, {
      command: 'exited command',
      status: 'exited',
      exitCode: 1,
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    const invocation = listTool.build({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain(
      `- [PID ${pid}] EXITED: \`exited command\` (Exit Code: 1)`,
    );
  });

  it('read_background_output should return error if log file does not exist', async () => {
    const pid = 12345 + Math.floor(Math.random() * 1000);
    const history = new Map();
    history.set(pid, {
      command: 'unknown command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('No output log found');
  });

  it('read_background_output should read content from log file', async () => {
    const pid = 88888 + Math.floor(Math.random() * 1000);
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    // Ensure dir exists
    // Add to history to pass access check
    const history = new Map();
    history.set(pid, {
      command: 'unknown command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    // Ensure dir exists
    fs.mkdirSync(logDir, { recursive: true });

    // Write mock log
    fs.writeFileSync(logPath, 'line 1\nline 2\nline 3\n');

    const invocation = readTool.build({ pid, lines: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('Showing last 2 of 3 lines');
    expect(result.llmContent).toContain('line 2\nline 3');

    // Cleanup
    fs.unlinkSync(logPath);
  });

  it('read_background_output should return Access Denied for processes in other sessions', async () => {
    const pid = 77777;
    const history = new Map();
    history.set(pid, {
      command: 'other command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'other-session',
      history,
    );

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } }; // Asking for PID from another session
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('Access denied');
  });

  it('read_background_output should handle empty log files', async () => {
    const pid = 66666;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'empty output command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logPath, '');

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('Log is empty');

    fs.unlinkSync(logPath);
  });

  it('read_background_output should handle direct tool errors gracefully', async () => {
    const pid = 55555;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'fail command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logPath, 'dummy content');

    // Mock open to throw to hit catch block
    vi.spyOn(fs.promises, 'open').mockRejectedValue(
      new Error('Simulated read error'),
    );

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('Error reading background log');

    fs.unlinkSync(logPath);
  });

  it('read_background_output should deny access if log is a symbolic link', async () => {
    const pid = 66666;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'symlink command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logPath, 'dummy content');

    // Mock open to throw ELOOP error for symbolic link
    const mockError = new Error('ELOOP: too many symbolic links encountered');
    Object.assign(mockError, { code: 'ELOOP' });
    vi.spyOn(fs.promises, 'open').mockRejectedValue(mockError);

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('Access is denied');
    expect(result.error?.message).toContain('Symbolic link detected');

    fs.unlinkSync(logPath);
  });

  it('read_background_output should tail reading trailing logic correctly', async () => {
    const pid = 77777;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'tail command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // Write 5 lines
    fs.writeFileSync(logPath, 'line1\nline2\nline3\nline4\nline5');

    const invocation = readTool.build({ pid, lines: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('line4\nline5');
    expect(result.llmContent).not.toContain('line1');

    fs.unlinkSync(logPath);
  });

  describe('read cancellation', () => {
    const pid = 987655;
    let fixtureDir: string;
    let logAccess: MockInstance<typeof fs.promises.access>;

    beforeEach(() => {
      vi.useFakeTimers();
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'background-cancel-'));
      const logPath = path.join(fixtureDir, 'output.log');
      fs.writeFileSync(logPath, 'fixture output\n');
      vi.spyOn(ShellExecutionService, 'getLogFilePath').mockReturnValue(
        logPath,
      );
      vi.spyOn(
        ShellExecutionService,
        'listBackgroundProcesses',
      ).mockReturnValue([{ pid, command: 'fixture', status: 'running' }]);
      logAccess = vi.spyOn(fs.promises, 'access');
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    it.each([0, 10_000])(
      'rejects an already-aborted read with delay %i',
      async (delay_ms) => {
        const controller = new AbortController();
        controller.abort();
        const outcome = readTool
          .build({ pid, delay_ms })
          .execute({ abortSignal: controller.signal })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        await vi.runAllTimersAsync();
        expect(await outcome).toMatchObject({ name: 'AbortError' });
        expect(logAccess).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('cancels during the delay without waiting for its deadline or reading the log', async () => {
      const controller = new AbortController();
      let settled = false;
      const outcome = readTool
        .build({ pid, delay_ms: 10_000 })
        .execute({ abortSignal: controller.signal })
        .then(
          () => {
            settled = true;
            return undefined;
          },
          (error: unknown) => {
            settled = true;
            return error;
          },
        );
      await vi.advanceTimersByTimeAsync(20);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      const settledAfterAbort = settled;
      await vi.runAllTimersAsync();
      const error = await outcome;
      expect(settledAfterAbort).toBe(true);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(logAccess).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('still reads output after an uncancelled delay', async () => {
      const pending = readTool
        .build({ pid, delay_ms: 100 })
        .execute({ abortSignal: new AbortController().signal });
      await vi.advanceTimersByTimeAsync(99);
      expect(logAccess).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).llmContent).toContain('fixture output');
    });
  });
});
