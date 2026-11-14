/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('read_background_output should preserve the tail fragment of an oversized single line', async () => {
    const pid = 55501;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'oversized line command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // A single line (70KB) longer than the 64KB read cap, with a trailing
    // newline as the last byte of the read window.
    fs.writeFileSync(logPath, 'a'.repeat(70000) + '\n');

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('truncated');
    expect(result.llmContent).toContain('a'.repeat(65535));

    fs.unlinkSync(logPath);
  });

  it('read_background_output should keep a complete first line at an exact read boundary', async () => {
    const pid = 55502;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'boundary command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // 100-byte head line so the 64KB read window starts exactly on the
    // boundary of the second (complete) line.
    fs.writeFileSync(logPath, 'H'.repeat(99) + '\n' + 'y'.repeat(65536));

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('truncated');
    expect(result.llmContent).toContain('y'.repeat(65536));

    fs.unlinkSync(logPath);
  });

  it('read_background_output should mark byte-truncated output as truncated', async () => {
    const pid = 55503;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'long log command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // 50 x 2KB lines = 100KB total: the 64KB window is byte-truncated, yet
    // holds fewer lines than the default tail count.
    fs.writeFileSync(logPath, ('q'.repeat(1999) + '\n').repeat(50));

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).not.toContain('Full Log Output');
    expect(result.llmContent).toContain('truncated');
    expect(result.llmContent).toContain('q'.repeat(1999));

    fs.unlinkSync(logPath);
  });

  it('read_background_output should drop a partial first line but keep following complete lines', async () => {
    const pid = 55504;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'mixed lines command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // Window starts inside the 70KB first line; the two short lines that
    // follow it are complete and must be returned.
    fs.writeFileSync(logPath, 'a'.repeat(70000) + '\n' + 'b1\nb2\n');

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).toContain('truncated');
    expect(result.llmContent).toContain('b1\nb2');
    expect(result.llmContent).not.toContain('aaaa');

    fs.unlinkSync(logPath);
  });

  it('read_background_output should not corrupt a UTF-8 character split by the window start', async () => {
    const pid = 55505;
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    const history = new Map();
    history.set(pid, {
      command: 'unicode command',
      status: 'running',
      startTime: Date.now(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(
      'default',
      history,
    );

    fs.mkdirSync(logDir, { recursive: true });
    // 120003 bytes of multibyte content: the 64KB window begins in the middle
    // of a multibyte character (offset 54467 % 3 !== 0).
    fs.writeFileSync(logPath, '€'.repeat(40000) + 'é' + '\n');

    const invocation = readTool.build({ pid });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invocation as any).context = { config: { getSessionId: () => 'default' } };
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.llmContent).not.toContain('�');
    expect(result.llmContent).toContain('€');
    expect(result.llmContent).toContain('truncated');

    fs.unlinkSync(logPath);
  });
});
