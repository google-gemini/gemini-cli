/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { CoreToolScheduler } from './coreToolScheduler.js';
import type {
  ToolCall,
  WaitingToolCall,
  ErroredToolCall,
} from '../scheduler/types.js';
import type {
  ToolCallConfirmationDetails,
  ToolConfirmationPayload,
  ToolInvocation,
  ToolResult,
  Config,
  ToolRegistry,
  MessageBus,
} from '../index.js';
import {
  DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolConfirmationOutcome,
  Kind,
  ApprovalMode,
  HookSystem,
  PolicyDecision,
} from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  MockModifiableTool,
  MockTool,
  MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
} from '../test-utils/mock-tool.js';
import * as modifiableToolModule from '../tools/modifiable-tool.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import type { PolicyEngine } from '../policy/policy-engine.js';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

class TestApprovalTool extends BaseDeclarativeTool<{ id: string }, ToolResult> {
  static readonly Name = 'testApprovalTool';

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      TestApprovalTool.Name,
      'TestApprovalTool',
      'A tool for testing approval logic',
      Kind.Edit,
      {
        properties: { id: { type: 'string' } },
        required: ['id'],
        type: 'object',
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: { id: string },
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<{ id: string }, ToolResult> {
    return new TestApprovalInvocation(this.config, params, messageBus);
  }
}

class TestApprovalInvocation extends BaseToolInvocation<
  { id: string },
  ToolResult
> {
  constructor(
    private config: Config,
    params: { id: string },
    messageBus: MessageBus,
  ) {
    super(params, messageBus);
  }

  getDescription(): string {
    return `Test tool ${this.params.id}`;
  }

  override async shouldConfirmExecute(): Promise<
    ToolCallConfirmationDetails | false
  > {
    // Need confirmation unless approval mode is AUTO_EDIT
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    return {
      type: 'edit',
      title: `Confirm Test Tool ${this.params.id}`,
      fileName: `test-${this.params.id}.txt`,
      filePath: `/test-${this.params.id}.txt`,
      fileDiff: 'Test diff content',
      originalContent: '',
      newContent: 'Test content',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: `Executed test tool ${this.params.id}`,
      returnDisplay: `Executed test tool ${this.params.id}`,
    };
  }
}

class AbortDuringConfirmationInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly abortController: AbortController,
    private readonly abortError: Error,
    params: Record<string, unknown>,
    messageBus: MessageBus,
  ) {
    super(params, messageBus);
  }

  override async shouldConfirmExecute(
    _signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    this.abortController.abort();
    throw this.abortError;
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    throw new Error('execute should not be called when confirmation fails');
  }

  getDescription(): string {
    return 'Abort during confirmation invocation';
  }
}

class AbortDuringConfirmationTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly abortController: AbortController,
    private readonly abortError: Error,
    messageBus: MessageBus,
  ) {
    super(
      'abortDuringConfirmationTool',
      'Abort During Confirmation Tool',
      'A tool that aborts while confirming execution.',
      Kind.Other,
      {
        type: 'object',
        properties: {},
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: Record<string, unknown>,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new AbortDuringConfirmationInvocation(
      this.abortController,
      this.abortError,
      params,
      messageBus,
    );
  }
}

async function waitForStatus(
  onToolCallsUpdate: Mock,
  status: 'awaiting_approval' | 'executing' | 'success' | 'error' | 'cancelled',
  timeout = 5000,
): Promise<ToolCall> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (Date.now() - startTime > timeout) {
        const seenStatuses = onToolCallsUpdate.mock.calls
          .flatMap((call) => call[0])
          .map((toolCall: ToolCall) => toolCall.status);
        reject(
          new Error(
            `Timed out waiting for status "${status}". Seen statuses: ${seenStatuses.join(
              ', ',
            )}`,
          ),
        );
        return;
      }

      const foundCall = onToolCallsUpdate.mock.calls
        .flatMap((call) => call[0])
        .find((toolCall: ToolCall) => toolCall.status === status);
      if (foundCall) {
        resolve(foundCall);
      } else {
        setTimeout(check, 10); // Check again in 10ms
      }
    };
    check();
  });
}

