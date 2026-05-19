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
  type MockInstance,
} from 'vitest';
import { Session } from './acpSession.js';
import type * as acp from '@agentclientprotocol/sdk';
import {
  ReadManyFilesTool,
  type GeminiChat,
  type Config,
  type MessageBus,
  type GitService,
  InvalidStreamError,
  GeminiEventType,
  type ServerGeminiStreamEvent,
  PolicyDecision,
  MessageBusType,
  type ToolConfirmationRequest,
  DiscoveredMCPTool,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { type Part, FinishReason } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CommandHandler } from './acpCommandHandler.js';

vi.mock('node:fs/promises');
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    resolve: vi.fn(),
  };
});

vi.mock(
  '@google/gemini-cli-core',
  async (
    importOriginal: () => Promise<typeof import('@google/gemini-cli-core')>,
  ) => {
    const actual = await importOriginal();
    return {
      ...actual,
      updatePolicy: vi.fn(),
      ReadManyFilesTool: vi.fn(),
      logToolCall: vi.fn(),
      processSingleFileContent: vi.fn(),
    };
  },
);

async function* createMockStream(
  items: readonly ServerGeminiStreamEvent[],
): AsyncGenerator<ServerGeminiStreamEvent> {
  for (const item of items) {
    yield item;
  }

  yield {
    type: GeminiEventType.Finished,
    value: {
      reason: FinishReason.STOP,
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 10,
      },
    },
  };
}

