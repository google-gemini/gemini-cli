/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  ExecutionLifecycleService,
  type ExecutionOutputEvent,
} from '../services/executionLifecycleService.js';
import {
  ListBackgroundProcessesTool,
  ReadBackgroundOutputTool,
} from './shellBackgroundTools.js';
import { LineBuffer } from '../utils/lineBuffer.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Integration test simulating model interaction cycle
describe('Background Tools Integration', () => {
  const bus = createMockMessageBus();
  let listTool: ListBackgroundProcessesTool;
  let readTool: ReadBackgroundOutputTool;
  let tempRootDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockContext = {
      config: { getSessionId: () => 'default' },
    } as unknown as AgentLoopContext;
    listTool = new ListBackgroundProcessesTool(mockContext, bus);
    readTool = new ReadBackgroundOutputTool(mockContext, bus);

    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-bg-test-'));

    // Clear history to avoid state leakage from previous runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ShellExecutionService as any).backgroundProcessHistory.clear();
  });

  afterEach(() => {
    if (tempRootDir && fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  it('should support interaction cycle: start background -> list -> read logs', async () => {
    const controller = new AbortController();

    // 1. Start a backgroundable process
    // We use node to print continuous logs until killed
    const scriptPath = path.join(tempRootDir, 'log.js');
    fs.writeFileSync(
      scriptPath,
      "setInterval(() => console.log('Log line'), 100);",
    );

    // Using 'node' directly avoids cross-platform shell quoting issues with absolute paths.
    const commandString = `node "${scriptPath}"`;

    const realHandle = await ShellExecutionService.execute(
      commandString,
      process.cwd(),
      () => {},
      controller.signal,
      true,
      {
        originalCommand: 'node continuous_log',
        sessionId: 'default',
        sanitizationConfig: {
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: false,
        },
        sandboxManager: new NoopSandboxManager(),
      },
    );

    const pid = realHandle.pid;
    if (pid === undefined) {
      throw new Error('pid is undefined');
    }
    expect(pid).toBeGreaterThan(0);

    // 2. Simulate model triggering background operations
    ShellExecutionService.background(pid, 'default', 'node continuous_log');

    // 3. Model decides to inspect list
    const listInvocation = listTool.build({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (listInvocation as any).context = {
      config: { getSessionId: () => 'default' },
    };
    const listResult = await listInvocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(listResult.llmContent).toContain(
      `[PID ${pid}] RUNNING: \`node continuous_log\``,
    );

    // 4. Give it time to write output to interval
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 5. Model decides to read logs
    const readInvocation = readTool.build({ pid, lines: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (readInvocation as any).context = {
      config: { getSessionId: () => 'default' },
    };
    const readResult = await readInvocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(readResult.llmContent).toContain('Showing last');
    expect(readResult.llmContent).toContain('Log line');

    // Cleanup
    await ShellExecutionService.kill(pid);
    controller.abort();
  });

  it('stream_output: live stdout lines propagate via ExecutionLifecycleService AND disk log still works', async () => {
    const controller = new AbortController();

    // Script that emits exactly three lines, 50ms apart, then exits.
    const scriptPath = path.join(tempRootDir, 'three_lines.js');
    fs.writeFileSync(
      scriptPath,
      `
      const lines = ['line1', 'line2', 'line3'];
      (async () => {
        for (const line of lines) {
          console.log(line);
          await new Promise((r) => setTimeout(r, 50));
        }
      })();
      `,
    );
    const commandString = `node "${scriptPath}"`;

    // Mirror what shell.ts's stream_output path does: subscribe before
    // backgrounding, feed chunks through a LineBuffer.
    const emittedLines: string[] = [];
    const lineBuffer = new LineBuffer();
    let unsubscribe: (() => void) | null = null;

    const handle = await ShellExecutionService.execute(
      commandString,
      process.cwd(),
      () => {},
      controller.signal,
      false, // child_process path — produces decoded strings (stream_output's target mode)
      {
        originalCommand: 'node three_lines',
        sessionId: 'default',
        sanitizationConfig: {
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
          enableEnvironmentVariableRedaction: false,
        },
        sandboxManager: new NoopSandboxManager(),
      },
    );
    const pid = handle.pid;
    if (pid === undefined) throw new Error('pid is undefined');

    unsubscribe = ExecutionLifecycleService.subscribe(
      pid,
      (event: ExecutionOutputEvent) => {
        if (event.type === 'data' && typeof event.chunk === 'string') {
          emittedLines.push(...lineBuffer.push(event.chunk));
        } else if (event.type === 'exit') {
          emittedLines.push(...lineBuffer.flush());
        }
      },
    );

    // Move to background (same sequence the shell tool performs).
    ShellExecutionService.background(pid, 'default', 'node three_lines');

    // Wait for the script to finish (3 lines * 50ms = 150ms + margin).
    await new Promise((r) => setTimeout(r, 800));

    // Live stream captured all three lines in order.
    expect(emittedLines).toEqual(['line1', 'line2', 'line3']);

    // read_background_output still works — disk log was populated in parallel
    // (our live subscriber is a parallel observer, not a consumer).
    const readInvocation = readTool.build({ pid, lines: 5 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (readInvocation as any).context = {
      config: { getSessionId: () => 'default' },
    };
    const readResult = await readInvocation.execute({
      abortSignal: new AbortController().signal,
    });
    expect(readResult.llmContent).toContain('line1');
    expect(readResult.llmContent).toContain('line2');
    expect(readResult.llmContent).toContain('line3');

    unsubscribe();
    controller.abort();
  });
});