function createMockConfig(overrides: Partial<Config> = {}): Config {
  const defaultToolRegistry = {
    getTool: () => undefined,
    getToolByName: () => undefined,
    getFunctionDeclarations: () => [],
    tools: new Map(),
    discovery: {},
    registerTool: () => {},
    getToolByDisplayName: () => undefined,
    getTools: () => [],
    discoverTools: async () => {},
    getAllTools: () => [],
    getToolsByServer: () => [],
    getExperiments: () => {},
  } as unknown as ToolRegistry;

  const baseConfig = {
    getSessionId: () => 'test-session-id',
    getUsageStatisticsEnabled: () => true,
    getDebugMode: () => false,
    isInteractive: () => true,
    getApprovalMode: () => ApprovalMode.DEFAULT,
    setApprovalMode: () => {},
    getAllowedTools: () => [],
    getContentGeneratorConfig: () => ({
      model: 'test-model',
      authType: 'oauth-personal',
    }),
    getShellExecutionConfig: () => ({
      terminalWidth: 90,
      terminalHeight: 30,
      sanitizationConfig: {
        enableEnvironmentVariableRedaction: true,
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
      },
    }),
    storage: {
      getProjectTempDir: () => '/tmp',
    },
    getTruncateToolOutputThreshold: () =>
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
    getTruncateToolOutputLines: () => DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
    getToolRegistry: () => defaultToolRegistry,
    getActiveModel: () => DEFAULT_GEMINI_MODEL,
    getGeminiClient: () => null,
    getMessageBus: () => createMockMessageBus(),
    getEnableHooks: () => false,
    getExperiments: () => {},
  } as unknown as Config;

  const finalConfig = { ...baseConfig, ...overrides } as Config;

  // Patch the policy engine to use the final config if not overridden
  if (!overrides.getPolicyEngine) {
    finalConfig.getPolicyEngine = () =>
      ({
        check: async (toolCall: { name: string; args: object }) => {
          // Mock simple policy logic for tests
          const mode = finalConfig.getApprovalMode();
          if (mode === ApprovalMode.YOLO || mode === ApprovalMode.AUTO_EDIT) {
            return { decision: PolicyDecision.ALLOW };
          }
          const allowed = finalConfig.getAllowedTools();
          if (
            allowed &&
            (allowed.includes(toolCall.name) ||
              allowed.some((p) => toolCall.name.startsWith(p)))
          ) {
            return { decision: PolicyDecision.ALLOW };
          }
          return { decision: PolicyDecision.ASK_USER };
        },
      }) as unknown as PolicyEngine;
  }

  return finalConfig;
}

