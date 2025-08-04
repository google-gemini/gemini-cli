/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeminiStream, mergePartListUnions } from './useGeminiStream.js';
import { useInput } from 'ink';
import {
  useReactToolScheduler,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedExecutingToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import {
  Config,
  EditorType,
  AuthType,
  GeminiEventType as ServerGeminiEventType,
} from '@google/gemini-cli-core';
import { Part, PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import {
  HistoryItem,
  MessageType,
  SlashCommandProcessorResult,
  StreamingState,
} from '../types.js';
import { Dispatch, SetStateAction } from 'react';
import { LoadedSettings } from '../../config/settings.js';

// --- MOCKS ---
const mockSendMessageStream = vi
  .fn()
  .mockReturnValue((async function* () {})());
const mockStartChat = vi.fn();

const MockedGeminiClientClass = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: any, _config: any) {
    // _config
    this.startChat = mockStartChat;
    this.sendMessageStream = mockSendMessageStream;
    this.addHistory = vi.fn();
  }),
);

const MockedUserPromptEvent = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {}),
);

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actualCoreModule = (await importOriginal()) as any;
  return {
    ...actualCoreModule,
    GitService: vi.fn(),
    GeminiClient: MockedGeminiClientClass,
    UserPromptEvent: MockedUserPromptEvent,
  };
});

const mockUseReactToolScheduler = useReactToolScheduler as Mock;
vi.mock('./useReactToolScheduler.js', async (importOriginal) => {
  const actualSchedulerModule = (await importOriginal()) as any;
  return {
    ...(actualSchedulerModule || {}),
    useReactToolScheduler: vi.fn(),
  };
});

vi.mock('ink', async (importOriginal) => {
  const actualInkModule = (await importOriginal()) as any;
  return { ...(actualInkModule || {}), useInput: vi.fn() };
});

vi.mock('./shellCommandProcessor.js', () => ({
  useShellCommandProcessor: vi.fn().mockReturnValue({
    handleShellCommand: vi.fn(),
  }),
}));

vi.mock('./atCommandProcessor.js', () => ({
  handleAtCommand: vi
    .fn()
    .mockResolvedValue({ shouldProceed: true, processedQuery: 'mocked' }),
}));

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
    return [ref, setVal];
  }),
}));

