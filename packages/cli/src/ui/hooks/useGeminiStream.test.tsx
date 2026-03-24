/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: Refactor to remove any usage */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { act } from 'react';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useGeminiStream } from './useGeminiStream.js';
import { useKeypress } from './useKeypress.js';
import * as atCommandProcessor from './atCommandProcessor.js';
import {
  useToolScheduler,
  type TrackedToolCall,
  type TrackedCompletedToolCall,
  type TrackedExecutingToolCall,
  type TrackedCancelledToolCall,
  type TrackedWaitingToolCall,
} from './useToolScheduler.js';
import type { UIState } from '../contexts/UIStateContext.js';
import {
  ApprovalMode,
  AuthType,
  GeminiEventType as ServerGeminiEventType,
  ToolErrorType,
  ToolConfirmationOutcome,
  MessageBusType,
  tokenLimit,
  debugLogger,
  runInDevTraceSpan,
  coreEvents,
  CoreEvent,
  MCPDiscoveryState,
  GeminiCliOperation,
  getPlanModeExitMessage,
  CompressionStatus,
  Kind,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import type {
  Config,
  EditorType,
  GeminiClient,
  ServerGeminiChatCompressedEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiFinishedEvent,
  ServerGeminiStreamEvent as GeminiEvent,
  ThoughtSummary,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  GeminiErrorEventValue,
  RetryAttemptPayload,
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
  vi.fn().mockImplementation((config: Config) => {
    return {
      sendMessageStream: mockSendMessageStream,
      startChat: mockStartChat,
      addHistory: vi.fn(),
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: 'Got it. Focusing on tests only.' }] } },
        ],
      }),
      getChat: vi.fn().mockReturnValue({
        recordCompletedToolCalls: vi.fn(),
      }),
      getChatRecordingService: vi.fn().mockReturnValue({
        recordThought: vi.fn(),
        initialize: vi.fn(),
        recordMessage: vi.fn(),
        recordMessageTokens: vi.fn(),
        recordToolCalls: vi.fn(),
        getConversationFile: vi.fn(),
      }),
      getCurrentSequenceModel: vi
        .fn()
        .mockReturnValue('gemini-2.0-flash-exp'),
    };
  }),
);

const MockedUserPromptEvent = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {}),
);
const mockParseAndFormatApiError = vi.hoisted(() => vi.fn());
const mockIsBackgroundExecutionData = vi.hoisted(
  () =>
    (data: unknown): data is { pid?: number } => {
      if (typeof data !== 'object' || data === null) {
        return false;
      }
      return 'pid' in data;
    },
);

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actualCoreModule = (await importOriginal()) as any;
  return {
    ...actualCoreModule,
    isBackgroundExecutionData: mockIsBackgroundExecutionData,
    GitService: vi.fn(),
    GeminiClient: MockedGeminiClientClass,
    UserPromptEvent: MockedUserPromptEvent,
    parseAndFormatApiError: mockParseAndFormatApiError,
    tokenLimit: vi.fn().mockReturnValue(100), // Mock tokenLimit
    recordToolCallInteractions: vi.fn().mockResolvedValue(undefined),
    getCodeAssistServer: vi.fn().mockReturnValue(undefined),
    runInDevTraceSpan: vi.fn().mockImplementation((_opts, cb) =>
      cb({
        metadata: {},
      }),
    ),
  };
});

const mockUseToolScheduler = useToolScheduler as Mock;
vi.mock('./useToolScheduler.js', async (importOriginal) => {
  const actualSchedulerModule = (await importOriginal()) as any;
  return {
    ...actualSchedulerModule,
    useToolScheduler: vi.fn(),
  };
});

vi.mock('./useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('./atCommandProcessor.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    handleAtCommand: vi.fn(),
  };
});

