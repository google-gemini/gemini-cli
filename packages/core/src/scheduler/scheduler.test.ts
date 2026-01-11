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

// 1. Mock External Dependencies
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan: vi.fn(async (_opts, fn) =>
    fn({ metadata: { input: {}, output: {} } }),
  ),
}));

// Mock Telemetry
import { logToolCall } from '../telemetry/loggers.js';
import { ToolCallEvent } from '../telemetry/types.js';
vi.mock('../telemetry/loggers.js', () => ({
  logToolCall: vi.fn(),
}));
vi.mock('../telemetry/types.js', () => ({
  ToolCallEvent: vi.fn().mockImplementation((call) => ({ ...call })),
}));

// Mock Hook Triggers
import { fireToolNotificationHook } from '../core/coreToolHookTriggers.js';
vi.mock('../core/coreToolHookTriggers.js', () => ({
  fireToolNotificationHook: vi.fn(),
}));

// 2. Mock Internal Scheduler Sub-components
import { SchedulerStateManager } from './state-manager.js';
import { ConfirmationCoordinator } from './confirmation-coordinator.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolModificationHandler } from './tool-modifier.js';

vi.mock('./state-manager.js');
vi.mock('./confirmation-coordinator.js');
vi.mock('./tool-executor.js');
vi.mock('./tool-modifier.js');