describe('Session', () => {
  let mockChat: Mocked<GeminiChat>;
  let mockConfig: Mocked<Config>;
  let mockConnection: Mocked<acp.AgentSideConnection>;
  let session: Session;
  let mockToolRegistry: { getTool: Mock };
  let mockTool: { kind: string; build: Mock };
  let mockMessageBus: Mocked<MessageBus>;
  let mockSendMessageStream: MockInstance<
    (
      request: Part[],
      signal: AbortSignal,
      promptId: string,
    ) => AsyncGenerator<ServerGeminiStreamEvent>
  >;

  beforeEach(() => {
    mockChat = {
      sendMessageStream: vi.fn(),
      addHistory: vi.fn(),
      recordCompletedToolCalls: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<GeminiChat>;
    mockTool = {
      kind: 'read',
      build: vi.fn().mockReturnValue({
        getDescription: () => 'Test Tool',
        toolLocations: () => [],
        shouldConfirmExecute: vi.fn().mockResolvedValue(null),
        execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
      }),
    };
    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(mockTool),
    };
    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    mockSendMessageStream = vi.fn();
    mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModelRouterService: vi.fn().mockReturnValue({
        route: vi.fn().mockResolvedValue({ model: 'resolved-model' }),
      }),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getFileService: vi.fn().mockReturnValue({
        shouldIgnoreFile: vi.fn().mockReturnValue(false),
      }),
      getFileFilteringOptions: vi.fn().mockReturnValue({}),
      getFileSystemService: vi.fn().mockReturnValue({}),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getEnableRecursiveFileSearch: vi.fn().mockReturnValue(false),
      getDebugMode: vi.fn().mockReturnValue(false),
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
      setApprovalMode: vi.fn(),
      setModel: vi.fn(),
      isPlanEnabled: vi.fn().mockReturnValue(true),
      getCheckpointingEnabled: vi.fn().mockReturnValue(false),
      getGitService: vi.fn().mockResolvedValue({} as GitService),
      getPolicyEngine: vi.fn().mockReturnValue({
        check: vi.fn(),
      }),
      validatePathAccess: vi.fn().mockReturnValue(null),
      getWorkspaceContext: vi.fn().mockReturnValue({
        addReadOnlyPath: vi.fn(),
      }),
      waitForMcpInit: vi.fn(),
      getDisableAlwaysAllow: vi.fn().mockReturnValue(false),
      getMaxSessionTurns: vi.fn().mockReturnValue(-1),
      geminiClient: {
        sendMessageStream: mockSendMessageStream,
        getChat: vi.fn().mockReturnValue(mockChat),
      },
      get config() {
        return this;
      },
      get toolRegistry() {
        return mockToolRegistry;
      },
    } as unknown as Mocked<Config>;
    mockConnection = {
      sessionUpdate: vi.fn(),
      requestPermission: vi.fn(),
    } as unknown as Mocked<acp.AgentSideConnection>;

    session = new Session('session-1', mockChat, mockConfig, mockConnection, {
      merged: {
        security: { enablePermanentToolApproval: true },
        mcpServers: {},
      },
      errors: [],
    } as unknown as LoadedSettings);

    (ReadManyFilesTool as unknown as Mock).mockImplementation(() => ({
      name: 'read_many_files',
      kind: 'read',
      build: vi.fn().mockReturnValue({
        getDescription: () => 'Read files',
        toolLocations: () => [],
        execute: vi.fn().mockResolvedValue({
          llmContent: ['--- file.txt ---\n\nFile content\n\n'],
        }),
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send available commands', async () => {
    await session.sendAvailableCommands();

    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'available_commands_update',
        }),
      }),
    );
  });

  it('should await MCP initialization before processing a prompt', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.Content,
        value: 'Hi',
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'test' }],
    });

    expect(mockConfig.waitForMcpInit).toHaveBeenCalledOnce();
  });

  it('should handle prompt with text response', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.Content,
        value: 'Hello',
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(mockSendMessageStream).toHaveBeenCalled();
    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello' },
      },
    });
    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should pass current session information directly onto geminiClient.sendMessageStream', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.Content,
        value: 'Hello',
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expect.arrayContaining([{ text: 'Hi' }]),
      expect.any(AbortSignal),
      expect.any(String),
    );
  });

  it('should handle prompt with empty response (InvalidStreamError)', async () => {
    const error = new InvalidStreamError('Empty response', 'NO_RESPONSE_TEXT');
    mockSendMessageStream.mockImplementation(() => {
      async function* errorGen(): AsyncGenerator<
        ServerGeminiStreamEvent,
        void,
        unknown
      > {
        yield* [];
        throw error;
      }
      return errorGen();
    });

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle prompt with no finish reason (InvalidStreamError)', async () => {
    const error = new InvalidStreamError(
      'No finish reason',
      'NO_FINISH_REASON',
    );
    mockSendMessageStream.mockImplementation(() => {
      async function* errorGen(): AsyncGenerator<
        ServerGeminiStreamEvent,
        void,
        unknown
      > {
        yield* [];
        throw error;
      }
      return errorGen();
    });

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Hi' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle /memory command', async () => {
    const handleCommandSpy = vi
      .spyOn(
        (session as unknown as { commandHandler: CommandHandler })
          .commandHandler,
        'handleCommand',
      )
      .mockResolvedValue(true);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: '/memory view' }],
    });

    expect(result).toMatchObject({ stopReason: 'end_turn' });
    expect(handleCommandSpy).toHaveBeenCalledWith(
      '/memory view',
      expect.any(Object),
    );
  });

  it('should handle tool calls', async () => {
    const stream1 = createMockStream([
      {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'test_tool',
          args: { foo: 'bar' },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: GeminiEventType.Content,
        value: 'Result',
      },
    ]);

    mockSendMessageStream
      .mockReturnValueOnce(stream1)
      .mockReturnValueOnce(stream2);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('test_tool');
    expect(result).toMatchObject({ stopReason: 'end_turn' });
  });

  it('should handle tool call permission request', async () => {
    const confirmationDetails = {
      type: 'info',
      onConfirm: vi.fn(),
    };
    mockTool.build.mockReturnValue({
      getDescription: () => 'Test Tool',
      toolLocations: () => [],
      shouldConfirmExecute: vi.fn().mockResolvedValue(confirmationDetails),
      execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
    });

    mockConnection.requestPermission.mockResolvedValue({
      outcome: {
        outcome: 'selected',
        optionId: 'proceed_once',
      },
    });

    const stream1 = createMockStream([
      {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'test_tool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: GeminiEventType.Content,
        value: '',
      },
    ]);

    mockSendMessageStream
      .mockReturnValueOnce(stream1)
      .mockReturnValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockConnection.requestPermission).toHaveBeenCalled();
    expect(confirmationDetails.onConfirm).toHaveBeenCalled();
  });

  it('should handle @path resolution', async () => {
    (path.resolve as unknown as Mock).mockReturnValue('/tmp/file.txt');
    (fs.stat as unknown as Mock).mockResolvedValue({
      isDirectory: () => false,
    });

    const stream = createMockStream([
      {
        type: GeminiEventType.Content,
        value: '',
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [
        { type: 'text', text: 'Read' },
        {
          type: 'resource_link',
          uri: 'file://file.txt',
          mimeType: 'text/plain',
          name: 'file.txt',
        },
      ],
    });

    expect(path.resolve).toHaveBeenCalled();
    expect(fs.stat).toHaveBeenCalled();
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Content from @file.txt'),
        }),
      ]),
      expect.any(AbortSignal),
      expect.any(String),
    );
  });

  it('should handle rate limit error', async () => {
    const error = new Error('Rate limit');
    const customError = error as { status?: number; message?: string };
    customError.status = 429;

    mockSendMessageStream.mockImplementation(() => {
      async function* errorGen(): AsyncGenerator<
        ServerGeminiStreamEvent,
        void,
        unknown
      > {
        yield* [];
        throw customError;
      }
      return errorGen();
    });

    await expect(
      session.prompt({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'Hi' }],
      }),
    ).rejects.toMatchObject({
      code: 429,
      message: 'Rate limit exceeded. Try again later.',
    });
  });

  it('should handle missing tool', async () => {
    mockToolRegistry.getTool.mockReturnValue(undefined);

    const stream1 = createMockStream([
      {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'unknown_tool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: GeminiEventType.Content,
        value: '',
      },
    ]);

    mockSendMessageStream
      .mockReturnValueOnce(stream1)
      .mockReturnValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
  });

  it('should handle GeminiEventType.LoopDetected', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.LoopDetected,
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Trigger Loop Simulation' }],
    });

    expect(result.stopReason).toBe('max_turn_requests');
  });

  it('should handle GeminiEventType.ContextWindowWillOverflow', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: { estimatedRequestTokenCount: 1000, remainingTokenCount: 200 },
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Trigger Overflow Simulation' }],
    });

    expect(result.stopReason).toBe('max_tokens');
  });

  it('should handle GeminiEventType.MaxSessionTurns', async () => {
    const stream = createMockStream([
      {
        type: GeminiEventType.MaxSessionTurns,
      },
    ]);
    mockSendMessageStream.mockReturnValue(stream);

    const result = await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Trigger Safety Limits' }],
    });

    expect(result.stopReason).toBe('max_turn_requests');
  });

  it('should send sessionUpdate when approval mode changes', async () => {
    const { coreEvents, CoreEvent, ApprovalMode } = await import(
      '@google/gemini-cli-core'
    );

    coreEvents.emit(CoreEvent.ApprovalModeChanged, {
      sessionId: 'session-1',
      mode: ApprovalMode.PLAN,
    });

    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `[MODE_UPDATE] ${ApprovalMode.PLAN}`,
        },
      },
    });
  });

  it('should add explanation to tool call content instead of thought chunk', async () => {
    mockTool.build.mockReturnValue({
      getDescription: () => 'Test Tool',
      getExplanation: () => 'Test Explanation',
      toolLocations: () => [],
      shouldConfirmExecute: vi
        .fn()
        .mockResolvedValue({ type: 'info', onConfirm: vi.fn() }),
      execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
    });

    mockConnection.requestPermission.mockResolvedValue({
      outcome: {
        outcome: 'selected',
        optionId: 'proceed_once',
      },
    });

    const stream1 = createMockStream([
      {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'test_tool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: GeminiEventType.Content,
        value: '',
      },
    ]);

    mockSendMessageStream
      .mockReturnValueOnce(stream1)
      .mockReturnValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockConnection.sessionUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: 'Test Explanation' },
        }),
      }),
    );

    expect(mockConnection.requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          content: expect.arrayContaining([
            {
              type: 'content',
              content: { type: 'text', text: 'Test Explanation' },
            },
          ]),
        }),
      }),
    );
  });

  it('should add explanation to tool_call update content instead of thought chunk when no permission required', async () => {
    mockTool.build.mockReturnValue({
      getDescription: () => 'Test Tool',
      getExplanation: () => 'Test Explanation',
      toolLocations: () => [],
      shouldConfirmExecute: vi.fn().mockResolvedValue(null),
      execute: vi.fn().mockResolvedValue({ llmContent: 'Tool Result' }),
    });

    const stream1 = createMockStream([
      {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'test_tool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
      },
    ]);
    const stream2 = createMockStream([
      {
        type: GeminiEventType.Content,
        value: '',
      },
    ]);

    mockSendMessageStream
      .mockReturnValueOnce(stream1)
      .mockReturnValueOnce(stream2);

    await session.prompt({
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'Call tool' }],
    });

    expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionUpdate: 'tool_call',
          content: expect.arrayContaining([
            {
              type: 'content',
              content: { type: 'text', text: 'Test Explanation' },
            },
          ]),
        }),
      }),
    );
  });

  describe('Policy Handling', () => {
    it('should auto-approve tool calls when PolicyEngine returns ALLOW', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Trigger the subscription handler
      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      expect(handler).toBeDefined();

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id',
        toolCall: { name: 'ls', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id',
          confirmed: true,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should request user confirmation when PolicyEngine returns ASK_USER', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-2',
        toolCall: { name: 'rm', args: { path: '/' } },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-2',
          confirmed: false,
          requiresUserConfirmation: true,
        }),
      );
    });

    it('should deny tool calls when PolicyEngine returns DENY', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.DENY,
      });

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-3',
        toolCall: { name: 'forbidden', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-3',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should pass subagent and trusted tool info to PolicyEngine', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Mock tool in registry with trusted annotations
      const trustedAnnotations = { safe: true };
      mockToolRegistry.getTool.mockReturnValue({
        name: 'ls',
        toolAnnotations: trustedAnnotations,
      });

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-trusted',
        toolCall: { name: 'ls', args: {} },
        subagent: 'restricted-subagent',
        serverName: 'spoofed-server', // Should be ignored
        toolAnnotations: { malicious: true }, // Should be ignored
      });

      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        expect.anything(),
        undefined, // serverName for non-MCP tool
        trustedAnnotations,
        'restricted-subagent',
      );
    });

    it('should handle exceptions in PolicyEngine by failing closed', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockRejectedValue(
        new Error('Policy check failed'),
      );

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-error',
        toolCall: { name: 'ls', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-error',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should fail closed when PolicyEngine is missing', async () => {
      (mockConfig.getPolicyEngine as Mock).mockReturnValue(undefined);

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-no-engine',
        toolCall: { name: 'ls', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-no-engine',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should handle missing tool name in request by failing closed', async () => {
      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-no-name',
        toolCall: { name: '', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-no-name',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should trim tool name before lookup and validation', async () => {
      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-whitespace',
        toolCall: { name: '  ', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-whitespace',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });

    it('should pass serverName from DiscoveredMCPTool to PolicyEngine', async () => {
      const mockPolicyEngine = mockConfig.getPolicyEngine() as unknown as {
        check: Mock<
          (
            toolCall: { name: string; args: Record<string, unknown> },
            serverName?: string,
            toolAnnotations?: Record<string, unknown>,
            subagent?: string,
          ) => Promise<{ decision: PolicyDecision }>
        >;
      };
      mockPolicyEngine.check.mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      // Mock tool in registry as a DiscoveredMCPTool instance
      const mcpTool = {
        name: 'mcp_server_tool',
        serverName: 'test-server',
        toolAnnotations: { mcp: true },
      };
      Object.setPrototypeOf(mcpTool, DiscoveredMCPTool.prototype);
      mockToolRegistry.getTool.mockReturnValue(mcpTool);

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-mcp',
        toolCall: { name: 'mcp_server_tool', args: {} },
      });

      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        expect.anything(),
        'test-server',
        { mcp: true },
        undefined,
      );
    });

    it('should fail closed and deny unknown tools', async () => {
      mockToolRegistry.getTool.mockReturnValue(undefined);

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call) => call[0] === MessageBusType.TOOL_CONFIRMATION_REQUEST,
      )?.[1] as (request: ToolConfirmationRequest) => Promise<void>;

      await handler({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        correlationId: 'test-id-unknown',
        toolCall: { name: 'unknown_tool', args: {} },
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-id-unknown',
          confirmed: false,
          requiresUserConfirmation: false,
        }),
      );
    });
  });
});
