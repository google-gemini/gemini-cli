/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock, MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useGeminiStream } from './useGeminiStream.js';
import { useKeypress } from './useKeypress.js';
import * as atCommandProcessor from './atCommandProcessor.js';
import type {
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedExecutingToolCall,
  TrackedCancelledToolCall,
  TrackedWaitingToolCall,
} from './useToolScheduler.js';
import { useToolScheduler } from './useToolScheduler.js';
import type {
  Config,
  EditorType,
  AnyToolInvocation,
} from '@google/gemini-cli-core';
import {
  CoreToolCallStatus,
  ApprovalMode,
  AuthType,
  GeminiEventType as ServerGeminiEventType,
  ToolErrorType,
  ToolConfirmationOutcome,
  MessageBusType,
  tokenLimit,
  debugLogger,
  coreEvents,
  CoreEvent,
  MCPDiscoveryState,
} from '@google/gemini-cli-core';
import type { Part, PartListUnion } from '@google/genai';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type { SlashCommandProcessorResult } from '../types.js';
import { MessageType, StreamingState } from '../types.js';

import type { LoadedSettings } from '../../config/settings.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';

// --- MOCKS ---
const mockSendMessageStream = vi
  .fn()
  .mockReturnValue((async function* () {})());
const mockStartChat = vi.fn();
const mockMessageBus = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

const MockedGeminiClientClass = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: any, _config: any) {
    // _config
    this.startChat = mockStartChat;
    this.sendMessageStream = mockSendMessageStream;
    this.addHistory = vi.fn();
    this.generateContent = vi.fn().mockResolvedValue({
      candidates: [
        { content: { parts: [{ text: 'Got it. Focusing on tests only.' }] } },
      ],
    });
    this.getCurrentSequenceModel = vi.fn().mockReturnValue('test-model');
    this.getChat = vi.fn().mockReturnValue({
      recordCompletedToolCalls: vi.fn(),
    });
    this.getChatRecordingService = vi.fn().mockReturnValue({
      recordThought: vi.fn(),
      initialize: vi.fn(),
      recordMessage: vi.fn(),
      recordMessageTokens: vi.fn(),
      recordToolCalls: vi.fn(),
      getConversationFile: vi.fn(),
    });
    this.getCurrentSequenceModel = vi
      .fn()
      .mockReturnValue('gemini-2.0-flash-exp');
  }),
);

const MockedUserPromptEvent = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {}),
);
const mockParseAndFormatApiError = vi.hoisted(() => vi.fn());

const MockValidationRequiredError = vi.hoisted(
  () =>
    class extends Error {
      userHandled = false;
    },
);

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actualCoreModule = (await importOriginal()) as any;
  return {
    ...actualCoreModule,
    GitService: vi.fn(),
    GeminiClient: MockedGeminiClientClass,
    UserPromptEvent: MockedUserPromptEvent,
    ValidationRequiredError: MockValidationRequiredError,
    parseAndFormatApiError: mockParseAndFormatApiError,
    tokenLimit: vi.fn().mockReturnValue(100), // Mock tokenLimit
    recordToolCallInteractions: vi.fn().mockResolvedValue(undefined),
    getCodeAssistServer: vi.fn().mockReturnValue(undefined),
  };
});

const mockUseToolScheduler = useToolScheduler as Mock;
vi.mock('./useToolScheduler.js', async (importOriginal) => {
  const actualSchedulerModule = (await importOriginal()) as any;
  return {
    ...(actualSchedulerModule || {}),
    useToolScheduler: vi.fn(),
  };
});

vi.mock('./useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('./shellCommandProcessor.js', () => ({
  useShellCommandProcessor: vi.fn().mockReturnValue({
    handleShellCommand: vi.fn(),
    activeShellPtyId: null,
    lastShellOutputTime: 0,
  }),
}));

vi.mock('./atCommandProcessor.js');

vi.mock('../utils/markdownUtilities.js', () => ({
  findLastSafeSplitPoint: vi.fn((s: string) => s.length),
}));

vi.mock('./useStateAndRef.js', () => ({
  useStateAndRef: vi.fn((initial) => {
    let val = initial;
    const ref = { current: val };
    const setVal = vi.fn((updater) => {
      if (typeof updater === 'function') {
        val = updater(val);
      } else {
        val = updater;
      }
      ref.current = val;
    });
    return [val, ref, setVal];
  }),
}));

vi.mock('./useLogger.js', () => ({
  useLogger: vi.fn().mockReturnValue({
    logMessage: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockStartNewPrompt = vi.fn();
const mockAddUsage = vi.fn();
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useSessionStats: vi.fn(() => ({
      startNewPrompt: mockStartNewPrompt,
      addUsage: mockAddUsage,
      getPromptCount: vi.fn(() => 5),
    })),
  };
});

vi.mock('./slashCommandProcessor.js', () => ({
  handleSlashCommand: vi.fn().mockReturnValue(false),
}));

vi.mock('./useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(() => false),
}));

// --- END MOCKS ---

