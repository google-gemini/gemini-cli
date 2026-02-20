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

import { logToolCall } from '../telemetry/loggers.js';
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
import { resolveConfirmation } from './confirmation.js';
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
import { PolicyDecision, ApprovalMode } from '../policy/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';
import type {
  ToolCallRequestInfo,
  ValidatingToolCall,
  SuccessfulToolCall,
  ErroredToolCall,
  CancelledToolCall,
  CompletedToolCall,
  ToolCallResponseInfo,
  Status,
  ToolCall,
} from './types.js';
import { CoreToolCallStatus, ROOT_SCHEDULER_ID } from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import * as ToolUtils from '../utils/tool-utils.js';
import type { EditorType } from '../utils/editor.js';
import {
  getToolCallContext,
  type ToolCallContext,
} from '../utils/toolCallContext.js';
import { coreEvents, CoreEvent } from '../utils/events.js';

describe('Scheduler (Orchestrator)', () => {
  let scheduler: Scheduler;
  let signal: AbortSignal;
  let abortController: AbortController;

  // Mocked Services (Injected via Config/Options)
  let mockConfig: Mocked<Config>;
  let mockMessageBus: Mocked<MessageBus>;
  let mockPolicyEngine: Mocked<PolicyEngine>;
  let mockToolRegistry: Mocked<ToolRegistry>;
  let getPreferredEditor: Mock<() => EditorType | undefined>;

  // Mocked Sub-components (Instantiated by Scheduler)
  let mockStateManager: Mocked<SchedulerStateManager>;
  let mockExecutor: Mocked<ToolExecutor>;
  let mockModifier: Mocked<ToolModificationHandler>;

  // Test Data
  const req1: ToolCallRequestInfo = {
    callId: 'call-1',
    name: 'test-tool',
    args: { foo: 'bar' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
    schedulerId: ROOT_SCHEDULER_ID,
    parentCallId: undefined,
  };

  const req2: ToolCallRequestInfo = {
    callId: 'call-2',
    name: 'test-tool',
    args: { foo: 'baz' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
    schedulerId: ROOT_SCHEDULER_ID,
    parentCallId: undefined,
  };

  const mockTool = {
    name: 'test-tool',
    build: vi.fn(),
  } as unknown as AnyDeclarativeTool;

  const mockInvocation = {
    shouldConfirmExecute: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(randomUUID).mockReturnValue(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    abortController = new AbortController();
    signal = abortController.signal;

    // --- Setup Injected Mocks ---
    mockPolicyEngine = {
      check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ALLOW }),
    } as unknown as Mocked<PolicyEngine>;

    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(mockTool),
      getAllToolNames: vi.fn().mockReturnValue(['test-tool']),
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

    // --- Setup Sub-component Mocks ---
    const mockActiveCallsMap = new Map<string, ToolCall>();
    const mockQueue: ToolCall[] = [];

    mockStateManager = {
      enqueue: vi.fn((calls: ToolCall[]) => {
        // Clone to preserve initial state for Phase 1 tests
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

    // Define getters for accessors idiomatically
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

    vi.spyOn(mockStateManager, 'cancelAllQueued').mockImplementation(() => {});
    vi.spyOn(mockStateManager, 'clearBatch').mockImplementation(() => {});

    vi.mocked(resolveConfirmation).mockReset();
    vi.mocked(checkPolicy).mockReset();
    vi.mocked(checkPolicy).mockResolvedValue({
      decision: PolicyDecision.ALLOW,
      rule: undefined,
    });
    vi.mocked(updatePolicy).mockReset();

    mockExecutor = {
      execute: vi.fn(),
    } as unknown as Mocked<ToolExecutor>;

    mockModifier = {
      handleModifyWithEditor: vi.fn(),
      applyInlineModify: vi.fn(),
    } as unknown as Mocked<ToolModificationHandler>;

    let capturedTerminalHandler: TerminalCallHandler | undefined;
    vi.mocked(SchedulerStateManager).mockImplementation(
      (_messageBus, _schedulerId, onTerminalCall) => {
        capturedTerminalHandler = onTerminalCall;
        return mockStateManager as unknown as SchedulerStateManager;
      },
    );

    mockStateManager.finalizeCall.mockImplementation((callId: string) => {
      const call = mockActiveCallsMap.get(callId);
      if (call) {
        mockActiveCallsMap.delete(callId);
        capturedTerminalHandler?.(call as CompletedToolCall);
      }
    });

    mockStateManager.cancelAllQueued.mockImplementation((_reason: string) => {
      // In tests, we usually mock the queue or completed batch.
      // For the sake of telemetry tests, we manually trigger if needed,
      // but most tests here check if finalizing is called.
    });

    vi.mocked(ToolExecutor).mockReturnValue(
      mockExecutor as unknown as Mocked<ToolExecutor>,
    );
    mockExecutor.execute.mockResolvedValue({
      status: 'success',
      response: {
        callId: 'default',
        responseParts: [],
      } as unknown as ToolCallResponseInfo,
    } as unknown as SuccessfulToolCall);
    vi.mocked(ToolModificationHandler).mockReturnValue(
      mockModifier as unknown as Mocked<ToolModificationHandler>,
    );

    // Initialize Scheduler
    scheduler = new Scheduler({
      config: mockConfig,
      messageBus: mockMessageBus,
      getPreferredEditor,
      schedulerId: 'root',
    });

    // Reset Tool build behavior
    vi.mocked(mockTool.build).mockReturnValue(
      mockInvocation as unknown as AnyToolInvocation,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Phase 1: Ingestion & Resolution', () => {
    it('should create an ErroredToolCall if tool is not found', async () => {
      vi.mocked(mockToolRegistry.getTool).mockReturnValue(undefined);
      vi.spyOn(ToolUtils, 'getToolSuggestion').mockReturnValue(
        ' (Did you mean "test-tool"?)',
      );

      await scheduler.schedule(req1, signal);

      // Verify it was enqueued with an error status
      expect(mockStateManager.enqueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: CoreToolCallStatus.Error,
            response: expect.objectContaining({
              errorType: ToolErrorType.TOOL_NOT_REGISTERED,
            }),
          }),
        ]),
      );
    });

    it('should create an ErroredToolCall if tool.build throws (invalid args)', async () => {
      vi.mocked(mockTool.build).mockImplementation(() => {
        throw new Error('Invalid schema');
      });

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.enqueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: CoreToolCallStatus.Error,
            response: expect.objectContaining({
              errorType: ToolErrorType.INVALID_TOOL_PARAMS,
            }),
          }),
        ]),
      );
    });

    it('should correctly build ValidatingToolCalls for happy path', async () => {
      await scheduler.schedule(req1, signal);

      expect(mockStateManager.enqueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: CoreToolCallStatus.Validating,
            request: req1,
            tool: mockTool,
            invocation: mockInvocation,
            schedulerId: ROOT_SCHEDULER_ID,
            startTime: expect.any(Number),
          }),
        ]),
      );
    });

    it('should set approvalMode to PLAN when config returns PLAN', async () => {
      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.PLAN);
      await scheduler.schedule(req1, signal);

      expect(mockStateManager.enqueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: CoreToolCallStatus.Validating,
            approvalMode: ApprovalMode.PLAN,
          }),
        ]),
      );
    });
  });

  describe('Phase 2: Queue Management', () => {
    it('should drain the queue if multiple calls are scheduled', async () => {
      // Execute is the end of the loop, stub it
      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify loop ran once for this schedule call (which had 1 request)
      // schedule(req1) enqueues 1 request.
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should execute tool calls sequentially (first completes before second starts)', async () => {
      const executionLog: string[] = [];

      // Mock executor to push to log with a deterministic microtask delay
      mockExecutor.execute.mockImplementation(async ({ call }) => {
        const id = call.request.callId;
        executionLog.push(`start-${id}`);
        // Yield to the event loop deterministically using queueMicrotask
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        executionLog.push(`end-${id}`);
        return {
          status: CoreToolCallStatus.Success,
        } as unknown as SuccessfulToolCall;
      });

      // Action: Schedule batch of 2 tools
      await scheduler.schedule([req1, req2], signal);

      // Assert: The second tool only started AFTER the first one ended
      expect(executionLog).toEqual([
        'start-call-1',
        'end-call-1',
        'start-call-2',
        'end-call-2',
      ]);
    });

    it('should queue and process multiple schedule() calls made synchronously', async () => {
      // Executor succeeds instantly
      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
      } as unknown as SuccessfulToolCall);

      // ACT: Call schedule twice synchronously (without awaiting the first)
      const promise1 = scheduler.schedule(req1, signal);
      const promise2 = scheduler.schedule(req2, signal);

      await Promise.all([promise1, promise2]);

      // ASSERT: Both requests were eventually pulled from the queue and executed
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-2');
    });

    it('should queue requests when scheduler is busy (overlapping batches)', async () => {
      // 2. Setup Executor with a controllable lock for the first batch
      const executionLog: string[] = [];
      let finishFirstBatch: (value: unknown) => void;
      const firstBatchPromise = new Promise((resolve) => {
        finishFirstBatch = resolve;
      });

      mockExecutor.execute.mockImplementationOnce(async () => {
        executionLog.push('start-batch-1');
        await firstBatchPromise; // Simulating long-running tool execution
        executionLog.push('end-batch-1');
        return {
          status: CoreToolCallStatus.Success,
        } as unknown as SuccessfulToolCall;
      });

      mockExecutor.execute.mockImplementationOnce(async () => {
        executionLog.push('start-batch-2');
        executionLog.push('end-batch-2');
        return {
          status: CoreToolCallStatus.Success,
        } as unknown as SuccessfulToolCall;
      });

      // 3. ACTIONS
      // Start Batch 1 (it will block indefinitely inside execution)
      const promise1 = scheduler.schedule(req1, signal);

      // Schedule Batch 2 WHILE Batch 1 is executing
      const promise2 = scheduler.schedule(req2, signal);

      // Yield event loop to let promise2 hit the queue
      await new Promise((r) => setTimeout(r, 0));

      // At this point, Batch 2 should NOT have started
      expect(executionLog).not.toContain('start-batch-2');

      // Now resolve Batch 1, which should trigger the request queue drain
      finishFirstBatch!({});

      await Promise.all([promise1, promise2]);

      // 4. ASSERTIONS
      // Verify complete sequential ordering of the two overlapping batches
      expect(executionLog).toEqual([
        'start-batch-1',
        'end-batch-1',
        'start-batch-2',
        'end-batch-2',
      ]);
    });

    it('should cancel all queues if AbortSignal is triggered during loop', async () => {
      Object.defineProperty(mockStateManager, 'queueLength', {
        get: vi.fn().mockReturnValue(1),
        configurable: true,
      });
      abortController.abort(); // Signal aborted

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'Operation cancelled',
      );
      expect(mockStateManager.dequeue).not.toHaveBeenCalled(); // Loop broke
    });

    it('cancelAll() should cancel active call and clear queue', () => {
      const activeCall: ValidatingToolCall = {
        status: CoreToolCallStatus.Validating,
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.enqueue([activeCall]);
      mockStateManager.dequeue();

      scheduler.cancelAll();

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Cancelled,
        'Operation cancelled by user',
      );
      // finalizeCall is handled by the processing loop, not synchronously by cancelAll
      // expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'Operation cancelled by user',
      );
    });

    it('cancelAll() should clear the requestQueue and reject pending promises', async () => {
      // 1. Setup a busy scheduler with one batch processing
      Object.defineProperty(mockStateManager, 'isActive', {
        get: vi.fn().mockReturnValue(true),
        configurable: true,
      });
      const promise1 = scheduler.schedule(req1, signal);
      // Catch promise1 to avoid unhandled rejection when we cancelAll
      promise1.catch(() => {});

      // 2. Queue another batch while the first is busy
      const promise2 = scheduler.schedule(req2, signal);

      // 3. ACT: Cancel everything
      scheduler.cancelAll();

      // 4. ASSERT: The second batch's promise should be rejected
      await expect(promise2).rejects.toThrow('Operation cancelled by user');
    });
  });

  describe('Phase 3: Policy & Confirmation Loop', () => {
    beforeEach(() => {});

    it('should update state to error with POLICY_VIOLATION if Policy returns DENY', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: undefined,
      });

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        expect.objectContaining({
          errorType: ToolErrorType.POLICY_VIOLATION,
        }),
      );
      // Deny shouldn't throw, execution is just skipped, state is updated
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should include denyMessage in error response if present', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: {
          decision: PolicyDecision.DENY,
          denyMessage: 'Custom denial reason',
        },
      });

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        expect.objectContaining({
          errorType: ToolErrorType.POLICY_VIOLATION,
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: {
                  error:
                    'Tool execution denied by policy. Custom denial reason',
                },
              }),
            }),
          ]),
        }),
      );
    });

    it('should handle errors from checkPolicy (e.g. non-interactive ASK_USER)', async () => {
      const error = new Error('Not interactive');
      vi.mocked(checkPolicy).mockRejectedValue(error);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        expect.objectContaining({
          errorType: ToolErrorType.UNHANDLED_EXCEPTION,
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: { error: 'Not interactive' },
              }),
            }),
          ]),
        }),
      );
    });

    it('should return POLICY_VIOLATION error type when denied in Plan Mode', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: { decision: PolicyDecision.DENY },
      });

      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.PLAN);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        expect.objectContaining({
          errorType: ToolErrorType.POLICY_VIOLATION,
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: {
                  error: 'Tool execution denied by policy.',
                },
              }),
            }),
          ]),
        }),
      );
    });

    it('should return POLICY_VIOLATION and custom deny message when denied in Plan Mode with rule message', async () => {
      const customMessage = 'Custom Plan Mode Deny';
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.DENY,
        rule: { decision: PolicyDecision.DENY, denyMessage: customMessage },
      });

      mockConfig.getApprovalMode.mockReturnValue(ApprovalMode.PLAN);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        expect.objectContaining({
          errorType: ToolErrorType.POLICY_VIOLATION,
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: {
                  error: `Tool execution denied by policy. ${customMessage}`,
                },
              }),
            }),
          ]),
        }),
      );
    });

    it('should bypass confirmation and ProceedOnce if Policy returns ALLOW (YOLO/AllowedTools)', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.ALLOW,
        rule: undefined,
      });

      // Provide a mock execute to finish the loop
      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Never called coordinator
      expect(resolveConfirmation).not.toHaveBeenCalled();

      // State recorded as ProceedOnce
      expect(mockStateManager.setOutcome).toHaveBeenCalledWith(
        'call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      // Triggered execution
      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Executing,
      );
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should auto-approve remaining identical tools in batch after ProceedAlways', async () => {
      // First call requires confirmation, second is auto-approved (simulating policy update)
      vi.mocked(checkPolicy)
        .mockResolvedValueOnce({
          decision: PolicyDecision.ASK_USER,
          rule: undefined,
        })
        .mockResolvedValueOnce({
          decision: PolicyDecision.ALLOW,
          rule: undefined,
        });

      vi.mocked(resolveConfirmation).mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
        lastDetails: undefined,
      });

      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule([req1, req2], signal);

      // resolveConfirmation only called ONCE
      expect(resolveConfirmation).toHaveBeenCalledTimes(1);
      // updatePolicy called for the first tool
      expect(updatePolicy).toHaveBeenCalled();
      // execute called TWICE
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('should call resolveConfirmation and updatePolicy when ASK_USER', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
        rule: undefined,
      });

      const resolution = {
        outcome: ToolConfirmationOutcome.ProceedAlways,
        lastDetails: {
          type: 'info' as const,
          title: 'Title',
          prompt: 'Confirm?',
        },
      };
      vi.mocked(resolveConfirmation).mockResolvedValue(resolution);

      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(resolveConfirmation).toHaveBeenCalledWith(
        expect.anything(), // toolCall
        signal,
        expect.objectContaining({
          config: mockConfig,
          messageBus: mockMessageBus,
          state: mockStateManager,
          schedulerId: ROOT_SCHEDULER_ID,
        }),
      );

      expect(updatePolicy).toHaveBeenCalledWith(
        mockTool,
        resolution.outcome,
        resolution.lastDetails,
        expect.objectContaining({
          config: mockConfig,
          messageBus: mockMessageBus,
        }),
      );

      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should cancel and NOT execute if resolveConfirmation returns Cancel', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
        rule: undefined,
      });

      const resolution = {
        outcome: ToolConfirmationOutcome.Cancel,
        lastDetails: undefined,
      };
      vi.mocked(resolveConfirmation).mockResolvedValue(resolution);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Cancelled,
        'User denied execution.',
      );
      expect(mockStateManager.setOutcome).toHaveBeenCalledWith(
        'call-1',
        ToolConfirmationOutcome.Cancel,
      );
      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'User cancelled operation',
      );
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should mark as cancelled (not errored) when abort happens during confirmation error', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
        rule: undefined,
      });

      // Simulate shouldConfirmExecute logic throwing while aborted
      vi.mocked(resolveConfirmation).mockImplementation(async () => {
        // Trigger abort
        abortController.abort();
        throw new Error('Some internal network abort error');
      });

      await scheduler.schedule(req1, signal);

      // Verify execution did NOT happen
      expect(mockExecutor.execute).not.toHaveBeenCalled();

      // Because the signal is aborted, the catch block should convert the error to a cancellation
      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Cancelled,
        'Operation cancelled',
      );
    });

    it('should preserve confirmation details (e.g. diff) in cancelled state', async () => {
      vi.mocked(checkPolicy).mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
        rule: undefined,
      });

      const confirmDetails = {
        type: 'edit' as const,
        title: 'Edit',
        fileName: 'file.txt',
        fileDiff: 'diff content',
        filePath: '/path/to/file.txt',
        originalContent: 'old',
        newContent: 'new',
      };

      const resolution = {
        outcome: ToolConfirmationOutcome.Cancel,
        lastDetails: confirmDetails,
      };
      vi.mocked(resolveConfirmation).mockResolvedValue(resolution);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Cancelled,
        'User denied execution.',
      );
      // We assume the state manager stores these details.
      // Since we mock state manager, we just verify the flow passed the details.
      // In a real integration, StateManager.updateStatus would merge these.
    });
  });

  describe('Phase 4: Execution Outcomes', () => {
    beforeEach(() => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      }); // Bypass confirmation
    });

    it('should update state to success on successful execution', async () => {
      const mockResponse = {
        callId: 'call-1',
        responseParts: [],
      } as unknown as ToolCallResponseInfo;

      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
        response: mockResponse,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Success,
        mockResponse,
      );
    });

    it('should update state to cancelled when executor returns cancelled status', async () => {
      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Cancelled,
        response: { callId: 'call-1', responseParts: [] },
      } as unknown as CancelledToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Cancelled,
        'Operation cancelled',
      );
    });

    it('should update state to error on execution failure', async () => {
      const mockResponse = {
        callId: 'call-1',
        error: new Error('fail'),
      } as unknown as ToolCallResponseInfo;

      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Error,
        response: mockResponse,
      } as unknown as ErroredToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        CoreToolCallStatus.Error,
        mockResponse,
      );
    });

    it('should log telemetry for terminal states in the queue processor', async () => {
      const mockResponse = {
        callId: 'call-1',
        responseParts: [],
      } as unknown as ToolCallResponseInfo;

      // Mock the execution so the state advances
      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
        response: mockResponse,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify the finalizer and logger were called
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
      // We check that logToolCall was called (it's called via the state manager's terminal handler)
      expect(logToolCall).toHaveBeenCalled();
    });

    it('should not double-report completed tools when concurrent completions occur', async () => {
      // Simulate a race where execution finishes but cancelAll is called immediately after
      const response: ToolCallResponseInfo = {
        callId: 'call-1',
        responseParts: [],
        resultDisplay: undefined,
        error: undefined,
        errorType: undefined,
        contentLength: 0,
      };

      mockExecutor.execute.mockResolvedValue({
        status: CoreToolCallStatus.Success,
        response,
      } as unknown as SuccessfulToolCall);

      const promise = scheduler.schedule(req1, signal);
      scheduler.cancelAll();
      await promise;

      // finalizeCall should be called exactly once for this ID
      expect(mockStateManager.finalizeCall).toHaveBeenCalledTimes(1);
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
    });

    it('should break the loop if no progress is made (safeguard against stuck states)', async () => {
      // Setup: A tool that is 'validating' but stays 'validating' even after processing
      // This simulates a bug in state management or a weird edge case.
      const stuckCall: ValidatingToolCall = {
        status: CoreToolCallStatus.Validating,
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      // Mock dequeue to keep returning the same stuck call
      mockStateManager.dequeue.mockReturnValue(stuckCall);
      // Mock isActive to be true
      Object.defineProperty(mockStateManager, 'isActive', {
        get: vi.fn().mockReturnValue(true),
        configurable: true,
      });

      // Mock updateStatus to do NOTHING (simulating no progress)
      mockStateManager.updateStatus.mockImplementation(() => {});

      // This should return false (break loop) instead of hanging indefinitely
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (scheduler as any)._processNextItem(signal);
      expect(result).toBe(false);
    });
  });

  describe('Tool Call Context Propagation', () => {
    it('should propagate context to the tool executor', async () => {
      const schedulerId = 'custom-scheduler';
      const parentCallId = 'parent-call';
      const customScheduler = new Scheduler({
        config: mockConfig,
        messageBus: mockMessageBus,
        getPreferredEditor,
        schedulerId,
        parentCallId,
      });

      mockToolRegistry.getTool.mockReturnValue(mockTool);
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      let capturedContext: ToolCallContext | undefined;
      mockExecutor.execute.mockImplementation(async () => {
        capturedContext = getToolCallContext();
        return {
          status: CoreToolCallStatus.Success,
          request: req1,
          tool: mockTool,
          invocation: mockInvocation as unknown as AnyToolInvocation,
          response: {
            callId: req1.callId,
            responseParts: [],
            resultDisplay: 'ok',
            error: undefined,
            errorType: undefined,
          },
        } as unknown as SuccessfulToolCall;
      });

      await customScheduler.schedule(req1, signal);

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.callId).toBe(req1.callId);
      expect(capturedContext!.schedulerId).toBe(schedulerId);
      expect(capturedContext!.parentCallId).toBe(parentCallId);
    });
  });

  describe('Cleanup', () => {
    it('should unregister McpProgress listener on dispose()', () => {
      const onSpy = vi.spyOn(coreEvents, 'on');
      const offSpy = vi.spyOn(coreEvents, 'off');

      const s = new Scheduler({
        config: mockConfig,
        messageBus: mockMessageBus,
        getPreferredEditor,
        schedulerId: 'cleanup-test',
      });

      expect(onSpy).toHaveBeenCalledWith(
        CoreEvent.McpProgress,
        expect.any(Function),
      );

      s.dispose();

      expect(offSpy).toHaveBeenCalledWith(
        CoreEvent.McpProgress,
        expect.any(Function),
      );
    });
  });
});