describe('CoreToolScheduler', () => {
  it('should cancel a tool call if the signal is aborted before confirmation', async () => {
    const mockTool = new MockTool({
      name: 'mockTool',
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const declarativeTool = mockTool;
    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => declarativeTool,
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      isInteractive: () => false,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };

    abortController.abort();
    await scheduler.schedule([request], abortController.signal);

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
  });

  it('should cancel all tools when cancelAll is called', async () => {
    const mockTool1 = new MockTool({
      name: 'mockTool1',
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const mockTool2 = new MockTool({ name: 'mockTool2' });
    const mockTool3 = new MockTool({ name: 'mockTool3' });

    const mockToolRegistry = {
      getTool: (name: string) => {
        if (name === 'mockTool1') return mockTool1;
        if (name === 'mockTool2') return mockTool2;
        if (name === 'mockTool3') return mockTool3;
        return undefined;
      },
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: (name: string) => {
        if (name === 'mockTool1') return mockTool1;
        if (name === 'mockTool2') return mockTool2;
        if (name === 'mockTool3') return mockTool3;
        return undefined;
      },
      getToolByDisplayName: () => undefined,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getHookSystem: () => undefined,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const requests = [
      {
        callId: '1',
        name: 'mockTool1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
      {
        callId: '2',
        name: 'mockTool2',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
      {
        callId: '3',
        name: 'mockTool3',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
    ];

    // Don't await, let it run in the background
    void scheduler.schedule(requests, abortController.signal);

    // Wait for the first tool to be awaiting approval
    await waitForStatus(onToolCallsUpdate, 'awaiting_approval');

    // Cancel all operations
    scheduler.cancelAll(abortController.signal);
    abortController.abort(); // Also fire the signal

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];

    expect(completedCalls).toHaveLength(3);
    expect(completedCalls.find((c) => c.request.callId === '1')?.status).toBe(
      'cancelled',
    );
    expect(completedCalls.find((c) => c.request.callId === '2')?.status).toBe(
      'cancelled',
    );
    expect(completedCalls.find((c) => c.request.callId === '3')?.status).toBe(
      'cancelled',
    );
  });

  it('should cancel all tools in a batch when one is cancelled via confirmation', async () => {
    const mockTool1 = new MockTool({
      name: 'mockTool1',
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const mockTool2 = new MockTool({ name: 'mockTool2' });
    const mockTool3 = new MockTool({ name: 'mockTool3' });

    const mockToolRegistry = {
      getTool: (name: string) => {
        if (name === 'mockTool1') return mockTool1;
        if (name === 'mockTool2') return mockTool2;
        if (name === 'mockTool3') return mockTool3;
        return undefined;
      },
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: (name: string) => {
        if (name === 'mockTool1') return mockTool1;
        if (name === 'mockTool2') return mockTool2;
        if (name === 'mockTool3') return mockTool3;
        return undefined;
      },
      getToolByDisplayName: () => undefined,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getHookSystem: () => undefined,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const requests = [
      {
        callId: '1',
        name: 'mockTool1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
      {
        callId: '2',
        name: 'mockTool2',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
      {
        callId: '3',
        name: 'mockTool3',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
    ];

    // Don't await, let it run in the background
    void scheduler.schedule(requests, abortController.signal);

    // Wait for the first tool to be awaiting approval
    const awaitingCall = (await waitForStatus(
      onToolCallsUpdate,
      'awaiting_approval',
    )) as WaitingToolCall;

    // Cancel the first tool via its confirmation handler
    await awaitingCall.confirmationDetails.onConfirm(
      ToolConfirmationOutcome.Cancel,
    );
    abortController.abort(); // User cancelling often involves an abort signal

    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];

    expect(completedCalls).toHaveLength(3);
    expect(completedCalls.find((c) => c.request.callId === '1')?.status).toBe(
      'cancelled',
    );
    expect(completedCalls.find((c) => c.request.callId === '2')?.status).toBe(
      'cancelled',
    );
    expect(completedCalls.find((c) => c.request.callId === '3')?.status).toBe(
      'cancelled',
    );
  });

  it('should mark tool call as cancelled when abort happens during confirmation error', async () => {
    const abortController = new AbortController();
    const abortError = new Error('Abort requested during confirmation');
    const declarativeTool = new AbortDuringConfirmationTool(
      abortController,
      abortError,
      createMockMessageBus(),
    );

    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => declarativeTool,
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      isInteractive: () => true,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const request = {
      callId: 'abort-1',
      name: 'abortDuringConfirmationTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-abort',
    };

    await scheduler.schedule([request], abortController.signal);

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
    const statuses = onToolCallsUpdate.mock.calls.flatMap((call) =>
      (call[0] as ToolCall[]).map((toolCall) => toolCall.status),
    );
    expect(statuses).not.toContain('error');
  });

  it('should error when tool requires confirmation in non-interactive mode', async () => {
    const mockTool = new MockTool({
      name: 'mockTool',
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const declarativeTool = mockTool;
    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => declarativeTool,
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      isInteractive: () => false,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };

    await scheduler.schedule([request], abortController.signal);

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('error');

    const erroredCall = completedCalls[0] as ErroredToolCall;
    const errorResponse = erroredCall.response;
    const errorParts = errorResponse.responseParts;
    // @ts-expect-error - accessing internal structure of FunctionResponsePart
    const errorMessage = errorParts[0].functionResponse.response.error;
    expect(errorMessage).toContain(
      'Tool execution for "mockTool" requires user confirmation, which is not supported in non-interactive mode.',
    );
  });
});

describe('CoreToolScheduler with payload', () => {
  it('should update args and diff and execute tool when payload is provided', async () => {
    const mockTool = new MockModifiableTool();
    mockTool.executeFn = vi.fn();
    const declarativeTool = mockTool;
    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => declarativeTool,
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockModifiableTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-2',
    };

    await scheduler.schedule([request], abortController.signal);

    const awaitingCall = (await waitForStatus(
      onToolCallsUpdate,
      'awaiting_approval',
    )) as WaitingToolCall;
    const confirmationDetails = awaitingCall.confirmationDetails;

    if (confirmationDetails) {
      const payload: ToolConfirmationPayload = { newContent: 'final version' };
      await confirmationDetails.onConfirm(
        ToolConfirmationOutcome.ProceedOnce,
        payload,
      );
    }

    // After internal update, the tool should be awaiting approval again with the NEW content.
    const updatedAwaitingCall = (await waitForStatus(
      onToolCallsUpdate,
      'awaiting_approval',
    )) as WaitingToolCall;

    // Now confirm for real to execute.
    await updatedAwaitingCall.confirmationDetails.onConfirm(
      ToolConfirmationOutcome.ProceedOnce,
    );

    // Wait for the tool execution to complete
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');
    expect(mockTool.executeFn).toHaveBeenCalledWith({
      newContent: 'final version',
    });
  });
});

class MockEditToolInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(params: Record<string, unknown>, messageBus: MessageBus) {
    super(params, messageBus);
  }

  getDescription(): string {
    return 'A mock edit tool invocation';
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: 'test.txt',
      fileDiff:
        '--- test.txt\n+++ test.txt\n@@ -1,1 +1,1 @@\n-old content\n+new content',
      originalContent: 'old content',
      newContent: 'new content',
      onConfirm: async () => {},
    };
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    return {
      llmContent: 'Edited successfully',
      returnDisplay: 'Edited successfully',
    };
  }
}

class MockEditTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      'mockEditTool',
      'mockEditTool',
      'A mock edit tool',
      Kind.Edit,
      {},
      messageBus,
    );
  }

  protected createInvocation(
    params: Record<string, unknown>,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new MockEditToolInvocation(params, messageBus);
  }
}

describe('CoreToolScheduler edit cancellation', () => {
  it('should preserve diff when an edit is cancelled', async () => {
    const mockEditTool = new MockEditTool(createMockMessageBus());
    const mockToolRegistry = {
      getTool: () => mockEditTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByName: () => mockEditTool,
      getToolByDisplayName: () => mockEditTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockEditTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };

    await scheduler.schedule([request], abortController.signal);

    const awaitingCall = (await waitForStatus(
      onToolCallsUpdate,
      'awaiting_approval',
    )) as WaitingToolCall;

    // Cancel the edit
    const confirmationDetails = awaitingCall.confirmationDetails;
    if (confirmationDetails) {
      await confirmationDetails.onConfirm(ToolConfirmationOutcome.Cancel);
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];

    expect(completedCalls[0].status).toBe('cancelled');

    // Check that the diff is preserved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cancelledCall = completedCalls[0] as any;
    expect(cancelledCall.response.resultDisplay).toBeDefined();
    expect(cancelledCall.response.resultDisplay.fileDiff).toBe(
      '--- test.txt\n+++ test.txt\n@@ -1,1 +1,1 @@\n-old content\n+new content',
    );
    expect(cancelledCall.response.resultDisplay.fileName).toBe('test.txt');
  });
});

describe('CoreToolScheduler YOLO mode', () => {
  it('should execute tool requiring confirmation directly without waiting', async () => {
    // Arrange
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({
      name: 'mockTool',
      execute: executeFn,
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const declarativeTool = mockTool;

    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      // Other properties are not needed for this test but are included for type consistency.
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    // Configure the scheduler for YOLO mode.
    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO,
      isInteractive: () => false,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: { param: 'value' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-yolo',
    };

    // Act
    await scheduler.schedule([request], abortController.signal);

    // Wait for the tool execution to complete
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Assert
    // 1. The tool's execute method was called directly.
    expect(executeFn).toHaveBeenCalledWith({ param: 'value' });

    // 2. The tool call status never entered 'awaiting_approval'.
    const statusUpdates = onToolCallsUpdate.mock.calls
      .map((call) => (call[0][0] as ToolCall)?.status)
      .filter(Boolean);
    expect(statusUpdates).not.toContain('awaiting_approval');
    expect(statusUpdates).toEqual([
      'validating',
      'scheduled',
      'executing',
      'success',
    ]);

    // 3. The final callback indicates the tool call was successful.
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(1);
    const completedCall = completedCalls[0];
    expect(completedCall.status).toBe('success');
    if (completedCall.status === 'success') {
      expect(completedCall.response.resultDisplay).toBe('Tool executed');
    }
  });
});

describe('CoreToolScheduler request queueing', () => {
  it('should queue a request if another is running', async () => {
    let resolveFirstCall: (result: ToolResult) => void;
    const firstCallPromise = new Promise<ToolResult>((resolve) => {
      resolveFirstCall = resolve;
    });

    const executeFn = vi.fn().mockImplementation(() => firstCallPromise);
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });
    const declarativeTool = mockTool;

    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO, // Use YOLO to avoid confirmation prompts
      isInteractive: () => false,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request1 = {
      callId: '1',
      name: 'mockTool',
      args: { a: 1 },
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };
    const request2 = {
      callId: '2',
      name: 'mockTool',
      args: { b: 2 },
      isClientInitiated: false,
      prompt_id: 'prompt-2',
    };

    // Schedule the first call, which will pause execution.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    scheduler.schedule([request1], abortController.signal);

    // Wait for the first call to be in the 'executing' state.
    await waitForStatus(onToolCallsUpdate, 'executing');

    // Schedule the second call while the first is "running".
    const schedulePromise2 = scheduler.schedule(
      [request2],
      abortController.signal,
    );

    // Ensure the second tool call hasn't been executed yet.
    expect(executeFn).toHaveBeenCalledWith({ a: 1 });

    // Complete the first tool call.
    resolveFirstCall!({
      llmContent: 'First call complete',
      returnDisplay: 'First call complete',
    });

    // Wait for the second schedule promise to resolve.
    await schedulePromise2;

    // Let the second call finish.
    const secondCallResult = {
      llmContent: 'Second call complete',
      returnDisplay: 'Second call complete',
    };
    // Since the mock is shared, we need to resolve the current promise.
    // In a real scenario, a new promise would be created for the second call.
    resolveFirstCall!(secondCallResult);

    await vi.waitFor(() => {
      // Now the second tool call should have been executed.
      expect(executeFn).toHaveBeenCalledTimes(2);
    });
    expect(executeFn).toHaveBeenCalledWith({ b: 2 });

    // Wait for the second completion.
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalledTimes(2);
    });

    // Verify the completion callbacks were called correctly.
    expect(onAllToolCallsComplete.mock.calls[0][0][0].status).toBe('success');
    expect(onAllToolCallsComplete.mock.calls[1][0][0].status).toBe('success');
  });

  it('should auto-approve a tool call if it is on the allowedTools list', async () => {
    // Arrange
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({
      name: 'mockTool',
      execute: executeFn,
      shouldConfirmExecute: MOCK_TOOL_SHOULD_CONFIRM_EXECUTE,
    });
    const declarativeTool = mockTool;

    const toolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    // Configure the scheduler to auto-approve the specific tool call.
    const mockConfig = createMockConfig({
      getAllowedTools: () => ['mockTool'], // Auto-approve this tool
      getToolRegistry: () => toolRegistry,
      getShellExecutionConfig: () => ({
        terminalWidth: 80,
        terminalHeight: 24,
        sanitizationConfig: {
          enableEnvironmentVariableRedaction: true,
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
        },
      }),
      isInteractive: () => false,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: { param: 'value' },
      isClientInitiated: false,
      prompt_id: 'prompt-auto-approved',
    };

    // Act
    await scheduler.schedule([request], abortController.signal);

    // Wait for the tool execution to complete
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Assert
    // 1. The tool's execute method was called directly.
    expect(executeFn).toHaveBeenCalledWith({ param: 'value' });

    // 2. The tool call status never entered 'awaiting_approval'.
    const statusUpdates = onToolCallsUpdate.mock.calls
      .map((call) => (call[0][0] as ToolCall)?.status)
      .filter(Boolean);
    expect(statusUpdates).not.toContain('awaiting_approval');
    expect(statusUpdates).toEqual([
      'validating',
      'scheduled',
      'executing',
      'success',
    ]);

    // 3. The final callback indicates the tool call was successful.
    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(1);
    const completedCall = completedCalls[0];
    expect(completedCall.status).toBe('success');
    if (completedCall.status === 'success') {
      expect(completedCall.response.resultDisplay).toBe('Tool executed');
    }
  });

  it('should require approval for a chained shell command even when prefix is allowlisted', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Shell command executed',
      returnDisplay: 'Shell command executed',
    });

    const mockShellTool = new MockTool({
      name: 'run_shell_command',
      shouldConfirmExecute: (params) =>
        Promise.resolve({
          type: 'exec',
          title: 'Confirm Shell Command',
          command: String(params['command'] ?? ''),
          rootCommand: 'git',
          onConfirm: async () => {},
        }),
      execute: () => executeFn({}),
    });

    const toolRegistry = {
      getTool: () => mockShellTool,
      getToolByName: () => mockShellTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => mockShellTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getAllowedTools: () => ['run_shell_command(git)'],
      getShellExecutionConfig: () => ({
        terminalWidth: 80,
        terminalHeight: 24,
        sanitizationConfig: {
          enableEnvironmentVariableRedaction: true,
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
        },
      }),
      getToolRegistry: () => toolRegistry,
      getHookSystem: () => undefined,
      getPolicyEngine: () =>
        ({
          check: async () => ({ decision: PolicyDecision.ASK_USER }),
        }) as unknown as PolicyEngine,
    });

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: 'shell-1',
      name: 'run_shell_command',
      args: { command: 'git status && rm -rf /tmp/should-not-run' },
      isClientInitiated: false,
      prompt_id: 'prompt-shell-auto-approved',
    };

    await scheduler.schedule([request], abortController.signal);

    const statusUpdates = onToolCallsUpdate.mock.calls
      .map((call) => (call[0][0] as ToolCall)?.status)
      .filter(Boolean);

    expect(statusUpdates).toContain('awaiting_approval');
    expect(executeFn).not.toHaveBeenCalled();
    expect(onAllToolCallsComplete).not.toHaveBeenCalled();
  }, 20000);

  it('should handle two synchronous calls to schedule', async () => {
    const executeFn = vi.fn().mockResolvedValue({
      llmContent: 'Tool executed',
      returnDisplay: 'Tool executed',
    });
    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });
    const declarativeTool = mockTool;
    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;
    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request1 = {
      callId: '1',
      name: 'mockTool',
      args: { a: 1 },
      isClientInitiated: false,
      prompt_id: 'prompt-1',
    };
    const request2 = {
      callId: '2',
      name: 'mockTool',
      args: { b: 2 },
      isClientInitiated: false,
      prompt_id: 'prompt-2',
    };

    // Schedule two calls synchronously.
    const schedulePromise1 = scheduler.schedule(
      [request1],
      abortController.signal,
    );
    const schedulePromise2 = scheduler.schedule(
      [request2],
      abortController.signal,
    );

    // Wait for both promises to resolve.
    await Promise.all([schedulePromise1, schedulePromise2]);

    // Ensure the tool was called twice with the correct arguments.
    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(executeFn).toHaveBeenCalledWith({ a: 1 });
    expect(executeFn).toHaveBeenCalledWith({ b: 2 });

    // Ensure completion callbacks were called twice.
    expect(onAllToolCallsComplete).toHaveBeenCalledTimes(2);
  });

  it('should auto-approve remaining tool calls when first tool call is approved with ProceedAlways', async () => {
    let approvalMode = ApprovalMode.DEFAULT;
    const mockConfig = createMockConfig({
      getApprovalMode: () => approvalMode,
      setApprovalMode: (mode: ApprovalMode) => {
        approvalMode = mode;
      },
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const testTool = new TestApprovalTool(mockConfig, mockMessageBus);
    const toolRegistry = {
      getTool: () => testTool,
      getFunctionDeclarations: () => [],
      getFunctionDeclarationsFiltered: () => [],
      registerTool: () => {},
      discoverAllTools: async () => {},
      discoverMcpTools: async () => {},
      discoverToolsForServer: async () => {},
      removeMcpToolsByServer: () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
      tools: new Map(),
      config: mockConfig,
      mcpClientManager: undefined,
      getToolByName: () => testTool,
      getToolByDisplayName: () => testTool,
      getTools: () => [],
      discoverTools: async () => {},
      discovery: {},
    } as unknown as ToolRegistry;

    mockConfig.getToolRegistry = () => toolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();
    const pendingConfirmations: Array<
      (outcome: ToolConfirmationOutcome) => void
    > = [];

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate: (toolCalls) => {
        onToolCallsUpdate(toolCalls);
        // Capture confirmation handlers for awaiting_approval tools
        toolCalls.forEach((call) => {
          if (call.status === 'awaiting_approval') {
            const waitingCall = call;
            if (waitingCall.confirmationDetails?.onConfirm) {
              const originalHandler = pendingConfirmations.find(
                (h) => h === waitingCall.confirmationDetails.onConfirm,
              );
              if (!originalHandler) {
                pendingConfirmations.push(
                  waitingCall.confirmationDetails.onConfirm,
                );
              }
            }
          }
        });
      },
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();

    // Schedule multiple tools that need confirmation
    const requests = [
      {
        callId: '1',
        name: 'testApprovalTool',
        args: { id: 'first' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
      {
        callId: '2',
        name: 'testApprovalTool',
        args: { id: 'second' },
        isClientInitiated: false,
        prompt_id: 'prompt-2',
      },
      {
        callId: '3',
        name: 'testApprovalTool',
        args: { id: 'third' },
        isClientInitiated: false,
        prompt_id: 'prompt-3',
      },
    ];

    await scheduler.schedule(requests, abortController.signal);

    // Wait for the FIRST tool to be awaiting approval
    await vi.waitFor(() => {
      const calls = onToolCallsUpdate.mock.calls.at(-1)?.[0] as ToolCall[];
      // With the sequential scheduler, the update includes the active call and the queue.
      expect(calls?.length).toBe(3);
      expect(calls?.[0].status).toBe('awaiting_approval');
      expect(calls?.[0].request.callId).toBe('1');
      // Check that the other two are in the queue (still in 'validating' state)
      expect(calls?.[1].status).toBe('validating');
      expect(calls?.[2].status).toBe('validating');
    });

    expect(pendingConfirmations.length).toBe(1);

    // Approve the first tool with ProceedAlways
    const firstConfirmation = pendingConfirmations[0];
    firstConfirmation(ToolConfirmationOutcome.ProceedAlways);

    // Wait for all tools to be completed
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    const completedCalls = onAllToolCallsComplete.mock.calls.at(
      -1,
    )?.[0] as ToolCall[];
    expect(completedCalls?.length).toBe(3);
    expect(completedCalls?.every((call) => call.status === 'success')).toBe(
      true,
    );

    // Verify approval mode was changed
    expect(approvalMode).toBe(ApprovalMode.AUTO_EDIT);
  });
});

describe('CoreToolScheduler Sequential Execution', () => {
  it('should execute tool calls in a batch sequentially', async () => {
    // Arrange
    let firstCallFinished = false;
    const executeFn = vi
      .fn()
      .mockImplementation(async (args: { call: number }) => {
        if (args.call === 1) {
          // First call, wait for a bit to simulate work
          await new Promise((resolve) => setTimeout(resolve, 50));
          firstCallFinished = true;
          return { llmContent: 'First call done' };
        }
        if (args.call === 2) {
          // Second call, should only happen after the first is finished
          if (!firstCallFinished) {
            throw new Error(
              'Second tool call started before the first one finished!',
            );
          }
          return { llmContent: 'Second call done' };
        }
        return { llmContent: 'default' };
      });

    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });
    const declarativeTool = mockTool;

    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO, // Use YOLO to avoid confirmation prompts
      isInteractive: () => false,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const requests = [
      {
        callId: '1',
        name: 'mockTool',
        args: { call: 1 },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
      {
        callId: '2',
        name: 'mockTool',
        args: { call: 2 },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    ];

    // Act
    await scheduler.schedule(requests, abortController.signal);

    // Assert
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Check that execute was called twice
    expect(executeFn).toHaveBeenCalledTimes(2);

    // Check the order of calls
    const calls = executeFn.mock.calls;
    expect(calls[0][0]).toEqual({ call: 1 });
    expect(calls[1][0]).toEqual({ call: 2 });

    // The onAllToolCallsComplete should be called once with both results
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(2);
    expect(completedCalls[0].status).toBe('success');
    expect(completedCalls[1].status).toBe('success');
  });

  it('should cancel subsequent tools when the signal is aborted.', async () => {
    // Arrange
    const abortController = new AbortController();
    let secondCallStarted = false;

    const executeFn = vi
      .fn()
      .mockImplementation(async (args: { call: number }) => {
        if (args.call === 1) {
          return { llmContent: 'First call done' };
        }
        if (args.call === 2) {
          secondCallStarted = true;
          // This call will be cancelled while it's "running".
          await new Promise((resolve) => setTimeout(resolve, 100));
          // It should not return a value because it will be cancelled.
          return { llmContent: 'Second call should not complete' };
        }
        if (args.call === 3) {
          return { llmContent: 'Third call done' };
        }
        return { llmContent: 'default' };
      });

    const mockTool = new MockTool({ name: 'mockTool', execute: executeFn });
    const declarativeTool = mockTool;

    const mockToolRegistry = {
      getTool: () => declarativeTool,
      getToolByName: () => declarativeTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => declarativeTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
      getApprovalMode: () => ApprovalMode.YOLO,
      isInteractive: () => false,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const requests = [
      {
        callId: '1',
        name: 'mockTool',
        args: { call: 1 },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
      {
        callId: '2',
        name: 'mockTool',
        args: { call: 2 },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
      {
        callId: '3',
        name: 'mockTool',
        args: { call: 3 },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
    ];

    // Act
    const schedulePromise = scheduler.schedule(
      requests,
      abortController.signal,
    );

    // Wait for the second call to start, then abort.
    await vi.waitFor(() => {
      expect(secondCallStarted).toBe(true);
    });
    abortController.abort();

    await schedulePromise;

    // Assert
    await vi.waitFor(() => {
      expect(onAllToolCallsComplete).toHaveBeenCalled();
    });

    // Check that execute was called for the first two tools only
    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(executeFn).toHaveBeenCalledWith({ call: 1 });
    expect(executeFn).toHaveBeenCalledWith({ call: 2 });

    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(3);

    const call1 = completedCalls.find((c) => c.request.callId === '1');
    const call2 = completedCalls.find((c) => c.request.callId === '2');
    const call3 = completedCalls.find((c) => c.request.callId === '3');

    expect(call1?.status).toBe('success');
    expect(call2?.status).toBe('cancelled');
    expect(call3?.status).toBe('cancelled');
  });

  it('should pass confirmation diff data into modifyWithEditor overrides', async () => {
    const modifyWithEditorSpy = vi
      .spyOn(modifiableToolModule, 'modifyWithEditor')
      .mockResolvedValue({
        updatedParams: { param: 'updated' },
        updatedDiff: 'updated diff',
      });

    const mockModifiableTool = new MockModifiableTool('mockModifiableTool');
    const mockToolRegistry = {
      getTool: () => mockModifiableTool,
      getToolByName: () => mockModifiableTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {},
      registerTool: () => {},
      getToolByDisplayName: () => mockModifiableTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    } as unknown as ToolRegistry;

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = createMockConfig({
      getToolRegistry: () => mockToolRegistry,
    });
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();

    await scheduler.schedule(
      [
        {
          callId: '1',
          name: 'mockModifiableTool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      ],
      abortController.signal,
    );

    const toolCall = (scheduler as unknown as { toolCalls: ToolCall[] })
      .toolCalls[0] as WaitingToolCall;
    expect(toolCall.status).toBe('awaiting_approval');

    const confirmationSignal = new AbortController().signal;
    await scheduler.handleConfirmationResponse(
      toolCall.request.callId,
      async () => {},
      ToolConfirmationOutcome.ModifyWithEditor,
      confirmationSignal,
    );

    expect(modifyWithEditorSpy).toHaveBeenCalled();
    const overrides =
      modifyWithEditorSpy.mock.calls[
        modifyWithEditorSpy.mock.calls.length - 1
      ][4];
    expect(overrides).toEqual({
      currentContent: 'originalContent',
      proposedContent: 'newContent',
    });

    modifyWithEditorSpy.mockRestore();
  });
});
