/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DebugAttachTool,
  DebugContinueTool,
  DebugDisconnectTool,
  DebugEvaluateTool,
  DebugLaunchTool,
  DebugSetBreakpointTool,
  DebugStacktraceTool,
  DebugStepTool,
  DebugVariablesTool,
} from './debug-tools.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';

const managerMock = vi.hoisted(() => ({
  attachSession: vi.fn(),
  launchSession: vi.fn(),
  setBreakpoints: vi.fn(),
  getStackTrace: vi.fn(),
  getScopes: vi.fn(),
  getVariables: vi.fn(),
  evaluate: vi.fn(),
  stepOver: vi.fn(),
  stepIn: vi.fn(),
  stepOut: vi.fn(),
  continue: vi.fn(),
  disconnectSession: vi.fn(),
  getActiveSession: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('../debug/session-store.js', () => ({
  getDebugSessionManager: () => managerMock,
}));

describe('debug tools', () => {
  const signal = new AbortController().signal;
  const messageBus = createMockMessageBus();

  beforeEach(() => {
    vi.clearAllMocks();
    managerMock.attachSession.mockResolvedValue({
      id: 'debug-1',
      runtime: 'node',
      capabilities: {},
    });
    managerMock.launchSession.mockResolvedValue({
      id: 'debug-2',
      runtime: 'node',
      capabilities: {},
    });
    managerMock.setBreakpoints.mockResolvedValue([
      { verified: true, line: 12 },
      { verified: true, line: 18 },
    ]);
    managerMock.getStackTrace.mockResolvedValue([
      {
        id: 100,
        name: 'main',
        line: 12,
        column: 3,
        source: { path: '/workspace/src/index.ts' },
      },
    ]);
    managerMock.getScopes.mockResolvedValue([
      {
        name: 'Locals',
        variablesReference: 1,
        expensive: false,
      },
    ]);
    managerMock.getVariables.mockResolvedValue([
      {
        name: 'value',
        value: '42',
        type: 'number',
        variablesReference: 0,
      },
    ]);
    managerMock.evaluate.mockResolvedValue({
      result: '43',
      variablesReference: 0,
    });
    managerMock.continue.mockResolvedValue({ allThreadsContinued: true });
    managerMock.getActiveSession.mockReturnValue({ runtime: 'node' });
    managerMock.requireSession.mockReturnValue({
      stoppedThreadId: 1,
      stoppedReason: 'breakpoint',
    });
  });

  it('attaches with debug_attach', async () => {
    const tool = new DebugAttachTool(messageBus);
    const result = await tool.buildAndExecute({ runtime: 'node' }, signal);

    expect(managerMock.attachSession).toHaveBeenCalledWith({
      runtime: 'node',
      host: undefined,
      port: undefined,
      pid: undefined,
    });
    expect(result.llmContent).toContain('Attached debugger session');
  });

  it('launches with debug_launch', async () => {
    const config = {
      getTargetDir: vi.fn().mockReturnValue('/workspace'),
    } as unknown as Config;
    const tool = new DebugLaunchTool(config, messageBus);
    const result = await tool.buildAndExecute(
      {
        runtime: 'node',
        program: 'src/index.ts',
      },
      signal,
    );

    expect(managerMock.launchSession).toHaveBeenCalled();
    expect(result.llmContent).toContain('Launched debug session');
  });

  it('sets breakpoints', async () => {
    const tool = new DebugSetBreakpointTool(messageBus);
    const result = await tool.buildAndExecute(
      {
        file_path: 'src/index.ts',
        lines: [12, 18],
      },
      signal,
    );

    expect(managerMock.setBreakpoints).toHaveBeenCalled();
    expect(result.llmContent).toContain('Configured 2 breakpoint');
  });

  it('fetches stacktrace', async () => {
    const tool = new DebugStacktraceTool(messageBus);
    const result = await tool.buildAndExecute({ levels: 10 }, signal);

    expect(managerMock.getStackTrace).toHaveBeenCalled();
    expect(String(result.llmContent)).toContain('Stack Trace');
  });

  it('fetches variables and analysis prompt', async () => {
    const tool = new DebugVariablesTool(messageBus);
    const result = await tool.buildAndExecute({ frame_id: 100 }, signal);

    expect(managerMock.getScopes).toHaveBeenCalledWith(100);
    expect(String(result.llmContent)).toContain('Variables by Scope');
    expect(String(result.llmContent)).toContain('Debug State Analysis');
  });

  it('evaluates expressions', async () => {
    const tool = new DebugEvaluateTool(messageBus);
    const result = await tool.buildAndExecute(
      {
        expression: 'value + 1',
        frame_id: 100,
      },
      signal,
    );

    expect(managerMock.evaluate).toHaveBeenCalledWith(
      'value + 1',
      100,
      undefined,
    );
    expect(result.llmContent).toBe('43');
  });

  it('steps according to action', async () => {
    const tool = new DebugStepTool(messageBus);

    await tool.buildAndExecute({ action: 'over' }, signal);
    expect(managerMock.stepOver).toHaveBeenCalled();

    await tool.buildAndExecute({ action: 'into' }, signal);
    expect(managerMock.stepIn).toHaveBeenCalled();

    await tool.buildAndExecute({ action: 'out' }, signal);
    expect(managerMock.stepOut).toHaveBeenCalled();
  });

  it('continues execution', async () => {
    const tool = new DebugContinueTool(messageBus);
    const result = await tool.buildAndExecute({}, signal);

    expect(managerMock.continue).toHaveBeenCalled();
    expect(result.llmContent).toContain('Resumed');
  });

  it('disconnects and returns summary', async () => {
    const tool = new DebugDisconnectTool(messageBus);
    const result = await tool.buildAndExecute({ terminate: true }, signal);

    expect(managerMock.disconnectSession).toHaveBeenCalledWith(true);
    expect(String(result.llmContent)).toContain('Debug Session Summary');
  });
});