vi.mock('./useLogger.js', () => ({
  useLogger: vi.fn().mockReturnValue({
    logMessage: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockStartNewPrompt = vi.fn();
const mockAddUsage = vi.fn();
vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({
    startNewPrompt: mockStartNewPrompt,
    addUsage: mockAddUsage,
    getPromptCount: vi.fn(() => 5),
  })),
}));

vi.mock('./slashCommandProcessor.js', () => ({
  handleSlashCommand: vi.fn().mockReturnValue(false),
}));

const mockParseAndFormatApiError = vi.hoisted(() => vi.fn());
vi.mock('../utils/errorParsing.js', () => ({
  parseAndFormatApiError: mockParseAndFormatApiError,
}));

// --- END MOCKS ---

describe('mergePartListUnions', () => {
  it('should merge multiple PartListUnion arrays', () => {
    const list1: PartListUnion = [{ text: 'Hello' }];
    const list2: PartListUnion = [
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
    ];
    const list3: PartListUnion = [{ text: 'World' }, { text: '!' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { text: 'World' },
      { text: '!' },
    ]);
  });

  it('should handle empty arrays in the input list', () => {
    const list1: PartListUnion = [{ text: 'First' }];
    const list2: PartListUnion = [];
    const list3: PartListUnion = [{ text: 'Last' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([{ text: 'First' }, { text: 'Last' }]);
  });

  it('should handle a single PartListUnion array', () => {
    const list1: PartListUnion = [
      { text: 'One' },
      { inlineData: { mimeType: 'image/jpeg', data: 'xyz' } },
    ];
    const result = mergePartListUnions([list1]);
    expect(result).toEqual(list1);
  });

  it('should return an empty array if all input arrays are empty', () => {
    const list1: PartListUnion = [];
    const list2: PartListUnion = [];
    const result = mergePartListUnions([list1, list2]);
    expect(result).toEqual([]);
  });

  it('should handle input list being empty', () => {
    const result = mergePartListUnions([]);
    expect(result).toEqual([]);
  });

  it('should correctly merge when PartListUnion items are single Parts not in arrays', () => {
    const part1: Part = { text: 'Single part 1' };
    const part2: Part = { inlineData: { mimeType: 'image/gif', data: 'gif' } };
    const listContainingSingleParts: PartListUnion[] = [
      part1,
      [part2],
      { text: 'Another single part' },
    ];
    const result = mergePartListUnions(listContainingSingleParts);
    expect(result).toEqual([
      { text: 'Single part 1' },
      { inlineData: { mimeType: 'image/gif', data: 'gif' } },
      { text: 'Another single part' },
    ]);
  });

  it('should handle a mix of arrays and single parts, including empty arrays and undefined/null parts if they were possible (though PartListUnion typing restricts this)', () => {
    const list1: PartListUnion = [{ text: 'A' }];
    const list2: PartListUnion = [];
    const part3: Part = { text: 'B' };
    const list4: PartListUnion = [
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ];
    const result = mergePartListUnions([list1, list2, part3, list4]);
    expect(result).toEqual([
      { text: 'A' },
      { text: 'B' },
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ]);
  });

  it('should preserve the order of parts from the input arrays', () => {
    const listA: PartListUnion = [{ text: '1' }, { text: '2' }];
    const listB: PartListUnion = [{ text: '3' }];
    const listC: PartListUnion = [{ text: '4' }, { text: '5' }];
    const result = mergePartListUnions([listA, listB, listC]);
    expect(result).toEqual([
      { text: '1' },
      { text: '2' },
      { text: '3' },
      { text: '4' },
      { text: '5' },
    ]);
  });

  it('should handle cases where some PartListUnion items are single Parts and others are arrays of Parts', () => {
    const singlePart1: Part = { text: 'First single' };
    const arrayPart1: Part[] = [
      { text: 'Array item 1' },
      { text: 'Array item 2' },
    ];
    const singlePart2: Part = {
      inlineData: { mimeType: 'application/json', data: 'e30=' },
    }; // {}
    const arrayPart2: Part[] = [{ text: 'Last array item' }];

    const result = mergePartListUnions([
      singlePart1,
      arrayPart1,
      singlePart2,
      arrayPart2,
    ]);
    expect(result).toEqual([
      { text: 'First single' },
      { text: 'Array item 1' },
      { text: 'Array item 2' },
      { inlineData: { mimeType: 'application/json', data: 'e30=' } },
      { text: 'Last array item' },
    ]);
  });
});

// --- Tests for useGeminiStream Hook ---
describe('useGeminiStream', () => {
  let mockAddItem: Mock;
  let mockSetShowHelp: Mock;
  let mockConfig: Config;
  let mockOnDebugMessage: Mock;
  let mockHandleSlashCommand: Mock;
  let mockScheduleToolCalls: Mock;
  let mockCancelAllToolCalls: Mock;
  let mockMarkToolsAsSubmitted: Mock;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test

    mockAddItem = vi.fn();
    mockSetShowHelp = vi.fn();
    // Define the mock for getGeminiClient
    const mockGetGeminiClient = vi.fn().mockImplementation(() => {
      // MockedGeminiClientClass is defined in the module scope by the previous change.
      // It will use the mockStartChat and mockSendMessageStream that are managed within beforeEach.
      const clientInstance = new MockedGeminiClientClass(mockConfig);
      return clientInstance;
    });

    const contentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };

    mockConfig = {
      apiKey: 'test-api-key',
      model: 'gemini-pro',
      sandbox: false,
      targetDir: '/test/dir',
      debugMode: false,
      question: undefined,
      fullContext: false,
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
      getToolRegistry: vi.fn(
        () => ({ getToolSchemaList: vi.fn(() => []) }) as any,
      ),
      getProjectRoot: vi.fn(() => '/test/dir'),
      getCheckpointingEnabled: vi.fn(() => false),
      getGeminiClient: mockGetGeminiClient,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      addHistory: vi.fn(),
      getSessionId() {
        return 'test-session-id';
      },
      setQuotaErrorOccurred: vi.fn(),
      getQuotaErrorOccurred: vi.fn(() => false),
      getModel: vi.fn(() => 'gemini-2.5-pro'),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue(contentGeneratorConfig),
    } as unknown as Config;
    mockOnDebugMessage = vi.fn();
    mockHandleSlashCommand = vi.fn().mockResolvedValue(false);

    // Mock return value for useReactToolScheduler
    mockScheduleToolCalls = vi.fn();
    mockCancelAllToolCalls = vi.fn();
    mockMarkToolsAsSubmitted = vi.fn();

    // Default mock for useReactToolScheduler to prevent toolCalls being undefined initially
    mockUseReactToolScheduler.mockReturnValue([
      [], // Default to empty array for toolCalls
      mockScheduleToolCalls,
      mockCancelAllToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    // Reset mocks for GeminiClient instance methods (startChat and sendMessageStream)
    // The GeminiClient constructor itself is mocked at the module level.
    mockStartChat.mockClear().mockResolvedValue({
      sendMessageStream: mockSendMessageStream,
    } as unknown as any); // GeminiChat -> any
    mockSendMessageStream
      .mockClear()
      .mockReturnValue((async function* () {})());
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
    let currentToolCalls = initialToolCalls;
    const setToolCalls = (newToolCalls: TrackedToolCall[]) => {
      currentToolCalls = newToolCalls;
    };

    mockUseReactToolScheduler.mockImplementation(() => [
      currentToolCalls,
      mockScheduleToolCalls,
      mockCancelAllToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    const client = geminiClient || mockConfig.getGeminiClient();

    const { result, rerender } = renderHook(
      (props: {
        client: any;
        history: HistoryItem[];
        addItem: UseHistoryManagerReturn['addItem'];
        setShowHelp: Dispatch<SetStateAction<boolean>>;
        config: Config;
        onDebugMessage: (message: string) => void;
        handleSlashCommand: (
          cmd: PartListUnion,
        ) => Promise<SlashCommandProcessorResult | false>;
        shellModeActive: boolean;
        loadedSettings: LoadedSettings;
        toolCalls?: TrackedToolCall[]; // Allow passing updated toolCalls
      }) => {
        // Update the mock's return value if new toolCalls are passed in props
        if (props.toolCalls) {
          setToolCalls(props.toolCalls);
        }
        return useGeminiStream(
          props.client,
          props.history,
          props.addItem,
          props.setShowHelp,
          props.config,
          props.onDebugMessage,
          props.handleSlashCommand,
          props.shellModeActive,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
        );
      },
      {
        initialProps: {
          client,
          history: [],
          addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
          setShowHelp: mockSetShowHelp,
          config: mockConfig,
          onDebugMessage: mockOnDebugMessage,
          handleSlashCommand: mockHandleSlashCommand as unknown as (
            cmd: PartListUnion,
          ) => Promise<SlashCommandProcessorResult | false>,
          shellModeActive: false,
          loadedSettings: mockLoadedSettings,
          toolCalls: initialToolCalls,
        },
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
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: [{ text: 'tool 1 response' }],
          error: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          description: 'desc1',
          getDescription: vi.fn(),
        } as any,
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
        status: 'executing',
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool2',
          description: 'desc2',
          getDescription: vi.fn(),
        } as any,
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
    const toolCall1ResponseParts: PartListUnion = [
      { text: 'tool 1 final response' },
    ];
    const toolCall2ResponseParts: PartListUnion = [
      { text: 'tool 2 final response' },
    ];
    const completedToolCalls: TrackedToolCall[] = [
      {
        request: {
          callId: 'call1',
          name: 'tool1',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: { callId: 'call1', responseParts: toolCall1ResponseParts },
      } as TrackedCompletedToolCall,
      {
        request: {
          callId: 'call2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
        status: 'error',
        responseSubmittedToGemini: false,
        response: { callId: 'call2', responseParts: toolCall2ResponseParts },
      } as TrackedCompletedToolCall, // Treat error as a form of completion for submission
    ];

    // Capture the onComplete callback
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // Trigger the onComplete callback with completed tools
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(completedToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledTimes(1);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    const expectedMergedResponse = mergePartListUnions([
      toolCall1ResponseParts,
      toolCall2ResponseParts,
    ]);
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      expectedMergedResponse,
      expect.any(AbortSignal),
      'prompt-id-2',
    );
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
        status: 'cancelled',
        response: { callId: '1', responseParts: [{ text: 'cancelled' }] },
        responseSubmittedToGemini: false,
      } as TrackedCancelledToolCall,
    ];
    const client = new MockedGeminiClientClass(mockConfig);

    // Capture the onComplete callback
    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // Trigger the onComplete callback with cancelled tools
    await act(async () => {
      if (capturedOnComplete) {
        await capturedOnComplete(cancelledToolCalls);
      }
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith(['1']);
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [{ text: 'cancelled' }],
      });
      // Ensure we do NOT call back to the API
      expect(mockSendMessageStream).not.toHaveBeenCalled();
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
        description: 'descA',
        getDescription: vi.fn(),
      } as any,
      status: 'cancelled',
      response: {
        callId: 'cancel-1',
        responseParts: [
          { functionResponse: { name: 'toolA', id: 'cancel-1' } },
        ],
        resultDisplay: undefined,
        error: undefined,
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
        description: 'descB',
        getDescription: vi.fn(),
      } as any,
      status: 'cancelled',
      response: {
        callId: 'cancel-2',
        responseParts: [
          { functionResponse: { name: 'toolB', id: 'cancel-2' } },
        ],
        resultDisplay: undefined,
        error: undefined,
      },
      responseSubmittedToGemini: false,
    };
    const allCancelledTools = [cancelledToolCall1, cancelledToolCall2];
    const client = new MockedGeminiClientClass(mockConfig);

    let capturedOnComplete:
      | ((completedTools: TrackedToolCall[]) => Promise<void>)
      | null = null;

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
    });

    renderHook(() =>
      useGeminiStream(
        client,
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // Trigger the onComplete callback with multiple cancelled tools
    await act(async () => {
      if (capturedOnComplete) {
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
          ...(cancelledToolCall1.response.responseParts as Part[]),
          ...(cancelledToolCall2.response.responseParts as Part[]),
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
        status: 'executing',
        responseSubmittedToGemini: false,
        tool: {
          name: 'tool1',
          description: 'desc',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
      } as TrackedExecutingToolCall,
    ];

    const completedToolCalls: TrackedToolCall[] = [
      {
        ...(initialToolCalls[0] as TrackedExecutingToolCall),
        status: 'success',
        response: {
          callId: 'call1',
          responseParts: toolCallResponseParts,
          error: undefined,
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

    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        currentToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ];
    });

    const { result, rerender } = renderHook(() =>
      useGeminiStream(
        new MockedGeminiClientClass(mockConfig),
        [],
        mockAddItem,
        mockSetShowHelp,
        mockConfig,
        mockOnDebugMessage,
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        () => {},
        () => Promise.resolve(),
        false,
        () => {},
      ),
    );

    // 1. Initial state should be Responding because a tool is executing.
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 2. Update the tool calls to completed state and rerender
    currentToolCalls = completedToolCalls;
    mockUseReactToolScheduler.mockImplementation((onComplete) => {
      capturedOnComplete = onComplete;
      return [
        completedToolCalls,
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
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
        await capturedOnComplete(completedToolCalls);
      }
    });

    // 5. Wait for submitQuery to be called
    await waitFor(() => {
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        toolCallResponseParts,
        expect.any(AbortSignal),
        'prompt-id-4',
      );
    });

    // 6. After submission, the state should remain Responding until the stream completes.
    expect(result.current.streamingState).toBe(StreamingState.Responding);
  });

  describe('User Cancellation', () => {
    let useInputCallback: (input: string, key: any) => void;
    const mockUseInput = useInput as Mock;

    beforeEach(() => {
      // Capture the callback passed to useInput
      mockUseInput.mockImplementation((callback) => {
        useInputCallback = callback;
      });
    });

    const simulateEscapeKeyPress = () => {
      act(() => {
        useInputCallback('', { escape: true });
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
        expect(mockAddItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Request cancelled.',
          },
          expect.any(Number),
        );
      });

      // Verify state is reset
      expect(result.current.streamingState).toBe(StreamingState.Idle);
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
        expect.any(Number),
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
        result.current.submitQuery('long running query');
      });

      await waitFor(() => {
        expect(result.current.streamingState).toBe(StreamingState.Responding);
      });

      // Cancel the request
      simulateEscapeKeyPress();

      // Allow the stream to continue
      act(() => {
        continueStream();
      });

      // Wait a bit to see if the second part is processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The text should not have been updated with " Canceled"
      const lastCall = mockAddItem.mock.calls.find(
        (call) => call[0].type === 'gemini',
      );
      expect(lastCall?.[0].text).toBe('Initial');

      // The final state should be idle after cancellation
      expect(result.current.streamingState).toBe(StreamingState.Idle);
    });

    it('should not cancel if a tool call is in progress (not just responding)', async () => {
      const toolCalls: TrackedToolCall[] = [
        {
          request: { callId: 'call1', name: 'tool1', args: {} },
          status: 'executing',
          responseSubmittedToGemini: false,
          tool: {
            name: 'tool1',
            description: 'desc1',
            getDescription: vi.fn(),
          } as any,
          startTime: Date.now(),
          liveOutput: '...',
        } as TrackedExecutingToolCall,
      ];

      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { result } = renderTestHook(toolCalls);

      // State is `Responding` because a tool is running
      expect(result.current.streamingState).toBe(StreamingState.Responding);

      // Try to cancel
      simulateEscapeKeyPress();

      // Nothing should happen because the state is not `Responding`
      expect(abortSpy).not.toHaveBeenCalled();
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
        );
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
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'save-mem-call-1',
          responseParts: [{ text: 'Memory saved' }],
          resultDisplay: 'Success: Memory saved',
          error: undefined,
        },
        tool: {
          name: 'save_memory',
          description: 'Saves memory',
          getDescription: vi.fn(),
        } as any,
      };

      // Capture the onComplete callback
      let capturedOnComplete:
        | ((completedTools: TrackedToolCall[]) => Promise<void>)
        | null = null;

      mockUseReactToolScheduler.mockImplementation((onComplete) => {
        capturedOnComplete = onComplete;
        return [[], mockScheduleToolCalls, mockMarkToolsAsSubmitted];
      });

      renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          mockPerformMemoryRefresh,
          false,
          () => {},
        ),
      );

      // Trigger the onComplete callback with the completed save_memory tool
      await act(async () => {
        if (capturedOnComplete) {
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
        getContentGeneratorConfig: vi.fn(() => ({
          authType: mockAuthType,
        })),
        getModel: vi.fn(() => 'gemini-2.5-pro'),
      } as unknown as Config;

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(testConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          testConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
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

  describe('handleFinishedEvent', () => {
    it('should add info message for MAX_TOKENS finish reason', async () => {
      // Setup mock to return a stream with MAX_TOKENS finish reason
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'This is a truncated response...',
          };
          yield { type: ServerGeminiEventType.Finished, value: 'MAX_TOKENS' };
        })(),
      );

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
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

    it('should not add message for STOP finish reason', async () => {
      // Setup mock to return a stream with STOP finish reason
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Complete response',
          };
          yield { type: ServerGeminiEventType.Finished, value: 'STOP' };
        })(),
      );

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
        ),
      );

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test normal completion');
      });

      // Wait a bit to ensure no message is added
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that no info message was added for STOP
      const infoMessages = mockAddItem.mock.calls.filter(
        (call) => call[0].type === 'info',
      );
      expect(infoMessages).toHaveLength(0);
    });

    it('should not add message for FINISH_REASON_UNSPECIFIED', async () => {
      // Setup mock to return a stream with FINISH_REASON_UNSPECIFIED
      mockSendMessageStream.mockReturnValue(
        (async function* () {
          yield {
            type: ServerGeminiEventType.Content,
            value: 'Response with unspecified finish',
          };
          yield {
            type: ServerGeminiEventType.Finished,
            value: 'FINISH_REASON_UNSPECIFIED',
          };
        })(),
      );

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
        ),
      );

      // Submit a query
      await act(async () => {
        await result.current.submitQuery('Test unspecified finish');
      });

      // Wait a bit to ensure no message is added
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that no info message was added
      const infoMessages = mockAddItem.mock.calls.filter(
        (call) => call[0].type === 'info',
      );
      expect(infoMessages).toHaveLength(0);
    });

    it('should add appropriate messages for other finish reasons', async () => {
      const testCases = [
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
        { reason: 'OTHER', message: '⚠️  Response stopped for other reasons.' },
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
      ];

      for (const { reason, message } of testCases) {
        // Reset mocks for each test case
        mockAddItem.mockClear();
        mockSendMessageStream.mockReturnValue(
          (async function* () {
            yield {
              type: ServerGeminiEventType.Content,
              value: `Response for ${reason}`,
            };
            yield { type: ServerGeminiEventType.Finished, value: reason };
          })(),
        );

        const { result } = renderHook(() =>
          useGeminiStream(
            new MockedGeminiClientClass(mockConfig),
            [],
            mockAddItem,
            mockSetShowHelp,
            mockConfig,
            mockOnDebugMessage,
            mockHandleSlashCommand,
            false,
            () => 'vscode' as EditorType,
            () => {},
            () => Promise.resolve(),
            false,
            () => {},
          ),
        );

        await act(async () => {
          await result.current.submitQuery(`Test ${reason}`);
        });

        await waitFor(() => {
          expect(mockAddItem).toHaveBeenCalledWith(
            {
              type: 'info',
              text: message,
            },
            expect.any(Number),
          );
        });
      }
    });
  });

  describe('Thought Reset', () => {
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
          yield { type: ServerGeminiEventType.Finished, value: 'STOP' };
        })(),
      );

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
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
          yield { type: ServerGeminiEventType.Finished, value: 'STOP' };
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

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
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

      const { result } = renderHook(() =>
        useGeminiStream(
          new MockedGeminiClientClass(mockConfig),
          [],
          mockAddItem,
          mockSetShowHelp,
          mockConfig,
          mockOnDebugMessage,
          mockHandleSlashCommand,
          false,
          () => 'vscode' as EditorType,
          () => {},
          () => Promise.resolve(),
          false,
          () => {},
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
            type: 'error',
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
  });
});