// Imports for setup
import { Scheduler } from './scheduler.js';
import type { Config } from '../config/config.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { PolicyDecision, ApprovalMode } from '../policy/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import type {
  ToolCallRequestInfo,
  ValidatingToolCall,
  SuccessfulToolCall,
  ErroredToolCall,
  ToolCallResponseInfo,
} from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import * as ToolUtils from '../utils/tool-utils.js';
import type { EditorType } from '../utils/editor.js';

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
  let mockCoordinator: Mocked<ConfirmationCoordinator>;
  let mockExecutor: Mocked<ToolExecutor>;
  let mockModifier: Mocked<ToolModificationHandler>;

  // Test Data
  const req1: ToolCallRequestInfo = {
    callId: 'call-1',
    name: 'test-tool',
    args: { foo: 'bar' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
  };

  const req2: ToolCallRequestInfo = {
    callId: 'call-2',
    name: 'test-tool',
    args: { foo: 'baz' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
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
    } as unknown as Mocked<Config>;

    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as Mocked<MessageBus>;

    getPreferredEditor = vi.fn().mockReturnValue('vim');

    // --- Setup Sub-component Mocks ---
    mockStateManager = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      hasActiveCalls: vi.fn().mockReturnValue(false),
      getQueueLength: vi.fn().mockReturnValue(0),
      getFirstActiveCall: vi.fn(),
      getToolCall: vi.fn(),
      updateStatus: vi.fn(),
      finalizeCall: vi.fn(),
      updateArgs: vi.fn(),
      setOutcome: vi.fn(),
      cancelAllQueued: vi.fn(),
      clearBatch: vi.fn(),
      getCompletedBatch: vi.fn(),
    } as unknown as Mocked<SchedulerStateManager>;

    mockCoordinator = {
      awaitConfirmation: vi.fn(),
    } as unknown as Mocked<ConfirmationCoordinator>;

    mockExecutor = {
      execute: vi.fn(),
    } as unknown as Mocked<ToolExecutor>;

    mockModifier = {
      handleModifyWithEditor: vi.fn(),
      applyInlineModify: vi.fn(),
    } as unknown as Mocked<ToolModificationHandler>;

    // Wire up class constructors to return our mock instances
    vi.mocked(SchedulerStateManager).mockReturnValue(mockStateManager);
    vi.mocked(ConfirmationCoordinator).mockReturnValue(mockCoordinator);
    vi.mocked(ToolExecutor).mockReturnValue(mockExecutor);
    vi.mocked(ToolModificationHandler).mockReturnValue(mockModifier);

    // Initialize Scheduler
    scheduler = new Scheduler({
      config: mockConfig,
      messageBus: mockMessageBus,
      getPreferredEditor,
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
            status: 'error',
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
            status: 'error',
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
            status: 'validating',
            request: req1,
            tool: mockTool,
            invocation: mockInvocation,
          }),
        ]),
      );
    });
  });

  describe('Phase 2: Queue Management', () => {
    it('should drain the queue if multiple calls are scheduled', async () => {
      // Setup queue simulation: two items
      mockStateManager.getQueueLength
        .mockReturnValueOnce(2) // 1st iteration: queue has 2
        .mockReturnValueOnce(1) // 2nd iteration: queue has 1
        .mockReturnValue(0);

      mockStateManager.hasActiveCalls.mockReturnValue(false);

      const validatingCall: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.dequeue.mockReturnValue(validatingCall);
      mockStateManager.getFirstActiveCall.mockReturnValue(validatingCall);

      // Execute is the end of the loop, stub it
      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify loop ran twice
      expect(mockStateManager.dequeue).toHaveBeenCalledTimes(2);
      expect(mockStateManager.finalizeCall).toHaveBeenCalledTimes(2);
    });

    it('should execute tool calls sequentially (first completes before second starts)', async () => {
      // Setup queue simulation: two items
      mockStateManager.getQueueLength
        .mockReturnValueOnce(2) // 1st iteration: queue has 2
        .mockReturnValueOnce(1) // 2nd iteration: queue has 1
        .mockReturnValue(0);

      mockStateManager.hasActiveCalls.mockReturnValue(false);

      const validatingCall1: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      const validatingCall2: ValidatingToolCall = {
        status: 'validating',
        request: req2,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.dequeue
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2)
        .mockReturnValue(undefined);

      mockStateManager.getFirstActiveCall
        .mockReturnValueOnce(validatingCall1) // Used in loop check for call 1
        .mockReturnValueOnce(validatingCall1) // Used in _execute for call 1
        .mockReturnValueOnce(validatingCall2) // Used in loop check for call 2
        .mockReturnValueOnce(validatingCall2); // Used in _execute for call 2

      const executionLog: string[] = [];

      // Mock executor to push to log with a deterministic microtask delay
      mockExecutor.execute.mockImplementation(async ({ call }) => {
        const id = call.request.callId;
        executionLog.push(`start-${id}`);
        // Yield to the event loop deterministically without timers
        await Promise.resolve();
        executionLog.push(`end-${id}`);
        return { status: 'success' } as unknown as SuccessfulToolCall;
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
      const validatingCall1: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      const validatingCall2: ValidatingToolCall = {
        status: 'validating',
        request: req2, // Second request
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      // Mock state responses dynamically
      mockStateManager.hasActiveCalls.mockReturnValue(false);

      // Queue state responses for the two batches:
      // Batch 1: length 1 -> 0
      // Batch 2: length 1 -> 0
      mockStateManager.getQueueLength
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);

      mockStateManager.dequeue
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2);

      mockStateManager.getFirstActiveCall
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2)
        .mockReturnValueOnce(validatingCall2);

      // Executor succeeds instantly
      mockExecutor.execute.mockResolvedValue({
        status: 'success',
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
      const validatingCall1: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      const validatingCall2: ValidatingToolCall = {
        status: 'validating',
        request: req2, // Second request
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      // 1. Setup State Manager for 2 sequential batches
      mockStateManager.hasActiveCalls.mockReturnValue(false);

      mockStateManager.getQueueLength
        .mockReturnValueOnce(1) // Batch 1
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1) // Batch 2
        .mockReturnValue(0);

      mockStateManager.dequeue
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2);

      mockStateManager.getFirstActiveCall
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2)
        .mockReturnValueOnce(validatingCall2);

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
        return { status: 'success' } as unknown as SuccessfulToolCall;
      });

      mockExecutor.execute.mockImplementationOnce(async () => {
        executionLog.push('start-batch-2');
        executionLog.push('end-batch-2');
        return { status: 'success' } as unknown as SuccessfulToolCall;
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
      mockStateManager.getQueueLength.mockReturnValue(1);
      abortController.abort(); // Signal aborted

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'Operation cancelled',
      );
      expect(mockStateManager.dequeue).not.toHaveBeenCalled(); // Loop broke
    });

    it('cancelAll() should cancel active call and clear queue', () => {
      const activeCall: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.getFirstActiveCall.mockReturnValue(activeCall);

      scheduler.cancelAll();

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'cancelled',
        'Operation cancelled by user',
      );
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'Operation cancelled by user',
      );
    });

    it('cancelAll() should clear the requestQueue and reject pending promises', async () => {
      // 1. Setup a busy scheduler with one batch processing
      mockStateManager.hasActiveCalls.mockReturnValue(true);
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
    const validatingCall: ValidatingToolCall = {
      status: 'validating',
      request: req1,
      tool: mockTool,
      invocation: mockInvocation as unknown as AnyToolInvocation,
    };

    beforeEach(() => {
      mockStateManager.getQueueLength.mockReturnValueOnce(1).mockReturnValue(0);
      mockStateManager.dequeue.mockReturnValue(validatingCall);
      mockStateManager.getFirstActiveCall.mockReturnValue(validatingCall);
    });

    it('should update state to error with POLICY_VIOLATION if Policy returns DENY', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.DENY,
      });

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'error',
        expect.objectContaining({
          errorType: ToolErrorType.POLICY_VIOLATION,
        }),
      );
      // Deny shouldn't throw, execution is just skipped, state is updated
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should throw if Policy requires ASK_USER but UI is not interactive', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });
      mockConfig.isInteractive.mockReturnValue(false);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'error',
        expect.objectContaining({
          errorType: ToolErrorType.UNHANDLED_EXCEPTION,
          error: expect.objectContaining({
            message:
              'Tool execution for "test-tool" requires user confirmation, which is not supported in non-interactive mode.',
          }),
        }),
      );
    });

    it('should pass serverName to policy engine for DiscoveredMCPTool', async () => {
      // Create a mock MCP tool
      const mcpTool = Object.create(DiscoveredMCPTool.prototype);
      mcpTool.name = 'mcp-tool';
      mcpTool.serverName = 'my-server';
      mcpTool.build = vi.fn().mockReturnValue(mockInvocation);

      // Setup state manager with the MCP tool call
      const mcpCall: ValidatingToolCall = {
        status: 'validating',
        request: req1,
        tool: mcpTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.dequeue.mockReturnValue(mcpCall);
      mockStateManager.getFirstActiveCall.mockReturnValue(mcpCall);

      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Provide a mock execute to finish the loop
      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify serverName was passed to check
      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        { name: req1.name, args: req1.args },
        'my-server',
      );
    });

    it('should pass undefined serverName to policy engine for non-MCP tools', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Provide a mock execute to finish the loop
      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify undefined was passed to check for standard tool
      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        { name: req1.name, args: req1.args },
        undefined,
      );
    });

    it('should bypass confirmation and ProceedOnce if Policy returns ALLOW', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Provide a mock execute to finish the loop
      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Never called coordinator
      expect(mockCoordinator.awaitConfirmation).not.toHaveBeenCalled();

      // State recorded as ProceedOnce
      expect(mockStateManager.setOutcome).toHaveBeenCalledWith(
        'call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      // Triggered execution
      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'executing',
      );
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should fire notification hooks before pausing for user confirmation', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const confirmDetails = { type: 'info', prompt: 'test' };
      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue(
        confirmDetails,
      );

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedOnce,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(fireToolNotificationHook).toHaveBeenCalledWith(
        mockMessageBus,
        expect.objectContaining(confirmDetails),
      );
    });

    it('should publish UPDATE_POLICY if user selects ProceedAlways', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'info',
        prompt: 'test',
        title: 'test',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.UPDATE_POLICY,
        toolName: 'test-tool',
        persist: false,
      });
    });

    it('should scope shell command policy to rootCommands array', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'exec',
        title: 'Shell Command',
        command: 'gh pr checkout 123',
        rootCommand: 'gh',
        rootCommands: ['gh'],
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          commandPrefix: ['gh'],
        }),
      );
    });

    it('should scope compound shell command policy to multiple rootCommands', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'exec',
        title: 'Shell Command',
        command: 'whoami && echo hello',
        rootCommand: 'whoami, echo',
        rootCommands: ['whoami', 'echo'],
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          commandPrefix: ['whoami', 'echo'],
          persist: false,
        }),
      );
    });

    it('should set persist flag correctly for Shell commands with ProceedAlwaysAndSave', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'exec',
        title: 'Shell Command',
        command: 'ls -la',
        rootCommand: 'ls',
        rootCommands: ['ls'],
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlwaysAndSave,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          commandPrefix: ['ls'],
          persist: true,
        }),
      );
    });

    it('should scope MCP tool policy to serverName', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'mcp',
        title: 'MCP Tool',
        serverName: 'my-server',
        toolName: 'my-tool',
        toolDisplayName: 'My Tool',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          mcpName: 'my-server',
        }),
      );
    });

    it('should handle ProceedAlwaysTool for MCP tools', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'mcp',
        title: 'MCP Tool',
        serverName: 'my-server',
        toolName: 'my-tool',
        toolDisplayName: 'My Tool',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlwaysTool,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          mcpName: 'my-server',
          persist: false,
        }),
      );
    });

    it('should handle ProceedAlwaysServer for MCP tools using wildcard toolName', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'mcp',
        title: 'MCP Tool',
        serverName: 'my-server',
        toolName: 'my-tool',
        toolDisplayName: 'My Tool',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlwaysServer,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'my-server__*',
          mcpName: 'my-server',
          persist: false,
        }),
      );
    });

    it('should handle ProceedAlwaysAndSave for MCP tools with persist: true', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'mcp',
        title: 'MCP Tool',
        serverName: 'my-server',
        toolName: 'my-tool',
        toolDisplayName: 'My Tool',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlwaysAndSave,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          mcpName: 'my-server',
          persist: true,
        }),
      );
    });

    it('should trigger AUTO_EDIT approval mode and NOT publish UPDATE_POLICY for auto-edit tools', async () => {
      // 1. Setup an auto-edit tool (e.g., 'replace')
      const editReq: ToolCallRequestInfo = {
        ...req1,
        name: 'replace',
      };
      const editTool = {
        name: 'replace',
        build: vi.fn().mockReturnValue(mockInvocation),
      } as unknown as AnyDeclarativeTool;

      vi.mocked(mockToolRegistry.getTool).mockReturnValue(editTool);
      mockConfig.setApprovalMode = vi.fn();

      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'edit',
        title: 'Edit File',
        fileName: 'test.ts',
        filePath: 'test.ts',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      // 2. Mock state responses for this tool call
      const editValidatingCall: ValidatingToolCall = {
        status: 'validating',
        request: editReq,
        tool: editTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.dequeue.mockReturnValue(editValidatingCall);
      mockStateManager.getFirstActiveCall.mockReturnValue(editValidatingCall);
      mockStateManager.getToolCall.mockReturnValue(editValidatingCall);

      // 3. ACT
      await scheduler.schedule(editReq, signal);

      // 4. ASSERT: setApprovalMode was called with AUTO_EDIT
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );

      // 5. ASSERT: UPDATE_POLICY was NOT published
      expect(mockMessageBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
        }),
      );
    });

    it('should handle multi-step modification loop (Editor then Proceed)', async () => {
      // 1. Policy Requires Confirmation
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      // Tool confirms it has dynamic details
      const confirmDetails = { type: 'info', prompt: 'test' };
      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue(
        confirmDetails,
      );

      // 2. UI returns 'ModifyWithEditor' on first pass, 'ProceedOnce' on second
      mockCoordinator.awaitConfirmation
        .mockResolvedValueOnce({
          outcome: ToolConfirmationOutcome.ModifyWithEditor,
        })
        .mockResolvedValueOnce({
          outcome: ToolConfirmationOutcome.ProceedOnce,
        });

      // 3. Modifier successfully updates args
      mockModifier.handleModifyWithEditor.mockResolvedValue({
        updatedParams: { foo: 'mutated' },
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Assertions for the Loop logic:
      expect(mockCoordinator.awaitConfirmation).toHaveBeenCalledTimes(2);
      expect(mockModifier.handleModifyWithEditor).toHaveBeenCalledTimes(1);

      // Ensure state was updated with new args
      expect(mockStateManager.updateArgs).toHaveBeenCalledWith(
        'call-1',
        { foo: 'mutated' },
        expect.anything(),
      );

      // Final outcome recorded
      expect(mockStateManager.setOutcome).toHaveBeenCalledWith(
        'call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle multi-step modification loop (Inline payload then Proceed)', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });
      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'info',
        prompt: 'test',
      });

      // UI sends payload directly
      mockCoordinator.awaitConfirmation.mockResolvedValueOnce({
        outcome: ToolConfirmationOutcome.ProceedOnce,
        payload: { newContent: '{"foo": "inline"}' },
      });

      mockModifier.applyInlineModify.mockResolvedValue({
        updatedParams: { foo: 'inline' },
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockModifier.applyInlineModify).toHaveBeenCalledWith(
        validatingCall, // Cast in loop
        { newContent: '{"foo": "inline"}' },
        signal,
      );
      expect(mockStateManager.updateArgs).toHaveBeenCalledWith(
        'call-1',
        { foo: 'inline' },
        expect.anything(),
      );
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should auto-approve remaining identical tools in batch after ProceedAlways', async () => {
      // Setup queue simulation: two calls to the same tool
      mockStateManager.getQueueLength
        .mockReturnValueOnce(2)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);

      const validatingCall1: ValidatingToolCall = {
        status: 'validating',
        request: req1, // 'test-tool'
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      const validatingCall2: ValidatingToolCall = {
        status: 'validating',
        request: req2, // Also 'test-tool'
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };

      mockStateManager.dequeue
        .mockReturnValueOnce(validatingCall1)
        .mockReturnValueOnce(validatingCall2)
        .mockReturnValue(undefined);

      mockStateManager.getFirstActiveCall
        .mockReturnValueOnce(validatingCall1) // Loop 1 check
        .mockReturnValueOnce(validatingCall1) // Loop 1 execute
        .mockReturnValueOnce(validatingCall2) // Loop 2 check
        .mockReturnValueOnce(validatingCall2); // Loop 2 execute

      // Initial policy state: requires confirmation for both
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'info',
        prompt: 'test',
      });

      // User selects "ProceedAlways" for the first tool
      mockCoordinator.awaitConfirmation.mockResolvedValueOnce({
        outcome: ToolConfirmationOutcome.ProceedAlways,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      // Simulate the real system: When UPDATE_POLICY is published, the
      // policy engine updates its rules. We mock this by changing the policy
      // engine's return value when the bus receives the update event.
      mockMessageBus.publish.mockImplementation(async (msg) => {
        if (msg.type === MessageBusType.UPDATE_POLICY) {
          mockPolicyEngine.check.mockResolvedValue({
            decision: PolicyDecision.ALLOW,
          });
        }
      });

      // Action: Schedule both tools
      await scheduler.schedule([req1, req2], signal);

      // Assertions:
      // The coordinator was only called ONCE (for the first tool)
      expect(mockCoordinator.awaitConfirmation).toHaveBeenCalledTimes(1);

      // But both tools were executed successfully
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);

      // Verify the policy update was actually emitted
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
        }),
      );
    });

    it('should cancel and NOT execute if user Cancels', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });
      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'info',
        prompt: 'test',
      });

      // User cancels
      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.Cancel,
      });

      await scheduler.schedule(req1, signal);

      // Verify execution did NOT happen
      expect(mockExecutor.execute).not.toHaveBeenCalled();

      // Verify state manager got cancelled state
      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'cancelled',
        'User denied execution.',
      );

      // Verify cancellation cascaded to the rest of the queue
      expect(mockStateManager.cancelAllQueued).toHaveBeenCalledWith(
        'User cancelled operation',
      );
    });

    it('should mark as cancelled (not errored) when abort happens during shouldConfirmExecute', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      // Simulate shouldConfirmExecute doing work, getting aborted, and throwing
      vi.mocked(mockInvocation.shouldConfirmExecute).mockImplementation(() => {
        abortController.abort();
        throw new Error('Some internal network abort error');
      });

      await scheduler.schedule(req1, signal);

      // Verify execution did NOT happen
      expect(mockExecutor.execute).not.toHaveBeenCalled();

      // Because the signal is aborted, the catch block should convert the error to a cancellation
      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'cancelled',
        'Operation cancelled',
      );
    });

    it('should publish TOOL_CONFIRMATION_RESPONSE when IDE accepts', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const ideConfirmationPromise = Promise.resolve({
        status: 'accepted' as const,
        content: 'ide-modified-content',
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'edit',
        title: 'Edit File',
        fileName: 'test.ts',
        filePath: 'test.ts',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
        ideConfirmation: ideConfirmationPromise,
      });

      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedOnce,
        payload: { newContent: 'ide-modified-content' },
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      // Verify that the background IIFE published to the bus
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: '123e4567-e89b-12d3-a456-426614174000',
          confirmed: true,
          outcome: ToolConfirmationOutcome.ProceedOnce,
          payload: { newContent: 'ide-modified-content' },
        }),
      );
    });

    it('should publish TOOL_CONFIRMATION_RESPONSE when IDE rejects', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const ideConfirmationPromise = Promise.resolve({
        status: 'rejected' as const,
      });

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'edit',
        title: 'Edit File',
        fileName: 'test.ts',
        filePath: 'test.ts',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
        ideConfirmation: ideConfirmationPromise,
      });

      // Coordinator returns result
      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.Cancel,
      });

      await scheduler.schedule(req1, signal);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: '123e4567-e89b-12d3-a456-426614174000',
          confirmed: false,
          outcome: ToolConfirmationOutcome.Cancel,
        }),
      );
    });

    it('should fallback to TUI when IDE throws error', async () => {
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const ideConfirmationPromise = Promise.reject(new Error('IDE Crash'));

      vi.mocked(mockInvocation.shouldConfirmExecute).mockResolvedValue({
        type: 'edit',
        title: 'Edit File',
        fileName: 'test.ts',
        filePath: 'test.ts',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
        ideConfirmation: ideConfirmationPromise,
      });

      // Coordinator returns result from TUI instead
      mockCoordinator.awaitConfirmation.mockResolvedValue({
        outcome: ToolConfirmationOutcome.ProceedOnce,
      });

      mockExecutor.execute.mockResolvedValue({
        status: 'success',
      } as unknown as SuccessfulToolCall);

      // This should NOT throw, despite the IDE crash
      await expect(scheduler.schedule(req1, signal)).resolves.not.toThrow();

      // Verify execution still happened via TUI
      expect(mockExecutor.execute).toHaveBeenCalled();
    });
  });

  describe('Phase 4: Execution Outcomes', () => {
    const validatingCall: ValidatingToolCall = {
      status: 'validating',
      request: req1,
      tool: mockTool,
      invocation: mockInvocation as unknown as AnyToolInvocation,
    };

    beforeEach(() => {
      mockStateManager.getQueueLength.mockReturnValueOnce(1).mockReturnValue(0);
      mockStateManager.dequeue.mockReturnValue(validatingCall);
      mockStateManager.getFirstActiveCall.mockReturnValue(validatingCall);
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
        status: 'success',
        response: mockResponse,
      } as unknown as SuccessfulToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'success',
        mockResponse,
      );
    });

    it('should update state to error on execution failure', async () => {
      const mockResponse = {
        callId: 'call-1',
        error: new Error('fail'),
      } as unknown as ToolCallResponseInfo;

      mockExecutor.execute.mockResolvedValue({
        status: 'error',
        response: mockResponse,
      } as unknown as ErroredToolCall);

      await scheduler.schedule(req1, signal);

      expect(mockStateManager.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'error',
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
        status: 'success',
        response: mockResponse,
      } as unknown as SuccessfulToolCall);

      // Mock the state manager to return a SUCCESS state when getToolCall is
      // called
      const successfulCall: SuccessfulToolCall = {
        status: 'success',
        request: req1,
        response: mockResponse,
        tool: mockTool,
        invocation: mockInvocation as unknown as AnyToolInvocation,
      };
      mockStateManager.getToolCall.mockReturnValue(successfulCall);

      await scheduler.schedule(req1, signal);

      // Verify the finalizer and logger were called
      expect(mockStateManager.finalizeCall).toHaveBeenCalledWith('call-1');
      expect(ToolCallEvent).toHaveBeenCalledWith(successfulCall);
      expect(logToolCall).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining(successfulCall),
      );
    });
  });
});