// --- Tests for useGeminiStream Hook ---
describe('useGeminiStream', () => {
  let mockAddItem = vi.fn();
  let mockOnDebugMessage = vi.fn();
  let mockHandleSlashCommand = vi.fn().mockResolvedValue(false);
  let mockScheduleToolCalls: Mock;
  let mockCancelAllToolCalls: Mock;
  let mockMarkToolsAsSubmitted: Mock;
  let handleAtCommandSpy: MockInstance;

  const emptyHistory: any[] = [];
  let capturedOnComplete: any = null;
  const mockGetPreferredEditor = vi.fn(() => 'vscode' as EditorType);
  const mockOnAuthError = vi.fn();
  const mockPerformMemoryRefresh = vi.fn(() => Promise.resolve());
  const mockSetModelSwitchedFromQuotaError = vi.fn();
  const mockOnCancelSubmit = vi.fn();
  const mockSetShellInputFocused = vi.fn();

  const mockGetGeminiClient = vi.fn().mockImplementation(() => {
    const clientInstance = new MockedGeminiClientClass(mockConfig);
    return clientInstance;
  });

  const mockMcpClientManager = {
    getDiscoveryState: vi.fn().mockReturnValue(MCPDiscoveryState.COMPLETED),
    getMcpServerCount: vi.fn().mockReturnValue(0),
  };

  const mockConfig: Config = {
    apiKey: 'test-api-key',
    model: 'gemini-pro',
    sandbox: false,
    targetDir: '/test/dir',
    debugMode: false,
    question: undefined,
    coreTools: [],
    toolDiscoveryCommand: undefined,
    toolCallCommand: undefined,
    mcpServerCommand: undefined,
    mcpServers: undefined,
    userAgent: 'test-agent',
    userMemory: '',
    geminiMdFileCount: 0,
    alwaysSkipModificationConfirmation: false,
    vertexai: false,
    showMemoryUsage: false,
    contextFileName: undefined,
    storage: {
      getProjectTempDir: vi.fn(() => '/test/temp'),
      getProjectTempCheckpointsDir: vi.fn(() => '/test/temp/checkpoints'),
    } as any,
    getToolRegistry: vi.fn(
      () => ({ getToolSchemaList: vi.fn(() => []) }) as any,
    ),
    getProjectRoot: vi.fn(() => '/test/dir'),
    getCheckpointingEnabled: vi.fn(() => false),
    getGeminiClient: mockGetGeminiClient,
    getMcpClientManager: () => mockMcpClientManager as any,
    getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
    getUsageStatisticsEnabled: () => true,
    getDebugMode: () => false,
    addHistory: vi.fn(),
    getSessionId: vi.fn(() => 'test-session-id'),
    setQuotaErrorOccurred: vi.fn(),
    getQuotaErrorOccurred: vi.fn(() => false),
    getModel: vi.fn(() => 'gemini-2.5-pro'),
    getContentGeneratorConfig: vi.fn(() => ({
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    })),
    getContentGenerator: vi.fn(),
    isInteractive: () => false,
    getExperiments: () => {},
    getMaxSessionTurns: vi.fn(() => 100),
    isJitContextEnabled: vi.fn(() => false),
    getGlobalMemory: vi.fn(() => ''),
    getUserMemory: vi.fn(() => ''),
    getMessageBus: vi.fn(() => mockMessageBus),
    getBaseLlmClient: vi.fn(() => ({
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: 'Got it. Focusing on tests only.' }] } },
        ],
      }),
    })),
    getIdeMode: vi.fn(() => false),
    getEnableHooks: vi.fn(() => false),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    mockAddItem = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockHandleSlashCommand = vi.fn().mockResolvedValue(false);

    // Mock return value for useReactToolScheduler
    mockScheduleToolCalls = vi.fn();
    mockCancelAllToolCalls = vi.fn();
    mockMarkToolsAsSubmitted = vi.fn();

    // Reset properties of mockConfig if needed
    (mockConfig.getCheckpointingEnabled as Mock).mockReturnValue(false);
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);

    // Default mock for useReactToolScheduler to prevent toolCalls being undefined initially
    mockUseToolScheduler.mockReturnValue([
      [], // Default to empty array for toolCalls
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
      vi.fn(), // setToolCallsForDisplay
      mockCancelAllToolCalls,
      0, // lastToolOutputTime
    ]);

    // Reset mocks for GeminiClient instance methods (startChat and sendMessageStream)
    // The GeminiClient constructor itself is mocked at the module level.
    mockStartChat.mockClear().mockResolvedValue({
      sendMessageStream: mockSendMessageStream,
    } as unknown as any); // GeminiChat -> any
    mockSendMessageStream
      .mockClear()
      .mockReturnValue((async function* () {})());
    handleAtCommandSpy = vi.spyOn(atCommandProcessor, 'handleAtCommand');
    vi.spyOn(coreEvents, 'emitFeedback');
  });

  const mockLoadedSettings: LoadedSettings = {
    merged: { preferredEditor: 'vscode' },
    user: { path: '/user/settings.json', settings: {} },
    workspace: { path: '/workspace/.gemini/settings.json', settings: {} },
    errors: [],
    forScope: vi.fn(),
    setValue: vi.fn(),
  } as unknown as LoadedSettings;

  const renderTestHook = (
    initialToolCalls: TrackedToolCall[] = [],
    geminiClient?: any,
  ) => {
    const client = geminiClient || mockConfig.getGeminiClient();
    let lastToolCalls = initialToolCalls;

    const initialProps = {
      client,
      history: emptyHistory,
      addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
      config: mockConfig,
      onDebugMessage: mockOnDebugMessage,
      handleSlashCommand: mockHandleSlashCommand as unknown as (
        cmd: PartListUnion,
      ) => Promise<SlashCommandProcessorResult | false>,
      shellModeActive: false,
      loadedSettings: mockLoadedSettings,
      toolCalls: initialToolCalls,
    };

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        lastToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        (updater: any) => {
          lastToolCalls =
            typeof updater === 'function' ? updater(lastToolCalls) : updater;
          rerender({ ...initialProps, toolCalls: lastToolCalls });
        },
        (...args: any[]) => {
          mockCancelAllToolCalls(...args);
          lastToolCalls = lastToolCalls.map((tc) => {
            if (
              tc.status === CoreToolCallStatus.AwaitingApproval ||
              tc.status === CoreToolCallStatus.Executing ||
              tc.status === CoreToolCallStatus.Scheduled ||
              tc.status === CoreToolCallStatus.Validating
            ) {
              return {
                ...tc,
                status: CoreToolCallStatus.Cancelled,
                response: {
                  callId: tc.request.callId,
                  responseParts: [],
                  resultDisplay: 'Request cancelled.',
                },
                responseSubmittedToGemini: true,
              } as any as TrackedCancelledToolCall;
            }
            return tc;
          });
          rerender({ ...initialProps, toolCalls: lastToolCalls });
        },
        0,
      ];
    });

    const { result, rerender } = renderHookWithProviders(
      (props: typeof initialProps) =>
        useGeminiStream(
          props.client,
          props.history,
          props.addItem,
          props.config,
          props.loadedSettings,
          props.onDebugMessage,
          props.handleSlashCommand,
          props.shellModeActive,
          mockGetPreferredEditor,
          mockOnAuthError,
          mockPerformMemoryRefresh,
          false,
          mockSetModelSwitchedFromQuotaError,
          mockOnCancelSubmit,
          mockSetShellInputFocused,
          80,
          24,
        ),
      {
        initialProps,
      },
    );
    return {
      result,
      rerender,
      mockMarkToolsAsSubmitted,
      mockSendMessageStream,
      client,
    };
  };

  // Helper to create mock tool calls - reduces boilerplate
  const createMockToolCall = (
    toolName: string,
    callId: string,
    confirmationType: 'edit' | 'info',
    status: TrackedToolCall['status'] = CoreToolCallStatus.AwaitingApproval,
    mockOnConfirm: Mock = vi.fn(),
  ): TrackedWaitingToolCall => ({
    request: {
      callId,
      name: toolName,
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    },
    status: status as CoreToolCallStatus.AwaitingApproval,
    responseSubmittedToGemini: false,
    confirmationDetails:
      confirmationType === 'edit'
        ? {
            type: 'edit',
            title: 'Confirm Edit',
            fileName: 'file.txt',
            filePath: '/test/file.txt',
            fileDiff: 'fake diff',
            originalContent: 'old',
            newContent: 'new',
            onConfirm: mockOnConfirm,
          }
        : {
            type: 'info',
            title: `${toolName} confirmation`,
            prompt: `Execute ${toolName}?`,
            onConfirm: mockOnConfirm,
          },
    tool: {
      name: toolName,
      displayName: toolName,
      description: `${toolName} description`,
      build: vi.fn(),
    } as any,
    invocation: {
      getDescription: () => 'Mock description',
    } as unknown as AnyToolInvocation,
    correlationId: `corr-${callId}`,
  });

  // Helper to render hook with default parameters - reduces boilerplate
  const renderHookWithDefaults = (
    options: {
      shellModeActive?: boolean;
      onCancelSubmit?: () => void;
      setShellInputFocused?: (focused: boolean) => void;
      performMemoryRefresh?: () => Promise<void>;
      onAuthError?: () => void;
      setModelSwitched?: Mock;
      modelSwitched?: boolean;
    } = {},
  ) => {
    const {
      shellModeActive = false,
      onCancelSubmit = () => {},
      setShellInputFocused = () => {},
      performMemoryRefresh = () => Promise.resolve(),
      onAuthError = () => {},
      setModelSwitched = vi.fn(),
      modelSwitched = false,
    } = options;

    return renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        shellModeActive,
        () => 'vscode' as EditorType,
        onAuthError,
        performMemoryRefresh,
        modelSwitched,
        setModelSwitched,
        onCancelSubmit,
        setShellInputFocused,
        80,
        24,
      ),
    );
  };

  it('should not submit tool responses if not all tool calls are completed', () => {
    const toolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        status: CoreToolCallStatus.Success,
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: [{ text: 'tool 1 response' }],
          error: undefined,
          errorType: undefined, // FIX: Added missing property
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          displayName: 'tool1',
          description: 'desc1',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
        startTime: Date.now(),
        endTime: Date.now(),
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          prompt_id: 'prompt-id-1',
        },
        status: CoreToolCallStatus.Executing,
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool2',
          displayName: 'tool2',
          description: 'desc2',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
        startTime: Date.now(),
        liveOutput: '...',
      } as TrackedExecutingToolCall,
    ];

    const { mockMarkToolsAsSubmitted, mockSendMessageStream } =
      renderTestHook(toolCalls);

    // Effect for submitting tool responses depends on toolCalls and isResponding
    // isResponding is initially false, so the effect should run.

    expect(mockMarkToolsAsSubmitted).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled(); // submitQuery uses this
  });

  it('should submit tool responses when all tool calls are completed and ready', async () => {
    const toolCall1ResponseParts: Part[] = [{ text: 'tool 1 final response' }];
    const toolCall2ResponseParts: Part[] = [{ text: 'tool 2 final response' }];
    const completedToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: CoreToolCallStatus.Success,
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: toolCall1ResponseParts,
          errorType: undefined, // FIX: Added missing property
        },
        tool: {
          displayName: 'MockTool',
        },
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: CoreToolCallStatus.Error,
        responseSubmittedToGemini: false,
        response: {
          callId: 'call2',
          responseParts: toolCall2ResponseParts,
          errorType: ToolErrorType.UNHANDLED_EXCEPTION, // FIX: Added missing property
        },
      } as TrackedCompletedToolCall, // Treat error as a form of completion for submission
    ];

    // Capture the onComplete callback
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ];
    });

    renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
        () => {},
        () => {},
        80,
        24,
      ),
    );

    // Trigger the onComplete callback with completed tools
    await act(async () => {
      if (capturedOnComplete) {
        // Wait a tick for refs to be set up
        await new Promise((resolve) => setTimeout(resolve, 0));
        await capturedOnComplete(completedToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledTimes(1);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    const expectedMergedResponse = [
      ...toolCall1ResponseParts,
      ...toolCall2ResponseParts,
    ];
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expectedMergedResponse,
      expect.any(AbortSignal),
      'prompt-id-2',
      undefined,
      false,
      expectedMergedResponse,
    );
  });

  it('should inject steering hint prompt for continuation', async () => {
    const toolCallResponseParts: Part[] = [{ text: 'tool final response' }];
    const completedToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-ack',
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: toolCallResponseParts,
          errorType: undefined,
        },
        tool: {
          displayName: 'MockTool',
        },
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
      } as TrackedCompletedToolCall,
    ];

    mockSendMessageStream.mockReturnValue(
      (async function* () {
        yield {
          type: ServerGeminiEventType.Content,
          value: 'Applied the requested adjustment.',
        };
      })(),
    );

    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;
    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ];
    });

    renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
        () => {},
        () => {},
        80,
        24,
        undefined,
        () => 'focus on tests only',
      ),
    );

    await act(async () => {
      if (capturedOnComplete) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await capturedOnComplete(completedToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    const sentParts = mockSendMessageStream.mock.calls[0][0] as Part[];
    const injectedHintPart = sentParts[0] as { text?: string };
    expect(injectedHintPart.text).toContain('User steering update:');
    expect(injectedHintPart.text).toContain(
      '<user_input>\nfocus on tests only\n</user_input>',
    );
    expect(injectedHintPart.text).toContain(
      'Classify it as ADD_TASK, MODIFY_TASK, CANCEL_TASK, or EXTRA_CONTEXT.',
    );
    expect(injectedHintPart.text).toContain(
      'Do not cancel/skip tasks unless the user explicitly cancels them.',
    );
    expect(
      mockAddItem.mock.calls.some(
        ([item]) =>
          item?.type === 'info' &&
          typeof item.text === 'string' &&
          item.text.includes('Got it. Focusing on tests only.'),
      ),
    ).toBe(true);
  });

  it('should handle all tool calls being cancelled', async () => {
    const cancelledToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: '1',
          name: 'testTool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-3',
        },
        status: CoreToolCallStatus.Cancelled,
        response: {
          callId: '1',
          responseParts: [{ text: CoreToolCallStatus.Cancelled }],
          errorType: undefined, // FIX: Added missing property
        },
        responseSubmittedToGemini: false,
        tool: {
          displayName: 'mock tool',
        },
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
      } as TrackedCancelledToolCall,
    ];
    const client = new MockedGeminiClientClass(mockConfig);

    // Capture the onComplete callback
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ];
    });

    renderHookWithProviders(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
        () => {},
        () => {},
        80,
        24,
      ),
    );

    // Trigger the onComplete callback with cancelled tools
    await act(async () => {
      if (capturedOnComplete) {
        // Wait a tick for refs to be set up
        await new Promise((resolve) => setTimeout(resolve, 0));
        await capturedOnComplete(cancelledToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith(['1']);
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [{ text: CoreToolCallStatus.Cancelled }],
      });
      // Ensure we do NOT call back to the API
      expect(mockSendMessageStream).not.toHaveBeenCalled();
    });
  });

  it('should stop agent execution immediately when a tool call returns STOP_EXECUTION error', async () => {
    const stopExecutionToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'stop-call',
          name: 'stopTool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-stop',
        },
        status: CoreToolCallStatus.Error,
        response: {
          callId: 'stop-call',
          responseParts: [{ text: 'error occurred' }],
          errorType: ToolErrorType.STOP_EXECUTION,
          error: new Error('Stop reason from hook'),
          resultDisplay: undefined,
        },
        responseSubmittedToGemini: false,
        tool: {
          displayName: 'stop tool',
        },
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
      } as unknown as TrackedCompletedToolCall,
    ];
    const client = new MockedGeminiClientClass(mockConfig);

    const { result } = renderTestHook([], client);

    // Trigger the onComplete callback with STOP_EXECUTION tool
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(stopExecutionToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith(['stop-call']);
      // Should add an info message to history
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            'Agent execution stopped: Stop reason from hook',
          ),
        }),
      );
      // Ensure we do NOT call back to the API
      expect(mockSendMessageStream).not.toHaveBeenCalled();
      // Streaming state should be Idle
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });
  });

  it('should group multiple cancelled tool call responses into a single history entry', async () => {
    const cancelledToolCall1: TrackedCancelledToolCall = {
      request: {
        callId: 'cancel-1',
        name: 'toolA',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-7',
      },
      tool: {
        name: 'toolA',
        displayName: 'toolA',
        description: 'descA',
        build: vi.fn(),
      } as any,
      invocation: {
        getDescription: () => `Mock description`,
      } as unknown as AnyToolInvocation,
      status: CoreToolCallStatus.Cancelled,
      response: {
        callId: 'cancel-1',
        responseParts: [
          { functionResponse: { name: 'toolA', id: 'cancel-1' } },
        ],
        resultDisplay: undefined,
        error: undefined,
        errorType: undefined, // FIX: Added missing property
      },
      responseSubmittedToGemini: false,
    };
    const cancelledToolCall2: TrackedCancelledToolCall = {
      request: {
        callId: 'cancel-2',
        name: 'toolB',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-8',
      },
      tool: {
        name: 'toolB',
        displayName: 'toolB',
        description: 'descB',
        build: vi.fn(),
      } as any,
      invocation: {
        getDescription: () => `Mock description`,
      } as unknown as AnyToolInvocation,
      status: CoreToolCallStatus.Cancelled,
      response: {
        callId: 'cancel-2',
        responseParts: [
          { functionResponse: { name: 'toolB', id: 'cancel-2' } },
        ],
        resultDisplay: undefined,
        error: undefined,
        errorType: undefined, // FIX: Added missing property
      },
      responseSubmittedToGemini: false,
    };
    const allCancelledTools = [cancelledToolCall1, cancelledToolCall2];
    const client = new MockedGeminiClientClass(mockConfig);

    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ];
    });

    renderHookWithProviders(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
        () => {},
        () => {},
        80,
        24,
      ),
    );

    // Trigger the onComplete callback with multiple cancelled tools
    await act(async () => {
      if (capturedOnComplete) {
        // Wait a tick for refs to be set up
        await new Promise((resolve) => setTimeout(resolve, 0));
        await capturedOnComplete(allCancelledTools);
      }
    });

    await waitFor(() => {
      // The tools should be marked as submitted locally
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith([
        'cancel-1',
        'cancel-2',
      ]);

      // Crucially, addHistory should be called only ONCE
      expect(client.addHistory).toHaveBeenCalledTimes(1);

      // And that single call should contain BOTH function responses
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [
          ...cancelledToolCall1.response.responseParts,
          ...cancelledToolCall2.response.responseParts,
        ],
      });

      // No message should be sent back to the API for a turn with only cancellations
      expect(mockSendMessageStream).not.toHaveBeenCalled();
    });
  });

  it('should not flicker streaming state to Idle between tool completion and submission', async () => {
    const toolCallResponseParts: PartListUnion = [
      { text: 'tool 1 final response' },
    ];

    const initialToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-4',
        },
        status: CoreToolCallStatus.Executing,
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool1',
          displayName: 'tool1',
          description: 'desc',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
        startTime: Date.now(),
      } as TrackedExecutingToolCall,
    ];

    const completedToolCalls: TrackedToolCall[] = [
      {
        ...(initialToolCalls[0] as TrackedExecutingToolCall),
        status: CoreToolCallStatus.Success,
        response: {
          callId: 'call1',
          responseParts: toolCallResponseParts,
          error: undefined,
          errorType: undefined, // FIX: Added missing property
          resultDisplay: 'Tool 1 success display',
        },
        endTime: Date.now(),
      } as TrackedCompletedToolCall,
    ];

    // Capture the onComplete callback
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;
    let currentToolCalls = initialToolCalls;

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        currentToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(), // setToolCallsForDisplay
        mockCancelAllToolCalls,
        0,
      ];
    });

    const { result, rerender } = renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
        () => {},
        () => {},
        80,
        24,
      ),
    );

    // 1. Initial state should be Responding because a tool is executing.
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 2. Update the tool calls to completed state and rerender
    currentToolCalls = completedToolCalls;
    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        completedToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(), // setToolCallsForDisplay
        mockCancelAllToolCalls,
        0,
      ];
    });

    act(() => {
      rerender();
    });

    // 3. The state should *still* be Responding, not Idle.
    // This is because the completed tool's response has not been submitted yet.
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 4. Trigger the onComplete callback to simulate tool completion
    await act(async () => {
      if (capturedOnComplete) {
        // Wait a tick for refs to be set up
        await new Promise((resolve) => setTimeout(resolve, 0));
        await capturedOnComplete(completedToolCalls);
      }
    });

    // 5. Wait for submitQuery to be called
    await waitFor(() => {
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        toolCallResponseParts,
        expect.any(AbortSignal),
        'prompt-id-4',
        undefined,
        false,
        toolCallResponseParts,
      );
    });

    // 6. After submission, the state should remain Responding until the stream completes.
    expect(result.current.streamingState).toBe(StreamingState.Responding);
  });

  describe('User Cancellation', () => {
    let keypressCallback: (key: any) => void;
    const mockUseKeypress = useKeypress as Mock;

    beforeEach(() => {
      // Capture the callback passed to useKeypress
      mockUseKeypress.mockImplementation((callback, options) => {
        if (options.isActive) {
          keypressCallback = callback;
        } else {
          keypressCallback = () => {};
        }
      });
    });

    const simulateEscapeKeyPress = () => {
      act(() => {
        keypressCallback({ name: 'escape' });
      });
    };

    it('should cancel an in-progress stream when escape is pressed', async () => {
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Part 1' };
        // Keep the stream open
        await new Promise(() => {});
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      // Start a query
      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.current.submitQuery('test query');
      });

      // Wait for the first part of the response
      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // Simulate escape key press
      simulateEscapeKeyPress();

      // Verify cancellation message is added
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith({
          type: MessageType.INFO,
          text: 'Request cancelled.',
        });
      });

      // Verify state is reset
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('should call onCancelSubmit handler when escape is pressed', async () => {
      const cancelSubmitSpy = vi.fn();
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Part 1' };
        // Keep the stream open
        await new Promise(() => {});
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          mockConfig.getGeminiClient(),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          cancelSubmitSpy,
          () => {},
          80,
          24,
        ),
      );

      // Start a query
      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.current.submitQuery('test query');
      });

      simulateEscapeKeyPress();

      expect(cancelSubmitSpy).toHaveBeenCalledWith(false);
    });

    it('should call setShellInputFocused(false) when escape is pressed', async () => {
      const setShellInputFocusedSpy = vi.fn();
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Part 1' };
        await new Promise(() => {}); // Keep stream open
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          mockConfig.getGeminiClient(),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          vi.fn(),
          setShellInputFocusedSpy, // Pass the spy here
          80,
          24,
        ),
      );

      // Start a query
      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.current.submitQuery('test query');
      });

      simulateEscapeKeyPress();

      expect(setShellInputFocusedSpy).toHaveBeenCalledWith(false);
    });

    it('should not do anything if escape is pressed when not responding', () => {
      const { result } = renderTestHook();

      expect(result.current.streamingState).toBe(StreamingState.Idle);

      // Simulate escape key press
      simulateEscapeKeyPress();

      // No change should happen, no cancellation message
      expect(mockAddItem).not.toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Request cancelled.',
        }),
      );
    });

    it('should prevent further processing after cancellation', async () => {
      let continueStream: () => void;
      const streamPromise = new Promise<void>((resolve) => {
        continueStream = resolve;
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Initial' };
        await streamPromise; // Wait until we manually continue
        yield { type: 'content', value: ' Canceled' };
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.current.submitQuery('long running query');
      });

      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // Cancel the request
      simulateEscapeKeyPress();

      // Allow the stream to continue
      await act(async () => {
        continueStream();
        // Wait a bit to see if the second part is processed
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // The text should not have been updated with " Canceled"
      const lastCall = mockAddItem.mock.calls.find(
        (call) => call[0].type === 'gemini',
      );
      expect(lastCall?.[0].text).toBe('Initial');

      // The final state should be idle after cancellation
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('should cancel if a tool call is in progress', async () => {
      const toolCalls: TrackedToolCall[] = [
        {
          request: { callId: 'call1', name: 'tool1', args: {} },
          status: CoreToolCallStatus.Executing,
          responseSubmittedToGemini: false,
          tool: {
            name: 'tool1',
            description: 'desc1',
            build: vi.fn().mockImplementation((_) => ({
              getDescription: () => `Mock description`,
            })),
          } as any,
          invocation: {
            getDescription: () => `Mock description`,
          },
          startTime: Date.now(),
          liveOutput: '...',
        } as TrackedExecutingToolCall,
      ];

      const { result } = renderTestHook(toolCalls);

      // State is `Responding` because a tool is running
      expect(result.current.streamingState).toBe(StreamingState.Responding);

      // Try to cancel
      simulateEscapeKeyPress();

      // The cancel function should be called
      expect(mockCancelAllToolCalls).toHaveBeenCalled();
    });

    it('should cancel a request when a tool is awaiting confirmation', async () => {
      const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
      const toolCalls: TrackedToolCall[] = [
        {
          request: {
            callId: 'confirm-call',
            name: 'some_tool',
            args: {},
            isClientInitiated: false,
            prompt_id: 'prompt-id-1',
          },
          status: CoreToolCallStatus.AwaitingApproval,
          responseSubmittedToGemini: false,
          tool: {
            name: 'some_tool',
            description: 'a tool',
            build: vi.fn().mockImplementation((_) => ({
              getDescription: () => `Mock description`,
            })),
          } as any,
          invocation: {
            getDescription: () => `Mock description`,
          } as unknown as AnyToolInvocation,
          confirmationDetails: {
            type: 'edit',
            title: 'Confirm Edit',
            onConfirm: mockOnConfirm,
            fileName: 'file.txt',
            filePath: '/test/file.txt',
            fileDiff: 'fake diff',
            originalContent: 'old',
            newContent: 'new',
          },
        } as TrackedWaitingToolCall,
      ];

      const { result } = renderTestHook(toolCalls);

      // State is `WaitingForConfirmation` because a tool is awaiting approval
      expect(result.current.streamingState).toBe(
        StreamingState.WaitingForConfirmation,
      );

      // Try to cancel
      simulateEscapeKeyPress();

      // The imperative cancel function should be called on the scheduler
      expect(mockCancelAllToolCalls).toHaveBeenCalled();

      // A cancellation message should be added to history
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Request cancelled.',
          }),
        );
      });

      // The final state should be idle
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });
  });

  describe('Retry Handling', () => {
    it('should update retryStatus when CoreEvent.RetryAttempt is emitted', async () => {
      const { result } = renderHookWithDefaults();

      const retryPayload = {
        model: 'gemini-2.5-pro',
        attempt: 2,
        maxAttempts: 3,
        delayMs: 1000,
      };

      await act(async () => {
        coreEvents.emit(CoreEvent.RetryAttempt, retryPayload);
      });

      expect(result.current.retryStatus).toEqual(retryPayload);
    });

    it('should reset retryStatus when isResponding becomes false', async () => {
      const { result } = renderTestHook();

      const retryPayload = {
        model: 'gemini-2.5-pro',
        attempt: 2,
        maxAttempts: 3,
        delayMs: 1000,
      };

      // Start a query to make isResponding true
      const mockStream = (async function* () {
        yield { type: ServerGeminiEventType.Content, value: 'Part 1' };
        await new Promise(() => {}); // Keep stream open
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        result.current.submitQuery('test query');
      });

      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // Emit retry event
      await act(async () => {
        coreEvents.emit(CoreEvent.RetryAttempt, retryPayload);
      });

      expect(result.current.retryStatus).toEqual(retryPayload);

      // Cancel to make isResponding false
      await act(async () => {
        result.current.cancelOngoingRequest();
      });

      expect(result.current.retryStatus).toBeNull();
    });
  });

  describe('Slash Command Handling', () => {
    it('should schedule a tool call when the command processor returns a schedule_tool action', async () => {
      const clientToolRequest: SlashCommandProcessorResult = {
        type: 'schedule_tool',
        toolName: 'save_memory',
        toolArgs: { fact: 'test fact' },
      };
      mockHandleSlashCommand.mockResolvedValue(clientToolRequest);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/memory add "test fact"');
      });

      await waitFor(() => {
        expect(mockScheduleToolCalls).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              name: 'save_memory',
              args: { fact: 'test fact' },
              isClientInitiated: true,
            }),
          ],
          expect.any(AbortSignal),
        );
        expect(mockSendMessageStream).not.toHaveBeenCalled();
      });
    });

    it('should stop processing and not call Gemini when a command is handled without a tool call', async () => {
      const uiOnlyCommandResult: SlashCommandProcessorResult = {
        type: 'handled',
      };
      mockHandleSlashCommand.mockResolvedValue(uiOnlyCommandResult);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/help');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/help');
        expect(mockScheduleToolCalls).not.toHaveBeenCalled();
        expect(mockSendMessageStream).not.toHaveBeenCalled(); // No LLM call made
      });
    });

    it('should call Gemini with prompt content when slash command returns a `submit_prompt` action', async () => {
      const customCommandResult: SlashCommandProcessorResult = {
        type: 'submit_prompt',
        content: 'This is the actual prompt from the command file.',
      };
      mockHandleSlashCommand.mockResolvedValue(customCommandResult);

      const { result, mockSendMessageStream: localMockSendMessageStream } =
        renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/my-custom-command');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).toHaveBeenCalledWith(
          '/my-custom-command',
        );

        expect(localMockSendMessageStream).not.toHaveBeenCalledWith(
          '/my-custom-command',
          expect.anything(),
          expect.anything(),
        );

        expect(localMockSendMessageStream).toHaveBeenCalledWith(
          'This is the actual prompt from the command file.',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          '/my-custom-command',
        );

        expect(mockScheduleToolCalls).not.toHaveBeenCalled();
      });
    });

    it('should correctly handle a submit_prompt action with empty content', async () => {
      const emptyPromptResult: SlashCommandProcessorResult = {
        type: 'submit_prompt',
        content: '',
      };
      mockHandleSlashCommand.mockResolvedValue(emptyPromptResult);

      const { result, mockSendMessageStream: localMockSendMessageStream } =
        renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/emptycmd');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).toHaveBeenCalledWith('/emptycmd');
        expect(localMockSendMessageStream).toHaveBeenCalledWith(
          '',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          '/emptycmd',
        );
      });
    });

    it('should not call handleSlashCommand for line comments', async () => {
      const { result, mockSendMessageStream: localMockSendMessageStream } =
        renderTestHook();

      await act(async () => {
        await result.current.submitQuery('// This is a line comment');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        expect(localMockSendMessageStream).toHaveBeenCalledWith(
          '// This is a line comment',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          '// This is a line comment',
        );
      });
    });

    it('should not call handleSlashCommand for block comments', async () => {
      const { result, mockSendMessageStream: localMockSendMessageStream } =
        renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/* This is a block comment */');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
        expect(localMockSendMessageStream).toHaveBeenCalledWith(
          '/* This is a block comment */',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          '/* This is a block comment */',
        );
      });
    });

    it('should not call handleSlashCommand is shell mode is active', async () => {
      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          () => {},
          mockHandleSlashCommand,
          true,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      await act(async () => {
        await result.current.submitQuery('/about');
      });

      await waitFor(() => {
        expect(mockHandleSlashCommand).not.toHaveBeenCalled();
      });
    });
  });

  describe('Memory Refresh on save_memory', () => {
    it('should call performMemoryRefresh when a save_memory tool call completes successfully', async () => {
      const mockPerformMemoryRefresh = vi.fn();
      const completedToolCall: TrackedCompletedToolCall = {
        request: {
          callId: 'save-mem-call-1',
          name: 'save_memory',
          args: { fact: 'test' },
          isClientInitiated: true,
          prompt_id: 'prompt-id-6',
        },
        status: CoreToolCallStatus.Success,
        responseSubmittedToGemini: false,
        response: {
          callId: 'save-mem-call-1',
          responseParts: [{ text: 'Memory saved' }],
          resultDisplay: 'Success: Memory saved',
          error: undefined,
          errorType: undefined, // FIX: Added missing property
        },
        tool: {
          name: 'save_memory',
          displayName: 'save_memory',
          description: 'Saves memory',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => `Mock description`,
        } as unknown as AnyToolInvocation,
      };

      // Capture the onComplete callback
      let capturedOnComplete:
        | ((completedTools: TrackedToolCall[]) => Promise<void>)
        | null = null;

      mockUseToolScheduler.mockImplementation((onComplete) => {
        capturedOnComplete = onComplete;
        return [
          [],
          mockScheduleToolCalls,
          mockMarkToolsAsSubmitted,
          vi.fn(),
          mockCancelAllToolCalls,
          0,
        ];
      });

      renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          mockPerformMemoryRefresh,
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Trigger the onComplete callback with the completed save_memory tool
      await act(async () => {
        if (capturedOnComplete) {
          // Wait a tick for refs to be set up
          await new Promise((resolve) => setTimeout(resolve, 0));
          await capturedOnComplete([completedToolCall]);
        }
      });

      await waitFor(() => {
        expect(mockPerformMemoryRefresh).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Error Handling', () => {
    it('should call parseAndFormatApiError with the correct authType on stream initialization failure', async () => {
      // 1. Setup
      const mockError = new Error('Rate limit exceeded');
      const mockAuthType = AuthType.LOGIN_WITH_GOOGLE;
      mockParseAndFormatApiError.mockClear();
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: '' };
          throw mockError;
        })(),
      );

      const testConfig = {
        ...mockConfig,
        getContentGenerator: vi.fn(),
        getContentGeneratorConfig: vi.fn(() => ({
          authType: mockAuthType,
        })),
        getModel: vi.fn(() => 'gemini-2.5-pro'),
      } as unknown as Config;

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(testConfig),
          [],
          mockAddItem,
          testConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // 2. Action
      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // 3. Assertion
      await waitFor(() => {
        expect(mockParseAndFormatApiError).toHaveBeenCalledWith(
          'Rate limit exceeded',
          mockAuthType,
          undefined,
          'gemini-2.5-pro',
          'gemini-2.5-flash',
        );
      });
    });
  });

  describe('handleApprovalModeChange', () => {
    it('should auto-approve all pending tool calls when switching to YOLO mode', async () => {
      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        createMockToolCall('replace', 'call1', 'edit'),
        createMockToolCall('read_file', 'call2', 'info'),
      ];

      const { result } = renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // Both tool calls should be auto-approved
      expect(mockMessageBus.publish).toHaveBeenCalledTimes(2);
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'corr-call1',
          outcome: ToolConfirmationOutcome.ProceedOnce,
        }),
      );
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-call2',
          outcome: ToolConfirmationOutcome.ProceedOnce,
        }),
      );
    });

    it('should only auto-approve edit tools when switching to AUTO_EDIT mode', async () => {
      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        createMockToolCall('replace', 'call1', 'edit'),
        createMockToolCall('write_file', 'call2', 'edit'),
        createMockToolCall('read_file', 'call3', 'info'),
      ];

      const { result } = renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.AUTO_EDIT);
      });

      // Only replace and write_file should be auto-approved
      expect(mockMessageBus.publish).toHaveBeenCalledTimes(2);
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-call1' }),
      );
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-call2' }),
      );
      expect(mockMessageBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-call3' }),
      );
    });

    it('should not auto-approve any tools when switching to REQUIRE_CONFIRMATION mode', async () => {
      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        createMockToolCall('replace', 'call1', 'edit'),
      ];

      const { result } = renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.DEFAULT);
      });

      // No tools should be auto-approved
      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when auto-approving tool calls', async () => {
      const debuggerSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      mockMessageBus.publish.mockRejectedValueOnce(new Error('Bus error'));

      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        createMockToolCall('replace', 'call1', 'edit'),
        createMockToolCall('write_file', 'call2', 'edit'),
      ];

      const { result } = renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // Both should be attempted despite first error
      expect(mockMessageBus.publish).toHaveBeenCalledTimes(2);
      expect(debuggerSpy).toHaveBeenCalledWith(
        'Failed to auto-approve tool call call1:',
        expect.any(Error),
      );

      debuggerSpy.mockRestore();
    });

    it('should skip tool calls without confirmationDetails', async () => {
      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        {
          request: {
            callId: 'call1',
            name: 'replace',
            args: { old_string: 'old', new_string: 'new' },
            isClientInitiated: false,
            prompt_id: 'prompt-id-1',
          },
          status: CoreToolCallStatus.AwaitingApproval,
          responseSubmittedToGemini: false,
          // No confirmationDetails
          tool: {
            name: 'replace',
            displayName: 'replace',
            description: 'Replace text',
            build: vi.fn(),
          } as any,
          invocation: {
            getDescription: () => 'Mock description',
          } as unknown as AnyToolInvocation,
          correlationId: 'corr-1',
        } as unknown as TrackedWaitingToolCall,
      ];

      const { result } = renderTestHook(awaitingApprovalToolCalls);

      // Should not throw an error
      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });
    });

    it('should only process tool calls with awaiting_approval status', async () => {
      const mockOnConfirmAwaiting = vi.fn().mockResolvedValue(undefined);
      const mixedStatusToolCalls: TrackedToolCall[] = [
        createMockToolCall(
          'replace',
          'call1',
          'edit',
          CoreToolCallStatus.AwaitingApproval,
          mockOnConfirmAwaiting,
        ),
        {
          request: {
            callId: 'call2',
            name: 'write_file',
            args: { path: '/test/file.txt', content: 'content' },
            isClientInitiated: false,
            prompt_id: 'prompt-id-1',
          },
          status: CoreToolCallStatus.Executing,
          responseSubmittedToGemini: false,
          tool: {
            name: 'write_file',
            displayName: 'write_file',
            description: 'Write file',
            build: vi.fn(),
          } as any,
          invocation: {
            getDescription: () => 'Mock description',
          } as unknown as AnyToolInvocation,
          startTime: Date.now(),
          liveOutput: 'Writing...',
          correlationId: 'corr-call2',
        } as TrackedExecutingToolCall,
      ];

      const { result } = renderTestHook(mixedStatusToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // Only the awaiting_approval tool should be processed.
      expect(mockMessageBus.publish).toHaveBeenCalledTimes(1);
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-call1' }),
      );
      expect(mockMessageBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-call2' }),
      );
    });
  });

  describe('handleFinishedEvent', () => {
    it('should add info message for MAX_TOKENS finish reason', async () => {
      // Setup mock to return a stream with MAX_TOKENS finish reason
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'This is a truncated response...',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'MAX_TOKENS', usageMetadata: undefined },
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Generate long text');
      });

      // Check that the info message was added
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: 'info',
            text: '⚠️  Response truncated due to token limits.',
          },
          expect.any(Number),
        );
      });
    });

    describe('ContextWindowWillOverflow event', () => {
      beforeEach(() => {
        vi.mocked(tokenLimit).mockReturnValue(100);
      });

      it.each([
        {
          name: 'without suggestion when remaining tokens are > 75% of limit',
          requestTokens: 20,
          remainingTokens: 80,
          expectedMessage:
            'Sending this message (20 tokens) might exceed the remaining context window limit (80 tokens).',
        },
        {
          name: 'with suggestion when remaining tokens are < 75% of limit',
          requestTokens: 30,
          remainingTokens: 70,
          expectedMessage:
            'Sending this message (30 tokens) might exceed the remaining context window limit (70 tokens). Please try reducing the size of your message or use the `/compress` command to compress the chat history.',
        },
      ])(
        'should add message $name',
        async ({ requestTokens, remainingTokens, expectedMessage }) => {
          mockSendMessageStream.mockReturnValue(
            (async function* () {
              yield {
                type: ServerGeminiEventType.ContextWindowWillOverflow,
                value: {
                  estimatedRequestTokenCount: requestTokens,
                  remainingTokenCount: remainingTokens,
                },
              };
            })(),
          );

          const { result } = renderHookWithDefaults();

          await act(async () => {
            await result.current.submitQuery('Test overflow');
          });

          await waitFor(() => {
            expect(mockAddItem).toHaveBeenCalledWith({
              type: 'info',
              text: expectedMessage,
            });
          });
        },
      );
    });

    it('should call onCancelSubmit when ContextWindowWillOverflow event is received', async () => {
      const onCancelSubmitSpy = vi.fn();
      // Setup mock to return a stream with ContextWindowWillOverflow event
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.ContextWindowWillOverflow,
            value: {
              estimatedRequestTokenCount: 100,
              remainingTokenCount: 50,
            },
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          onCancelSubmitSpy,
          () => {},
          80,
          24,
        ),
      );

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test overflow');
      });

      // Check that onCancelSubmit was called
      await waitFor(() => {
        expect(onCancelSubmitSpy).toHaveBeenCalledWith(true);
      });
    });

    it.each([
      {
        reason: 'STOP',
        shouldAddMessage: false,
      },
      {
        reason: 'FINISH_REASON_UNSPECIFIED',
        shouldAddMessage: false,
      },
      {
        reason: 'SAFETY',
        message: '⚠️  Response stopped due to safety reasons.',
      },
      {
        reason: 'RECITATION',
        message: '⚠️  Response stopped due to recitation policy.',
      },
      {
        reason: 'LANGUAGE',
        message: '⚠️  Response stopped due to unsupported language.',
      },
      {
        reason: 'BLOCKLIST',
        message: '⚠️  Response stopped due to forbidden terms.',
      },
      {
        reason: 'PROHIBITED_CONTENT',
        message: '⚠️  Response stopped due to prohibited content.',
      },
      {
        reason: 'SPII',
        message:
          '⚠️  Response stopped due to sensitive personally identifiable information.',
      },
      {
        reason: 'OTHER',
        message: '⚠️  Response stopped for other reasons.',
      },
      {
        reason: 'MALFORMED_FUNCTION_CALL',
        message: '⚠️  Response stopped due to malformed function call.',
      },
      {
        reason: 'IMAGE_SAFETY',
        message: '⚠️  Response stopped due to image safety violations.',
      },
      {
        reason: 'UNEXPECTED_TOOL_CALL',
        message: '⚠️  Response stopped due to unexpected tool call.',
      },
    ])(
      'should handle $reason finish reason correctly',
      async ({ reason, shouldAddMessage = true, message }) => {
        mockSendMessageStream.mockReturnValue(
          (async function* () {
            yield {
              type: ServerGeminiEventType.Content,
              value: `Response for ${reason}`,
            };
            yield {
              type: ServerGeminiEventType.Finished,
              value: { reason, usageMetadata: undefined },
            };
          })(),
        );

        const { result } = renderHookWithDefaults();

        await act(async () => {
          await result.current.submitQuery(`Test ${reason}`);
        });

        if (shouldAddMessage) {
          await waitFor(() => {
            expect(mockAddItem).toHaveBeenCalledWith(
              {
                type: 'info',
                text: message,
              },
              expect.any(Number),
            );
          });
        } else {
          // Verify state returns to idle without any info messages
          await waitFor(() => {
            expect(result.current.streamingState).toBe(StreamingState.Idle);
          });

          const infoMessages = mockAddItem.mock.calls.filter(
            (call) => call[0].type === 'info',
          );
          expect(infoMessages).toHaveLength(0);
        }
      },
    );
  });

  it('should flush pending text rationale before scheduling tool calls to ensure correct history order', async () => {
    const addItemOrder: string[] = [];
    let capturedOnComplete: any;

    const mockScheduleToolCalls = vi.fn(async (requests) => {
      addItemOrder.push('scheduleToolCalls_START');
      // Simulate tools completing and triggering onComplete immediately.
      // This mimics the behavior that caused the regression where tool results
      // were added to history during the await scheduleToolCalls(...) block.
      const tools = requests.map((r: any) => ({
        request: r,
        status: CoreToolCallStatus.Success,
        tool: { displayName: r.name, name: r.name },
        invocation: { getDescription: () => 'desc' },
        response: { responseParts: [], resultDisplay: 'done' },
        startTime: Date.now(),
        endTime: Date.now(),
      }));
      // Wait a tick for refs to be set up
      await new Promise((resolve) => setTimeout(resolve, 0));
      await capturedOnComplete(tools);
      addItemOrder.push('scheduleToolCalls_END');
    });

    mockAddItem.mockImplementation((item: any) => {
      addItemOrder.push(`addItem:${item.type}`);
    });

    // We need to capture the onComplete callback from useToolScheduler
    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        [], // toolCalls
        mockScheduleToolCalls,
        vi.fn(), // markToolsAsSubmitted
        vi.fn(), // setToolCallsForDisplay
        vi.fn(), // cancelAllToolCalls
        0, // lastToolOutputTime
      ];
    });

    const { result } = renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        vi.fn(),
        false,
        () => 'vscode' as EditorType,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    const mockStream = (async function* () {
      yield {
        type: ServerGeminiEventType.Content,
        value: 'Rationale rationale.',
      };
      yield {
        type: ServerGeminiEventType.ToolCallRequest,
        value: { callId: '1', name: 'test_tool', args: {} },
      };
    })();
    mockSendMessageStream.mockReturnValue(mockStream);

    await act(async () => {
      await result.current.submitQuery('test input');
    });

    // Expectation: addItem:gemini (rationale) MUST happen before scheduleToolCalls_START
    const rationaleIndex = addItemOrder.indexOf('addItem:gemini');
    const scheduleIndex = addItemOrder.indexOf('scheduleToolCalls_START');
    const toolGroupIndex = addItemOrder.indexOf('addItem:tool_group');

    expect(rationaleIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(toolGroupIndex).toBeGreaterThan(-1);

    // This is the core fix validation: Rationale comes before tools are even scheduled (awaited)
    expect(rationaleIndex).toBeLessThan(scheduleIndex);
    expect(rationaleIndex).toBeLessThan(toolGroupIndex);
  });

  it('should process @include commands, adding user turn after processing to prevent race conditions', async () => {
    const rawQuery = '@include file.txt Summarize this.';
    const processedQueryParts = [
      { text: 'Summarize this with content from @file.txt' },
      { text: 'File content...' },
    ];
    const userMessageTimestamp = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(userMessageTimestamp);

    handleAtCommandSpy.mockResolvedValue({
      processedQuery: processedQueryParts,
      shouldProceed: true,
    });

    const { result } = renderHookWithProviders(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false, // shellModeActive
        vi.fn(), // getPreferredEditor
        vi.fn(), // onAuthError
        vi.fn(), // performMemoryRefresh
        false, // modelSwitched
        vi.fn(), // setModelSwitched
        vi.fn(), // onCancelSubmit
        vi.fn(), // setShellInputFocused
        80, // terminalWidth
        24, // terminalHeight
      ),
    );

    await act(async () => {
      await result.current.submitQuery(rawQuery);
    });

    expect(handleAtCommandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: rawQuery,
      }),
    );

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: MessageType.USER,
        text: rawQuery,
      },
      userMessageTimestamp,
    );

    // FIX: The expectation now matches the actual call signature.
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      processedQueryParts, // Argument 1: The parts array directly
      expect.any(AbortSignal), // Argument 2: An AbortSignal
      expect.any(String), // Argument 3: The prompt_id string
      undefined,
      false,
      rawQuery,
    );
  });

  it('should display user query, then tool execution, then model response', async () => {
    const userQuery = 'read this @file(test.txt)';
    const toolExecutionMessage = 'Reading file: test.txt';
    const modelResponseContent = 'The content of test.txt is: Hello World!';

    // Mock handleAtCommand to simulate a tool call and add a tool_group message
    handleAtCommandSpy.mockImplementation(
      async ({ addItem: atCommandAddItem, messageId }) => {
        atCommandAddItem(
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'client-read-123',
                name: 'read_file',
                description: toolExecutionMessage,
                status: CoreToolCallStatus.Success,
                resultDisplay: toolExecutionMessage,
                confirmationDetails: undefined,
              },
            ],
          },
          messageId,
        );
        return { shouldProceed: true, processedQuery: userQuery };
      },
    );

    // Mock the Gemini stream to return a model response after the tool
    mockSendMessageStream.mockReturnValue(
      (async function* () {
        yield {
          type: ServerGeminiEventType.Content,
          value: modelResponseContent,
        };
        yield {
          type: ServerGeminiEventType.Finished,
          value: { reason: 'STOP' },
        };
      })(),
    );

    const { result } = renderTestHook();

    await act(async () => {
      await result.current.submitQuery(userQuery);
    });

    // Assert the order of messages added to the history
    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledTimes(3); // User prompt + tool execution + model response

      // 1. User's prompt
      expect(mockAddItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: MessageType.USER,
          text: userQuery,
        }),
        expect.any(Number),
      );

      // 2. Tool execution message
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'tool_group',
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'read_file',
              status: CoreToolCallStatus.Success,
            }),
          ]),
        }),
        expect.any(Number),
      );

      // 3. Model's response
      expect(mockAddItem).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          type: 'gemini',
          text: modelResponseContent,
        }),
        expect.any(Number),
      );
    });
  });
  describe('Thought Reset', () => {
    it('should keep full thinking entries in history when mode is full', async () => {
      const fullThinkingSettings: LoadedSettings = {
        ...mockLoadedSettings,
        merged: {
          ...mockLoadedSettings.merged,
          ui: { inlineThinkingMode: 'full' },
        },
      } as unknown as LoadedSettings;

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: {
              subject: 'Full thought',
              description: 'Detailed thinking',
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Response',
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          fullThinkingSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'thinking',
          thought: expect.objectContaining({ subject: 'Full thought' }),
        }),
        expect.any(Number),
      );
    });

    it('keeps thought transient and clears it on first non-thought event', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: {
              subject: 'Assessing intent',
              description: 'Inspecting context',
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Model response content',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'STOP', usageMetadata: undefined },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gemini',
            text: 'Model response content',
          }),
          expect.any(Number),
        );
      });

      expect(result.current.thought).toBeNull();
      expect(mockAddItem).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'thinking' }),
        expect.any(Number),
      );
    });

    it('should reset thought to null when starting a new prompt', async () => {
      // First, simulate a response with a thought
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: {
              subject: 'Previous thought',
              description: 'Old description',
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Some response content',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'STOP', usageMetadata: undefined },
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Submit first query to set a thought
      await act(async () => {
        await result.current.submitQuery('First query');
      });

      // Wait for the first response to complete
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gemini',
            text: 'Some response content',
          }),
          expect.any(Number),
        );
      });

      // Now simulate a new response without a thought
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'New response content',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'STOP', usageMetadata: undefined },
          };
        })(),
      );

      // Submit second query - thought should be reset
      await act(async () => {
        await result.current.submitQuery('Second query');
      });

      // The thought should be reset to null when starting the new prompt
      // We can verify this by checking that the LoadingIndicator would not show the previous thought
      // The actual thought state is internal to the hook, but we can verify the behavior
      // by ensuring the second response doesn't show the previous thought
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gemini',
            text: 'New response content',
          }),
          expect.any(Number),
        );
      });
    });

    it('should memoize pendingHistoryItems', () => {
      mockUseToolScheduler.mockReturnValue([
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ]);

      const { result, rerender } = renderHookWithProviders(() =>
        useGeminiStream(
          mockConfig.getGeminiClient(),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      const firstResult = result.current.pendingHistoryItems;
      rerender();
      const secondResult = result.current.pendingHistoryItems;

      expect(firstResult).toStrictEqual(secondResult);

      const newToolCalls: TrackedToolCall[] = [
        {
          request: { callId: 'call1', name: 'tool1', args: {} },
          status: CoreToolCallStatus.Executing,
          tool: {
            name: 'tool1',
            displayName: 'tool1',
            description: 'desc1',
            build: vi.fn(),
          },
          invocation: {
            getDescription: () => 'Mock description',
          },
        } as unknown as TrackedExecutingToolCall,
      ];

      mockUseToolScheduler.mockReturnValue([
        newToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        vi.fn(),
        mockCancelAllToolCalls,
        0,
      ]);

      rerender();
      const thirdResult = result.current.pendingHistoryItems;

      expect(thirdResult).not.toStrictEqual(secondResult);
    });

    it('should reset thought to null when user cancels', async () => {
      // Mock a stream that yields a thought then gets cancelled
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Some thought', description: 'Description' },
          };
          yield { type: ServerGeminiEventType.UserCancelled };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      // Verify cancellation message was added
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'info',
            text: 'User cancelled the request.',
          }),
          expect.any(Number),
        );
      });

      // Verify state is reset to idle
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('should reset thought to null when there is an error', async () => {
      // Mock a stream that yields a thought then encounters an error
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Some thought', description: 'Description' },
          };
          yield {
            type: ServerGeminiEventType.Error,
            value: { error: { message: 'Test error' } },
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      // Verify error message was added
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CoreToolCallStatus.Error,
          }),
          expect.any(Number),
        );
      });

      // Verify parseAndFormatApiError was called
      expect(mockParseAndFormatApiError).toHaveBeenCalledWith(
        { message: 'Test error' },
        expect.any(String),
        undefined,
        'gemini-2.5-pro',
        'gemini-2.5-flash',
      );
    });

    it('should update lastOutputTime on Gemini thought and content events', async () => {
      vi.useFakeTimers();
      const startTime = 1000000;
      vi.setSystemTime(startTime);

      // Mock a stream that yields a thought then content
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking...', description: '' },
          };
          // Advance time for the next event
          vi.advanceTimersByTime(1000);
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Hello',
          };
        })(),
      );

      const { result } = renderHookWithProviders(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockConfig,
          mockLoadedSettings,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
          () => {},
          () => {},
          80,
          24,
        ),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      // Verify lastOutputTime was updated
      // It should be the time of the last event (startTime + 1000)
      expect(result.current.lastOutputTime).toBe(startTime + 1000);

      vi.useRealTimers();
    });
  });

  describe('Loop Detection Confirmation', () => {
    beforeEach(() => {
      // Add mock for getLoopDetectionService to the config
      const mockLoopDetectionService = {
        disableForSession: vi.fn(),
      };
      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        ...new MockedGeminiClientClass(mockConfig),
        getLoopDetectionService: () => mockLoopDetectionService,
      });
    });

    it('should set loopDetectionConfirmationRequest when LoopDetected event is received', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Some content',
          };
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
        expect(
          typeof result.current.loopDetectionConfirmationRequest?.onComplete,
        ).toBe('function');
      });
    });

    it('should disable loop detection and show message when user selects "disable"', async () => {
      const mockLoopDetectionService = {
        disableForSession: vi.fn(),
      };
      const mockClient = {
        ...new MockedGeminiClientClass(mockConfig),
        getLoopDetectionService: () => mockLoopDetectionService,
      };
      mockConfig.getGeminiClient = vi.fn().mockReturnValue(mockClient);

      // Mock for the initial request
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      // Mock for the retry request
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Retry successful',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'STOP' },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Wait for confirmation request to be set
      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
      });

      // Simulate user selecting "disable"
      await act(async () => {
        result.current.loopDetectionConfirmationRequest?.onComplete({
          userSelection: 'disable',
        });
      });

      // Verify loop detection was disabled
      expect(mockLoopDetectionService.disableForSession).toHaveBeenCalledTimes(
        1,
      );

      // Verify confirmation request was cleared
      expect(result.current.loopDetectionConfirmationRequest).toBeNull();

      // Verify appropriate message was added
      expect(mockAddItem).toHaveBeenCalledWith({
        type: 'info',
        text: 'Loop detection has been disabled for this session. Retrying request...',
      });

      // Verify that the request was retried
      await waitFor(() => {
        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
        expect(mockSendMessageStream).toHaveBeenNthCalledWith(
          2,
          'test query',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          'test query',
        );
      });
    });

    it('should keep loop detection enabled and show message when user selects "keep"', async () => {
      const mockLoopDetectionService = {
        disableForSession: vi.fn(),
      };
      const mockClient = {
        ...new MockedGeminiClientClass(mockConfig),
        getLoopDetectionService: () => mockLoopDetectionService,
      };
      mockConfig.getGeminiClient = vi.fn().mockReturnValue(mockClient);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Wait for confirmation request to be set
      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
      });

      // Simulate user selecting "keep"
      await act(async () => {
        result.current.loopDetectionConfirmationRequest?.onComplete({
          userSelection: 'keep',
        });
      });

      // Verify loop detection was NOT disabled
      expect(mockLoopDetectionService.disableForSession).not.toHaveBeenCalled();

      // Verify confirmation request was cleared
      expect(result.current.loopDetectionConfirmationRequest).toBeNull();

      // Verify appropriate message was added
      expect(mockAddItem).toHaveBeenCalledWith({
        type: 'info',
        text: 'A potential loop was detected. This can happen due to repetitive tool calls or other model behavior. The request has been halted.',
      });

      // Verify that the request was NOT retried
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple loop detection events properly', async () => {
      const { result } = renderTestHook();

      // First loop detection - set up fresh mock for first call
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      // First loop detection
      await act(async () => {
        await result.current.submitQuery('first query');
      });

      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
      });

      // Simulate user selecting "keep" for first request
      await act(async () => {
        result.current.loopDetectionConfirmationRequest?.onComplete({
          userSelection: 'keep',
        });
      });

      expect(result.current.loopDetectionConfirmationRequest).toBeNull();

      // Verify first message was added
      expect(mockAddItem).toHaveBeenCalledWith({
        type: 'info',
        text: 'A potential loop was detected. This can happen due to repetitive tool calls or other model behavior. The request has been halted.',
      });

      // Second loop detection - set up fresh mock for second call
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      // Mock for the retry request
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Retry successful',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: { reason: 'STOP' },
          };
        })(),
      );

      // Second loop detection
      await act(async () => {
        await result.current.submitQuery('second query');
      });

      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
      });

      // Simulate user selecting "disable" for second request
      await act(async () => {
        result.current.loopDetectionConfirmationRequest?.onComplete({
          userSelection: 'disable',
        });
      });

      expect(result.current.loopDetectionConfirmationRequest).toBeNull();

      // Verify second message was added
      expect(mockAddItem).toHaveBeenCalledWith({
        type: 'info',
        text: 'Loop detection has been disabled for this session. Retrying request...',
      });

      // Verify that the request was retried
      await waitFor(() => {
        expect(mockSendMessageStream).toHaveBeenCalledTimes(3); // 1st query, 2nd query, retry of 2nd query
        expect(mockSendMessageStream).toHaveBeenNthCalledWith(
          3,
          'second query',
          expect.any(AbortSignal),
          expect.any(String),
          undefined,
          false,
          'second query',
        );
      });
    });

    it('should process LoopDetected event after moving pending history to history', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Some response content',
          };
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Verify that the content was added to history before the loop detection dialog
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gemini',
            text: 'Some response content',
          }),
          expect.any(Number),
        );
      });

      // Then verify loop detection confirmation request was set
      await waitFor(() => {
        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
      });
    });
  });

  describe('Agent Execution Events', () => {
    it('should handle AgentExecutionStopped event with systemMessage', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionStopped,
            value: {
              reason: 'hook-reason',
              systemMessage: 'Custom stop message',
            },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test stop');
      });

      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Agent execution stopped: Custom stop message',
          },
          expect.any(Number),
        );
        expect(result.current.streamingState).toBe(StreamingState.Idle);
      });
    });

    it('should handle AgentExecutionStopped event by falling back to reason when systemMessage is missing', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionStopped,
            value: { reason: 'Stopped by hook' },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test stop');
      });

      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Agent execution stopped: Stopped by hook',
          },
          expect.any(Number),
        );
        expect(result.current.streamingState).toBe(StreamingState.Idle);
      });
    });

    it('should handle AgentExecutionBlocked event with systemMessage', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionBlocked,
            value: {
              reason: 'hook-reason',
              systemMessage: 'Custom block message',
            },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test block');
      });

      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.WARNING,
            text: 'Agent execution blocked: Custom block message',
          },
          expect.any(Number),
        );
      });
    });

    it('should handle AgentExecutionBlocked event by falling back to reason when systemMessage is missing', async () => {
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionBlocked,
            value: { reason: 'Blocked by hook' },
          };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('test block');
      });

      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.WARNING,
            text: 'Agent execution blocked: Blocked by hook',
          },
          expect.any(Number),
        );
      });
    });
  });

  describe('Stream Splitting', () => {
    it('should not add empty history item when splitting message results in empty or whitespace-only beforeText', async () => {
      // Mock split point to always be 0, causing beforeText to be empty
      vi.mocked(findLastSafeSplitPoint).mockReturnValue(0);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: 'test content' };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('user query');
      });

      await waitFor(() => {
        // We expect the stream to be processed.
        // Since beforeText is empty (0 split), addItem should NOT be called for it.
        // addItem IS called for the user query "user query".
      });

      // Check addItem calls.
      // It should be called for user query and for the content.
      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'user', text: 'user query' }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'gemini_content',
          text: 'test content',
        }),
        expect.any(Number),
      );

      // Verify that pendingHistoryItem is empty after (afterText).
      expect(result.current.pendingHistoryItems.length).toEqual(0);

      // Reset mock
      vi.mocked(findLastSafeSplitPoint).mockReset();
      vi.mocked(findLastSafeSplitPoint).mockImplementation(
        (s: string) => s.length,
      );
    });

    it('should add whitespace-only history item when splitting message', async () => {
      // Input: "   content"
      // Split at 3 -> before: "   ", after: "content"
      vi.mocked(findLastSafeSplitPoint).mockReturnValue(3);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: '   content' };
        })(),
      );

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('user query');
      });

      await waitFor(() => {});

      expect(mockAddItem).toHaveBeenCalledTimes(3);
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'user', text: 'user query' }),
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'gemini_content',
          text: 'content',
        }),
        expect.any(Number),
      );

      expect(result.current.pendingHistoryItems.length).toEqual(0);
    });
  });
});