vi.mock('./useShellCommandProcessor.js', () => ({
  useShellCommandProcessor: vi.fn(() => ({
    handleShellCommand: vi.fn(),
    activeShellPtyId: null,
    lastShellOutputTime: 0,
    backgroundShellCount: 0,
    isBackgroundShellVisible: false,
    toggleBackgroundShell: vi.fn(),
    backgroundCurrentShell: null,
    registerBackgroundShell: vi.fn(),
    dismissBackgroundShell: vi.fn(),
    backgroundShells: new Map(),
  })),
}));

vi.mock('../utils/markdownUtilities.js', () => ({
  findLastSafeSplitPoint: vi.fn((s: string) => s.length),
}));

vi.mock('./useStateAndRef.js', () => ({
  useStateAndRef: vi.fn((initial) => {
    let val = initial;
    const ref = { current: val };
    const setVal = vi.fn((updater) => {
      val = typeof updater === 'function' ? updater(val) : updater;
      ref.current = val;
    });
    return [val, ref, setVal];
  }),
}));

const mockLoadedSettings = {
  merged: {
    ui: {
      loadingPhrases: 'tips',
      showModelInfoInChat: true,
      errorVerbosity: 'full',
    },
  },
} as unknown as LoadedSettings;

describe('useGeminiStream', () => {
  let mockAddItem = vi.fn();
  let mockOnDebugMessage = vi.fn();
  let mockHandleSlashCommand = vi.fn().mockResolvedValue(false);
  let mockScheduleToolCalls: Mock;
  let mockCancelAllToolCalls: Mock;
  let mockMarkToolsAsSubmitted: Mock;
  let capturedOnComplete: (tools: TrackedToolCall[]) => Promise<void>;

  const mockConfig = {
    storage: {},
    getSessionId: vi.fn(() => 'test-session'),
    getProjectRoot: vi.fn(() => '/test/root'),
    setQuotaErrorOccurred: vi.fn(),
    resetBillingTurnState: vi.fn(),
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
    getGeminiClient: () => new MockedGeminiClientClass({} as any),
    getIdeMode: vi.fn(() => false),
    getEnableHooks: vi.fn(() => false),
    getShowContextWindowWarning: vi.fn(() => false),
    getShowContextCompression: vi.fn(() => false),
    getContextWindowCompressionThreshold: vi.fn(() => 0.2),
    getCheckpointingEnabled: vi.fn(() => false),
    getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  } as unknown as Config;

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      vi.fn(),
      mockCancelAllToolCalls,
      0,
    ]);
  });

  const renderTestHook = async (
    initialToolCalls: TrackedToolCall[] = [],
    geminiClient?: GeminiClient,
    loadedSettings: LoadedSettings = mockLoadedSettings,
  ) => {
    const client = geminiClient || mockConfig.getGeminiClient();
    const emptyHistory: any[] = [];
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
      loadedSettings,
      toolCalls: initialToolCalls,
    };

    const rerenderRef = {
      current: (_props?: typeof initialProps): any => {
        throw new Error('rerender called before initialization');
      },
    };

    mockUseToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        lastToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
        (
          updater:
            | TrackedToolCall[]
            | ((prev: TrackedToolCall[]) => TrackedToolCall[]),
        ) => {
          lastToolCalls =
            typeof updater === 'function' ? updater(lastToolCalls) : updater;
          rerenderRef.current({
            client: initialProps.client,
            history: initialProps.history,
            addItem: initialProps.addItem,
            config: initialProps.config,
            onDebugMessage: initialProps.onDebugMessage,
            handleSlashCommand: initialProps.handleSlashCommand,
            shellModeActive: initialProps.shellModeActive,
            loadedSettings: initialProps.loadedSettings,
            toolCalls: lastToolCalls,
          });
        },
        (signal: AbortSignal) => {
          mockCancelAllToolCalls(signal);
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
          rerenderRef.current({
            client: initialProps.client,
            history: initialProps.history,
            addItem: initialProps.addItem,
            config: initialProps.config,
            onDebugMessage: initialProps.onDebugMessage,
            handleSlashCommand: initialProps.handleSlashCommand,
            shellModeActive: initialProps.shellModeActive,
            loadedSettings: initialProps.loadedSettings,
            toolCalls: lastToolCalls,
          });
        },
        0,
      ];
    });

    const { result, rerender } = await renderHookWithProviders(
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
          vi.fn(() => 'vscode' as EditorType),
          vi.fn(),
          vi.fn(() => Promise.resolve()),
          false,
          vi.fn(),
          vi.fn(),
          vi.fn(),
          80,
          24,
        ),
      {
        initialProps,
      },
    );
    rerenderRef.current = rerender;

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
    } as unknown as any,
    correlationId: `corr-${callId}`,
  });

  // Helper to render hook with default parameters - reduces boilerplate
  const renderHookWithDefaults = async (
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

    return await renderHookWithProviders(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockConfig,
        mockLoadedSettings,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        shellModeActive,
        vi.fn(() => 'vscode' as EditorType),
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

  it('should not submit tool responses if not all tool calls are completed', async () => {
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
          errorType: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          displayName: 'tool1',
          description: 'desc1',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => 'Mock description',
        } as any,
        startTime: Date.now(),
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        status: CoreToolCallStatus.Executing,
        tool: {
          name: 'tool2',
          displayName: 'tool2',
          description: 'desc2',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => 'Mock description',
        } as any,
        startTime: Date.now(),
      } as TrackedExecutingToolCall,
    ];

    const { mockMarkToolsAsSubmitted, mockSendMessageStream } =
      await renderTestHook(toolCalls);

    // Call handleCompletedTools with the toolCalls
    await act(async () => {
      await capturedOnComplete(toolCalls);
    });

    // Verification
    expect(mockMarkToolsAsSubmitted).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  it('should submit tool responses when all tool calls are completed and ready', async () => {
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
          errorType: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          displayName: 'tool1',
          description: 'desc1',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => 'Mock description',
        } as any,
        startTime: Date.now(),
      } as TrackedCompletedToolCall,
    ];

    const { mockMarkToolsAsSubmitted, mockSendMessageStream } =
      await renderTestHook(toolCalls);

    // Call handleCompletedTools with the toolCalls
    await act(async () => {
      await capturedOnComplete(toolCalls);
    });

    // Verification
    expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith(['call1']);
    expect(mockSendMessageStream).toHaveBeenCalled();
  });

  it('should only submit terminal responses', async () => {
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
          errorType: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          displayName: 'tool1',
          description: 'desc1',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => 'Mock description',
        } as any,
        startTime: Date.now(),
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        },
        status: CoreToolCallStatus.AwaitingApproval,
        tool: {
          name: 'tool2',
          displayName: 'tool2',
          description: 'desc2',
          build: vi.fn(),
        } as any,
        invocation: {
          getDescription: () => 'Mock description',
        } as any,
      } as TrackedWaitingToolCall,
    ];

    const { mockMarkToolsAsSubmitted, mockSendMessageStream } =
      await renderTestHook(toolCalls);

    // Call handleCompletedTools with the toolCalls
    await act(async () => {
      await capturedOnComplete(toolCalls);
    });

    // Verification: Tool 2 is not terminal, so we should not submit.
    expect(mockMarkToolsAsSubmitted).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled();
  });

  it('should expose activePtyId for non-shell executing tools that report an execution ID', async () => {
    const executingTool: TrackedExecutingToolCall = {
      request: {
        callId: 'call1',
        name: 'tool1',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
      status: CoreToolCallStatus.Executing,
      pid: 1234,
      startTime: Date.now(),
    };

    const { result } = await renderTestHook([executingTool]);

    expect(result.current.activePtyId).toBe(1234);
  });

  describe('handleApprovalModeChange', () => {
    it('should auto-approve pending tool calls when switching to YOLO mode', async () => {
      const awaitingApprovalToolCalls: TrackedToolCall[] = [
        createMockToolCall('replace', 'call1', 'edit'),
        createMockToolCall('write_file', 'call2', 'edit'),
        // Tool that should NOT be auto-approved even in YOLO (forcedAsk)
        {
          ...createMockToolCall('delete_file', 'call3', 'info'),
          request: {
            callId: 'call3',
            name: 'delete_file',
            args: {},
            isClientInitiated: false,
            forcedAsk: true,
            prompt_id: 'prompt-id-1',
          },
        },
      ];

      const { result } = await renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // All non-forcedAsk tools should be auto-approved
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

      const { result } = await renderTestHook(awaitingApprovalToolCalls);

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
      ];

      const { result } = await renderTestHook(awaitingApprovalToolCalls);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // Should have attempted to publish
      expect(mockMessageBus.publish).toHaveBeenCalled();
      // Should have logged the warning
      expect(debuggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-approve tool call'),
        expect.any(Error),
      );
    });

    it('should skip tool calls without correlationId', async () => {
      const callWithoutId = createMockToolCall('replace', 'call1', 'edit');
      delete callWithoutId.correlationId;

      const { result } = await renderTestHook([callWithoutId]);

      // Should not throw an error
      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });
    });

    it('should only process tool calls with awaiting_approval status', async () => {
      const executingTool = createMockToolCall(
        'replace',
        'call1',
        'edit',
        CoreToolCallStatus.Executing as any,
      );

      const { result } = await renderTestHook([executingTool]);

      await act(async () => {
        await result.current.handleApprovalModeChange(ApprovalMode.YOLO);
      });

      // Should not attempt to approve executing tools
      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should inject a notification message when manually exiting Plan Mode', async () => {
      const client = new MockedGeminiClientClass(mockConfig);
      // Mock previous mode as PLAN
      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.PLAN,
      );

      const { result } = await renderTestHook([], client);

      await act(async () => {
        // Trigger manual exit from Plan Mode
        await result.current.handleApprovalModeChange(ApprovalMode.DEFAULT);
      });

      // Should have added history to the model
      expect(client.addHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          parts: [expect.objectContaining({ text: expect.any(String) })],
        }),
      );
    });
  });

  describe('handleFinishedEvent', () => {
    it('should add info message for MAX_TOKENS finish reason', async () => {
      // Setup mock to return a stream with Finished event
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Finished,
            value: {
              reason: FinishReason.MAX_TOKENS,
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 20,
                totalTokenCount: 30,
              },
            },
          };
        })(),
      );

      const { result } = await renderHookWithDefaults();

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Generate long text');
      });

      // Verification
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: expect.stringContaining('Response truncated'),
        }),
        expect.any(Number),
      );
    });

    describe('ContextWindowWillOverflow event', () => {
      it.each([
        {
          name: 'NOT add a message when showContextWindowWarning is false',
          requestTokens: 20,
          remainingTokens: 80,
          shouldShow: false,
        },
        {
          name: 'add a message when showContextWindowWarning is true',
          requestTokens: 30,
          remainingTokens: 70,
          shouldShow: true,
          expectedMessage:
            'Context 30% full. Message may exceed window. Reduce size or /compress.',
        },
      ])(
        'should $name',
        async ({
          requestTokens,
          remainingTokens,
          shouldShow,
          expectedMessage,
        }) => {
          vi.mocked(mockConfig.getShowContextWindowWarning).mockReturnValue(
            shouldShow,
          );
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

          const { result } = await renderHookWithDefaults();

          await act(async () => {
            await result.current.submitQuery('Test overflow');
          });

          await waitFor(() => {
            if (shouldShow) {
              expect(mockAddItem).toHaveBeenCalledWith({
                type: 'info',
                text: expectedMessage,
              });
            } else {
              expect(mockAddItem).not.toHaveBeenCalledWith(
                expect.objectContaining({
                  type: 'info',
                }),
              );
            }
          });
        },
      );
    });

    it('should call onCancelSubmit when ContextWindowWillOverflow event is received', async () => {
      const onCancelSubmitSpy = vi.fn();
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

      const { result } = await renderHookWithDefaults({
        onCancelSubmit: onCancelSubmitSpy,
      });

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test overflow');
      });

      // Verification
      expect(onCancelSubmitSpy).toHaveBeenCalledWith(true);
    });

    it('should add informational messages when ChatCompressed event is received and showContextCompression is true', async () => {
      vi.mocked(tokenLimit).mockReturnValue(10000);
      vi.mocked(
        mockConfig.getContextWindowCompressionThreshold,
      ).mockReturnValue(0.2);
      vi.mocked(mockConfig.getShowContextCompression).mockReturnValue(true);
      // Setup mock to return a stream with ChatCompressed event
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.ChatCompressed,
            value: {
              originalTokenCount: 1000,
              newTokenCount: 500,
              compressionStatus: CompressionStatus.COMPRESSED,
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Response after compression',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: {
              finishReason: 'STOP',
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 20,
                totalTokenCount: 30,
              },
            },
          };
        })(),
      );

      const { result } = await renderHookWithDefaults();

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test compression');
      });

      // Check that the succinct info message was added
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'compression',
            compression: {
              isPending: false,
              beforePercentage: 10,
              afterPercentage: 5,
              compressionStatus: CompressionStatus.COMPRESSED,
              isManual: false,
              thresholdPercentage: 20,
            },
          }),
          expect.any(Number),
        );
      });
    });

    it('should NOT add informational messages when ChatCompressed event is received and showContextCompression is false', async () => {
      vi.mocked(tokenLimit).mockReturnValue(10000);
      vi.mocked(
        mockConfig.getContextWindowCompressionThreshold,
      ).mockReturnValue(0.2);
      vi.mocked(mockConfig.getShowContextCompression).mockReturnValue(false);
      // Setup mock to return a stream with ChatCompressed event
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.ChatCompressed,
            value: {
              originalTokenCount: 1000,
              newTokenCount: 500,
              compressionStatus: CompressionStatus.COMPRESSED,
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Response after compression',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: {
              finishReason: 'STOP',
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 20,
                totalTokenCount: 30,
              },
            },
          };
        })(),
      );

      const { result } = await renderHookWithDefaults();

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test compression');
      });

      // Check that NO compression message was added
      await waitFor(() => {
        expect(mockAddItem).not.toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'compression',
          }),
        );
      });
    });

    it('should add informational messages when ChatCompressed event is received with a large prompt even if showContextCompression is false', async () => {
      vi.mocked(tokenLimit).mockReturnValue(10000);
      vi.mocked(
        mockConfig.getContextWindowCompressionThreshold,
      ).mockReturnValue(0.2); // 20%
      vi.mocked(mockConfig.getShowContextCompression).mockReturnValue(false);

      // Setup mock to return a stream with ChatCompressed event and a large requestTokenCount (25%)
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.ChatCompressed,
            value: {
              originalTokenCount: 1000,
              newTokenCount: 500,
              compressionStatus: CompressionStatus.COMPRESSED,
              requestTokenCount: 2500, // 25% > 20%
            },
          };
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Response after compression',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: {
              finishReason: 'STOP',
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 20,
                totalTokenCount: 30,
              },
            },
          };
        })(),
      );

      const { result } = await renderHookWithDefaults();

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test large prompt compression');
      });

      // Check that compression message WAS added despite the setting
      await waitFor(() => {
        expect(mockAddItem).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'compression',
            compression: {
              isPending: false,
              beforePercentage: 10,
              afterPercentage: 5,
              compressionStatus: CompressionStatus.COMPRESSED,
              isManual: false,
              thresholdPercentage: 20,
            },
          }),
          expect.any(Number),
        );
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
      async ({ reason, message, shouldAddMessage = true }) => {
        mockSendMessageStream.mockReturnValue(
          (async function* () {
            yield {
              type: ServerGeminiEventType.Finished,
              value: {
                reason: reason as FinishReason,
                usageMetadata: {
                  promptTokenCount: 10,
                  candidatesTokenCount: 20,
                  totalTokenCount: 30,
                },
              },
            };
          })(),
        );

        const { result } = await renderHookWithDefaults();

        await act(async () => {
          await result.current.submitQuery(`Test ${reason}`);
        });

        if (shouldAddMessage) {
          expect(mockAddItem).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'info',
              text: message,
            }),
            expect.any(Number),
          );
        } else {
          expect(mockAddItem).not.toHaveBeenCalled();
        }
      },
    );
  });

  it('should flush pending text rationale before scheduling tool calls to ensure correct history order', async () => {
    // Setup stream yielding rationale content then tool calls
    mockSendMessageStream.mockReturnValue(
      (async function* () {
        yield { type: ServerGeminiEventType.Content, value: ' rationale' };
        yield {
          type: ServerGeminiEventType.ToolCallRequest,
          value: {
            callId: 'call1',
            name: 'tool1',
            args: {},
            prompt_id: 'prompt-id-1',
          },
        };
      })(),
    );

    const { result } = await renderTestHook();

    await act(async () => {
      await result.current.submitQuery('test input');
    });

    // Rationale text should be flushed before tool call scheduling
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gemini',
        text: ' rationale',
      }),
      expect.any(Number),
    );
    expect(mockScheduleToolCalls).toHaveBeenCalledWith(
      [expect.objectContaining({ callId: 'call1' })],
      expect.any(AbortSignal),
    );
  });

  it('should process @include commands, adding user turn after processing to prevent race conditions', async () => {
    const rawQuery = '@include file.txt';
    const processedQuery = 'content of file.txt';

    (atCommandProcessor.handleAtCommand as Mock).mockResolvedValue({
      processedQuery,
    });

    const { result } = await renderTestHook();

    await act(async () => {
      await result.current.submitQuery(rawQuery);
    });

    // Should add user turn with the raw command
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: MessageType.USER, text: rawQuery },
      expect.any(Number),
    );

    // Should call model with processed query
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      processedQuery,
      expect.any(AbortSignal),
      expect.any(String),
      undefined,
      false,
      rawQuery,
    );
  });

  it('should display user query, then tool execution, then model response', async () => {
    const userQuery = 'run tool and respond';
    const toolCall: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'tool1',
      args: {},
      prompt_id: 'p1',
    };

    mockSendMessageStream.mockReturnValueOnce(
      (async function* () {
        yield { type: ServerGeminiEventType.ToolCallRequest, value: toolCall };
      })(),
    );

    const { result } = await renderTestHook();

    await act(async () => {
      await result.current.submitQuery(userQuery);
    });

    // 1. User turn shown first
    expect(mockAddItem).toHaveBeenNthCalledWith(
      1,
      { type: MessageType.USER, text: userQuery },
      expect.any(Number),
    );

    // 2. Tool calls scheduled
    expect(mockScheduleToolCalls).toHaveBeenCalledWith(
      [toolCall],
      expect.any(AbortSignal),
    );
  });

  describe('Thought Reset', () => {
    it('should keep full thinking entries in history when mode is full', async () => {
      const settings = {
        merged: {
          ...mockLoadedSettings.merged,
          ui: { ...mockLoadedSettings.merged.ui, inlineThinkingMode: 'full' },
        },
      } as unknown as LoadedSettings;

      const { result } = await renderTestHook([], undefined, settings);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking', description: 'Working...' },
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'thinking',
          thought: { subject: 'Thinking', description: 'Working...' },
        }),
      );
    });

    it('keeps thought transient and clears it on first non-thought event', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking', description: '...' },
          };
          yield { type: ServerGeminiEventType.Content, value: ' response' };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      // Transient state update should have happened, then cleared
      expect(result.current.thought).toBeNull();
    });

    it('should reset thought to null when starting a new prompt', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'First', description: '...' },
          };
        })(),
      );

      // Submit first query to set a thought
      await act(async () => {
        await result.current.submitQuery('First query');
      });

      expect(result.current.thought).toEqual({
        subject: 'First',
        description: '...',
      });

      // Setup second stream that doesn't yield a thought immediately
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: 'Second' };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('Second query');
      });

      expect(result.current.thought).toBeNull();
    });

    it('should memoize pendingHistoryItems', async () => {
      const { result, rerender } = await renderTestHook();

      const firstResult = result.current.pendingHistoryItems;
      rerender();
      const secondResult = result.current.pendingHistoryItems;

      expect(firstResult).toBe(secondResult);
    });

    it('should reset thought to null when user cancels', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking', description: '...' },
          };
        })(),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      expect(result.current.thought).not.toBeNull();

      // Cancel
      await act(async () => {
        result.current.cancelOngoingRequest();
      });

      expect(result.current.thought).toBeNull();
    });

    it('should reset thought to null when there is an error', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking', description: '...' },
          };
          yield { type: ServerGeminiEventType.Error, value: { error: 'err' } };
        })(),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      expect(result.current.thought).toBeNull();
    });

    it('should update lastOutputTime on Gemini thought and content events', async () => {
      vi.useFakeTimers();
      const { result } = await renderTestHook();

      const startTime = Date.now();
      vi.setSystemTime(startTime + 1000);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Thought,
            value: { subject: 'Thinking', description: '...' },
          };
        })(),
      );

      // Submit query
      await act(async () => {
        await result.current.submitQuery('Test query');
      });

      expect(result.current.lastOutputTime).toBe(startTime + 1000);

      vi.setSystemTime(startTime + 2000);
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: 'Hello' };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('Next query');
      });

      expect(result.current.lastOutputTime).toBe(startTime + 2000);
      vi.useRealTimers();
    });
  });

  describe('Loop Detection Confirmation', () => {
    it('should set loopDetectionConfirmationRequest when LoopDetected event is received', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
    });

    it('should disable loop detection and show message when user selects "disable"', async () => {
      const client = new MockedGeminiClientClass(mockConfig);
      const disableForSessionSpy = vi.fn();
      (client as any).getLoopDetectionService = vi.fn().mockReturnValue({
        disableForSession: disableForSessionSpy,
      });

      const { result } = await renderTestHook([], client);

      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Simulate user selecting "disable"
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: 'success' };
        })(),
      );

      await act(async () => {
        result.current.loopDetectionConfirmationRequest!.onComplete({
          userSelection: 'disable',
        });
      });

      expect(disableForSessionSpy).toHaveBeenCalled();
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Loop detection has been disabled'),
        }),
      );
      // Should have retried
      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
    });

    it('should keep loop detection enabled and show message when user selects "keep"', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Simulate user selecting "keep"
      await act(async () => {
        result.current.loopDetectionConfirmationRequest!.onComplete({
          userSelection: 'keep',
        });
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('The request has been halted'),
        }),
      );
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple loop detection events properly', async () => {
      const { result } = await renderTestHook();

      // First loop detection
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('first query');
      });

      expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();

      // Resolve it
      await act(async () => {
        result.current.loopDetectionConfirmationRequest!.onComplete({
          userSelection: 'keep',
        });
      });

      expect(result.current.loopDetectionConfirmationRequest).toBeNull();

      // Second loop detection
      mockSendMessageStream.mockReturnValueOnce(
        (async function* () {
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('second query');
      });

      expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
    });

    it('should process LoopDetected event after moving pending history to history', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: 'some content' };
          yield {
            type: ServerGeminiEventType.LoopDetected,
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test query');
      });

      // Verification: content should be added to history BEFORE loop detection request
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gemini',
          text: 'some content',
        }),
        expect.any(Number),
      );
      expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();
    });

    describe('Race Condition Prevention', () => {
      it('should reject concurrent submitQuery when already responding', async () => {
        const { result } = await renderTestHook();

        // Slow stream
        mockSendMessageStream.mockReturnValue(
          (async function* () {
            await new Promise((resolve) => setTimeout(resolve, 100));
            yield { type: ServerGeminiEventType.Content, value: 'done' };
          })(),
        );

        await act(async () => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          result.current.submitQuery('first query');
        });

        expect(result.current.streamingState).toBe(StreamingState.Responding);

        // Attempt second concurrent query
        await act(async () => {
          await result.current.submitQuery('second query');
        });

        // Verification: second query should NOT have been sent
        expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
      });

      it('should allow continuation queries via loop detection retry', async () => {
        const { result } = await renderTestHook();

        mockSendMessageStream.mockReturnValueOnce(
          (async function* () {
            yield { type: ServerGeminiEventType.LoopDetected };
          })(),
        );

        await act(async () => {
          await result.current.submitQuery('test query');
        });

        expect(result.current.loopDetectionConfirmationRequest).not.toBeNull();

        // Retry via "disable" selection
        mockSendMessageStream.mockReturnValueOnce(
          (async function* () {
            yield { type: ServerGeminiEventType.Content, value: 'success' };
          })(),
        );

        await act(async () => {
          await result.current.loopDetectionConfirmationRequest!.onComplete({
            userSelection: 'disable',
          });
        });

        // Verification: Both first query and retry should have been sent
        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Agent Execution Events', () => {
    it('should handle AgentExecutionStopped event with systemMessage', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionStopped,
            value: { reason: 'STOPPED', systemMessage: 'Task completed' },
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test stop');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Agent execution stopped: Task completed'),
        }),
        expect.any(Number),
      );
    });

    it('should handle AgentExecutionStopped event by falling back to reason when systemMessage is missing', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionStopped,
            value: { reason: 'INTERNAL_ERROR' },
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test stop');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Agent execution stopped: INTERNAL_ERROR'),
        }),
        expect.any(Number),
      );
    });

    it('should handle AgentExecutionBlocked event with systemMessage', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionBlocked,
            value: { reason: 'BLOCKED', systemMessage: 'Policy violation' },
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test block');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.WARNING,
          text: expect.stringContaining('Agent execution blocked: Policy violation'),
        }),
        expect.any(Number),
      );
    });

    it('should handle AgentExecutionBlocked event by falling back to reason when systemMessage is missing', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.AgentExecutionBlocked,
            value: { reason: 'ACCESS_DENIED' },
          };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('test block');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.WARNING,
          text: expect.stringContaining('Agent execution blocked: ACCESS_DENIED'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Stream Splitting', () => {
    it('should not add empty history item when splitting message results in empty or whitespace-only beforeText', async () => {
      const { result } = await renderTestHook();

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          // Send content that doesn't trigger a safe split point early
          yield { type: ServerGeminiEventType.Content, value: 'word ' };
          yield { type: ServerGeminiEventType.Content, value: 'another' };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('user query');
      });

      // Should only have been called by setPendingHistoryItem, not addItem for a split
      // addItem is called once for user message
      expect(mockAddItem).toHaveBeenCalledTimes(1);
    });

    it('should add whitespace-only history item when splitting message', async () => {
      const { result } = await renderTestHook();

      // Mock findLastSafeSplitPoint to return a split even for whitespace
      vi.mocked(findLastSafeSplitPoint).mockReturnValue(1);

      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield { type: ServerGeminiEventType.Content, value: ' ' };
          yield { type: ServerGeminiEventType.Content, value: 'content' };
        })(),
      );

      await act(async () => {
        await result.current.submitQuery('user query');
      });

      // 1 for user query, 1 for the split whitespace
      expect(mockAddItem).toHaveBeenCalledTimes(2);
    });
  });

  it('should trace UserPrompt telemetry on submitQuery', async () => {
    const { result } = await renderTestHook();

    await act(async () => {
      await result.current.submitQuery('telemetry test query');
    });

    expect(runInDevTraceSpan).toHaveBeenCalledWith(
      expect.objectContaining({ operation: GeminiCliOperation.UserPrompt }),
      expect.any(Function),
    );
  });
});
