/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  ListBackgroundProcessesTool,
  ReadBackgroundOutputTool,
} from './shellBackgroundTools.js';
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
    const listResult = await listInvocation.execute(
      new AbortController().signal,
    );

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
    const readResult = await readInvocation.execute(
      new AbortController().signal,
    );

    expect(readResult.llmContent).toContain('Showing last');
    expect(readResult.llmContent).toContain('Log line');

    // Cleanup
    await ShellExecutionService.kill(pid);
    controller.abort();
  });
});
