/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type Mocked,
} from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan: vi.fn(async (_opts, fn) =>
    fn({ metadata: { input: {}, output: {} } }),
  ),
}));
vi.mock('../telemetry/loggers.js', () => ({
  logToolCall: vi.fn(),
}));
vi.mock('../telemetry/types.js', () => ({
  ToolCallEvent: vi.fn().mockImplementation((call) => ({ ...call })),
}));

import {
  SchedulerStateManager,
  type TerminalCallHandler,
} from './state-manager.js';
import { checkPolicy, updatePolicy } from './policy.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolModificationHandler } from './tool-modifier.js';

vi.mock('./state-manager.js');
vi.mock('./confirmation.js');
vi.mock('./policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./policy.js')>();
  return {
    ...actual,
    checkPolicy: vi.fn(),
    updatePolicy: vi.fn(),
  };
});
vi.mock('./tool-executor.js');
vi.mock('./tool-modifier.js');

import { Scheduler } from './scheduler.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import {
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';
import type {
  ToolCallRequestInfo,
  CompletedToolCall,
  SuccessfulToolCall,
  Status,
  ToolCall,
} from './types.js';
import { ROOT_SCHEDULER_ID } from './types.js';
import type { EditorType } from '../utils/editor.js';

describe('Scheduler Parallel Execution', () => {
  let scheduler: Scheduler;
  let signal: AbortSignal;
  let abortController: AbortController;

  let mockConfig: Mocked<Config>;
  let mockMessageBus: Mocked<MessageBus>;
  let mockPolicyEngine: Mocked<PolicyEngine>;
  let mockToolRegistry: Mocked<ToolRegistry>;
  let getPreferredEditor: Mock<() => EditorType | undefined>;

  let mockStateManager: Mocked<SchedulerStateManager>;
  let mockExecutor: Mocked<ToolExecutor>;
  let mockModifier: Mocked<ToolModificationHandler>;

  const req1: ToolCallRequestInfo = {
    callId: 'call-1',
    name: 'read-tool-1',
    args: { path: 'a.txt' },
    isClientInitiated: false,
    prompt_id: 'p1',
    schedulerId: ROOT_SCHEDULER_ID,
  };

  const req2: ToolCallRequestInfo = {
    callId: 'call-2',
    name: 'read-tool-2',
    args: { path: 'b.txt' },
    isClientInitiated: false,
    prompt_id: 'p1',
    schedulerId: ROOT_SCHEDULER_ID,
  };

  const req3: ToolCallRequestInfo = {
    callId: 'call-3',
    name: 'write-tool',
    args: { path: 'c.txt', content: 'hi' },
    isClientInitiated: false,
    prompt_id: 'p1',
    schedulerId: ROOT_SCHEDULER_ID,
  };

  const readTool1 = {
    name: 'read-tool-1',
    isReadOnly: true,
    build: vi.fn(),
  } as unknown as AnyDeclarativeTool;
  const readTool2 = {
    name: 'read-tool-2',
    isReadOnly: true,
    build: vi.fn(),
  } as unknown as AnyDeclarativeTool;
  const writeTool = {
    name: 'write-tool',
    isReadOnly: false,
    build: vi.fn(),
  } as unknown as AnyDeclarativeTool;

  const mockInvocation = {
    shouldConfirmExecute: vi.fn().mockResolvedValue(false),
  };

  beforeEach(() => {
    vi.mocked(randomUUID).mockReturnValue(
      'uuid' as unknown as `${string}-${string}-${string}-${string}-${string}`,
    );
    abortController = new AbortController();
    signal = abortController.signal;

    mockPolicyEngine = {
      check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ALLOW }),
    } as unknown as Mocked<PolicyEngine>;

    mockToolRegistry = {
      getTool: vi.fn((name) => {
        if (name === 'read-tool-1') return readTool1;
        if (name === 'read-tool-2') return readTool2;
        if (name === 'write-tool') return writeTool;
        return undefined;
      }),
      getAllToolNames: vi
        .fn()
        .mockReturnValue(['read-tool-1', 'read-tool-2', 'write-tool']),
    } as unknown as Mocked<ToolRegistry>;

    mockConfig = {
      getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      isInteractive: vi.fn().mockReturnValue(true),
      getEnableHooks: vi.fn().mockReturnValue(true),
      setApprovalMode: vi.fn(),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
    } as unknown as Mocked<Config>;

    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    getPreferredEditor = vi.fn().mockReturnValue('vim');

    vi.mocked(checkPolicy).mockReset();
    vi.mocked(checkPolicy).mockResolvedValue({
      decision: PolicyDecision.ALLOW,
      rule: undefined,
    });
    vi.mocked(updatePolicy).mockReset();

    const mockActiveCallsMap = new Map<string, ToolCall>();
    const mockQueue: ToolCall[] = [];
    let capturedTerminalHandler: TerminalCallHandler | undefined;

    mockStateManager = {
      enqueue: vi.fn((calls: ToolCall[]) => {
        mockQueue.push(...calls.map((c) => ({ ...c }) as ToolCall));
      }),
      dequeue: vi.fn(() => {
        const next = mockQueue.shift();
        if (next) mockActiveCallsMap.set(next.request.callId, next);
        return next;
      }),
      peekQueue: vi.fn(() => mockQueue[0]),
      getToolCall: vi.fn((id: string) => mockActiveCallsMap.get(id)),
      updateStatus: vi.fn((id: string, status: Status) => {
        const call = mockActiveCallsMap.get(id);
        if (call) (call as unknown as { status: Status }).status = status;
      }),
      finalizeCall: vi.fn((id: string) => {
        const call = mockActiveCallsMap.get(id);
        if (call) {
          mockActiveCallsMap.delete(id);
          capturedTerminalHandler?.(call as CompletedToolCall);
        }
      }),
      updateArgs: vi.fn(),
      setOutcome: vi.fn(),
      cancelAllQueued: vi.fn(() => {
        mockQueue.length = 0;
      }),
      clearBatch: vi.fn(),
    } as unknown as Mocked<SchedulerStateManager>;

    Object.defineProperty(mockStateManager, 'isActive', {
      get: vi.fn(() => mockActiveCallsMap.size > 0),
      configurable: true,
    });
    Object.defineProperty(mockStateManager, 'allActiveCalls', {
      get: vi.fn(() => Array.from(mockActiveCallsMap.values())),
      configurable: true,
    });
    Object.defineProperty(mockStateManager, 'queueLength', {
      get: vi.fn(() => mockQueue.length),
      configurable: true,
    });
    Object.defineProperty(mockStateManager, 'firstActiveCall', {
      get: vi.fn(() => mockActiveCallsMap.values().next().value),
      configurable: true,
    });
    Object.defineProperty(mockStateManager, 'completedBatch', {
      get: vi.fn().mockReturnValue([]),
      configurable: true,
    });

    vi.mocked(SchedulerStateManager).mockImplementation(
      (_bus, _id, onTerminal) => {
        capturedTerminalHandler = onTerminal;
        return mockStateManager as unknown as SchedulerStateManager;
      },
    );

    mockExecutor = { execute: vi.fn() } as unknown as Mocked<ToolExecutor>;
    vi.mocked(ToolExecutor).mockReturnValue(
      mockExecutor as unknown as Mocked<ToolExecutor>,
    );
    mockModifier = {
      handleModifyWithEditor: vi.fn(),
      applyInlineModify: vi.fn(),
    } as unknown as Mocked<ToolModificationHandler>;
    vi.mocked(ToolModificationHandler).mockReturnValue(
      mockModifier as unknown as Mocked<ToolModificationHandler>,
    );

    scheduler = new Scheduler({
      config: mockConfig,
      messageBus: mockMessageBus,
      getPreferredEditor,
      schedulerId: 'root',
    });

    vi.mocked(readTool1.build).mockReturnValue(
      mockInvocation as unknown as AnyToolInvocation,
    );
    vi.mocked(readTool2.build).mockReturnValue(
      mockInvocation as unknown as AnyToolInvocation,
    );
    vi.mocked(writeTool.build).mockReturnValue(
      mockInvocation as unknown as AnyToolInvocation,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should execute contiguous read-only tools in parallel', async () => {
    const executionLog: string[] = [];

    mockExecutor.execute.mockImplementation(async ({ call }) => {
      const id = call.request.callId;
      executionLog.push(`start-${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push(`end-${id}`);
      return {
        status: 'success',
        response: { callId: id, responseParts: [] },
      } as unknown as SuccessfulToolCall;
    });

    // Schedule 2 read tools and 1 write tool
    await scheduler.schedule([req1, req2, req3], signal);

    // Parallel read tools should start together
    expect(executionLog[0]).toBe('start-call-1');
    expect(executionLog[1]).toBe('start-call-2');

    // They can finish in any order, but both must finish before call-3 starts
    expect(executionLog.indexOf('start-call-3')).toBeGreaterThan(
      executionLog.indexOf('end-call-1'),
    );
    expect(executionLog.indexOf('start-call-3')).toBeGreaterThan(
      executionLog.indexOf('end-call-2'),
    );

    expect(executionLog).toContain('end-call-3');
  });

  it('should execute non-read-only tools sequentially', async () => {
    const executionLog: string[] = [];

    mockExecutor.execute.mockImplementation(async ({ call }) => {
      const id = call.request.callId;
      executionLog.push(`start-${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push(`end-${id}`);
      return {
        status: 'success',
        response: { callId: id, responseParts: [] },
      } as unknown as SuccessfulToolCall;
    });

    // req3 is NOT read-only
    await scheduler.schedule([req3, req1], signal);

    // Should be strictly sequential
    expect(executionLog).toEqual([
      'start-call-3',
      'end-call-3',
      'start-call-1',
      'end-call-1',
    ]);
  });

  it('should execute [WRITE, READ, READ] as [sequential, parallel]', async () => {
    const executionLog: string[] = [];
    mockExecutor.execute.mockImplementation(async ({ call }) => {
      const id = call.request.callId;
      executionLog.push(`start-${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push(`end-${id}`);
      return {
        status: 'success',
        response: { callId: id, responseParts: [] },
      } as unknown as SuccessfulToolCall;
    });

    // req3 (WRITE), req1 (READ), req2 (READ)
    await scheduler.schedule([req3, req1, req2], signal);

    // Order should be:
    // 1. write starts and ends
    // 2. read1 and read2 start together (parallel)
    expect(executionLog[0]).toBe('start-call-3');
    expect(executionLog[1]).toBe('end-call-3');
    expect(executionLog.slice(2, 4)).toContain('start-call-1');
    expect(executionLog.slice(2, 4)).toContain('start-call-2');
  });

  it('should execute [READ, READ, WRITE, READ, READ] in three waves', async () => {
    const executionLog: string[] = [];
    mockExecutor.execute.mockImplementation(async ({ call }) => {
      const id = call.request.callId;
      executionLog.push(`start-${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push(`end-${id}`);
      return {
        status: 'success',
        response: { callId: id, responseParts: [] },
      } as unknown as SuccessfulToolCall;
    });

    const req4: ToolCallRequestInfo = { ...req1, callId: 'call-4' };
    const req5: ToolCallRequestInfo = { ...req2, callId: 'call-5' };

    await scheduler.schedule([req1, req2, req3, req4, req5], signal);

    // Wave 1: call-1, call-2 (parallel)
    expect(executionLog.slice(0, 2)).toContain('start-call-1');
    expect(executionLog.slice(0, 2)).toContain('start-call-2');

    // Wave 2: call-3 (sequential)
    // Must start after both call-1 and call-2 end
    const start3 = executionLog.indexOf('start-call-3');
    expect(start3).toBeGreaterThan(executionLog.indexOf('end-call-1'));
    expect(start3).toBeGreaterThan(executionLog.indexOf('end-call-2'));
    const end3 = executionLog.indexOf('end-call-3');
    expect(end3).toBeGreaterThan(start3);

    // Wave 3: call-4, call-5 (parallel)
    // Must start after call-3 ends
    expect(executionLog.indexOf('start-call-4')).toBeGreaterThan(end3);
    expect(executionLog.indexOf('start-call-5')).toBeGreaterThan(end3);
  });
});
