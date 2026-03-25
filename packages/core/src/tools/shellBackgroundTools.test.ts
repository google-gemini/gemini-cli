/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  ListBackgroundProcessesTool,
  ReadBackgroundOutputTool,
} from './shellBackgroundTools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import fs from 'node:fs';

describe('Background Tools', () => {
  let listTool: ListBackgroundProcessesTool;
  let readTool: ReadBackgroundOutputTool;
  const bus = createMockMessageBus();

  beforeEach(() => {
    vi.clearAllMocks();
    listTool = new ListBackgroundProcessesTool(bus);
    readTool = new ReadBackgroundOutputTool(bus);

    // Clear history to avoid state leakage from previous runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.clear();
  });

  it('list_background_processes should return empty message when no processes', async () => {
    const invocation = listTool.build({});
    const result = await invocation.execute(new AbortController().signal);
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
    // But we can just call ShellExecutionService.background(pid) and it will fall back to 'unknown command' if not found!
    // Let's check background() implementation:
    // const command = activePty?.command ?? activeChild?.command ?? 'unknown command';
    // So it works even if nothing is in the maps!

    ShellExecutionService.background(pid);

    const invocation = listTool.build({});
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain(
      `[PID ${pid}] RUNNING: \`unknown command\``,
    );
  });

  it('read_background_output should return error if log file does not exist', async () => {
    const pid = 12345 + Math.floor(Math.random() * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(pid, {
      command: 'unknown command',
      status: 'running',
      startTime: Date.now(),
    });
    const invocation = readTool.build({ pid });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('No output log found');
  });

  it('read_background_output should read content from log file', async () => {
    const pid = 88888 + Math.floor(Math.random() * 1000);
    const logPath = ShellExecutionService.getLogFilePath(pid);
    const logDir = ShellExecutionService.getLogDir();

    // Add to history to pass access check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.set(pid, {
      command: 'unknown command',
      status: 'running',
      startTime: Date.now(),
    });

    // Ensure dir exists
    fs.mkdirSync(logDir, { recursive: true });

    // Write mock log
    fs.writeFileSync(logPath, 'line 1\nline 2\nline 3\n');

    const invocation = readTool.build({ pid, lines: 2 });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Showing last 2 of 3 lines');
    expect(result.llmContent).toContain('line 2\nline 3');

    // Cleanup
    fs.unlinkSync(logPath);
  });
});
