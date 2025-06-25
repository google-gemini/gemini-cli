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
import { Config, EditorType, AuthType } from '@google/gemini-cli-core';
import { Part, PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { HistoryItem, MessageType, StreamingState } from '../types.js';
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

const mockStartNewTurn = vi.fn();
const mockAddUsage = vi.fn();
vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({
    startNewTurn: mockStartNewTurn,
    addUsage: mockAddUsage,
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
        ) => Promise<
          | import('./slashCommandProcessor.js').SlashCommandActionReturn
          | boolean
        >;
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
          ) => Promise<
            | import('./slashCommandProcessor.js').SlashCommandActionReturn
            | boolean
          >,
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
        request: { callId: 'call2', name: 'tool2', args: {} },
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
        },
        status: 'error',
        responseSubmittedToGemini: false,
        response: { callId: 'call2', responseParts: toolCall2ResponseParts },
      } as TrackedCompletedToolCall, // Treat error as a form of completion for submission
    ];

    // 1. On the first render, there are no tool calls.
    mockUseReactToolScheduler.mockReturnValue([
      [],
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
    ]);
    const { rerender } = renderHook(() =>
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
      ),
    );

    // 2. Before the second render, change the mock to return the completed tools.
    mockUseReactToolScheduler.mockReturnValue([
      completedToolCalls,
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    // 3. Trigger a re-render. The hook will now receive the completed tools, causing the effect to run.
    act(() => {
      rerender();
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
        },
        status: 'cancelled',
        response: { callId: '1', responseParts: [{ text: 'cancelled' }] },
        responseSubmittedToGemini: false,
      } as TrackedCancelledToolCall,
    ];
    const client = new MockedGeminiClientClass(mockConfig);

    // 1. First render: no tool calls.
    mockUseReactToolScheduler.mockReturnValue([
      [],
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
    ]);
    const { rerender } = renderHook(() =>
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
      ),
    );

    // 2. Second render: tool calls are now cancelled.
    mockUseReactToolScheduler.mockReturnValue([
      cancelledToolCalls,
      mockScheduleToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    // 3. Trigger the re-render.
    act(() => {
      rerender();
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

  describe('Session Stats Integration', () => {
    it('should call startNewTurn and addUsage for a simple prompt', async () => {
      const mockMetadata = { totalTokenCount: 123 };
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Response' };
        yield { type: 'usage_metadata', value: mockMetadata };
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('Hello, world!');
      });

      expect(mockStartNewTurn).toHaveBeenCalledTimes(1);
      expect(mockAddUsage).toHaveBeenCalledTimes(1);
      expect(mockAddUsage).toHaveBeenCalledWith(mockMetadata);
    });

    it('should only call addUsage for a tool continuation prompt', async () => {
      const mockMetadata = { totalTokenCount: 456 };
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Final Answer' };
        yield { type: 'usage_metadata', value: mockMetadata };
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery([{ text: 'tool response' }], {
          isContinuation: true,
        });
      });

      expect(mockStartNewTurn).not.toHaveBeenCalled();
      expect(mockAddUsage).toHaveBeenCalledTimes(1);
      expect(mockAddUsage).toHaveBeenCalledWith(mockMetadata);
    });

    it('should not call addUsage if the stream contains no usage metadata', async () => {
      // Arrange: A stream that yields content but never a usage_metadata event
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Some response text' };
      })();
      mockSendMessageStream.mockReturnValue(mockStream);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('Query with no usage data');
      });

      expect(mockStartNewTurn).toHaveBeenCalledTimes(1);
      expect(mockAddUsage).not.toHaveBeenCalled();
    });

    it('should not call startNewTurn for a slash command', async () => {
      mockHandleSlashCommand.mockReturnValue(true);

      const { result } = renderTestHook();

      await act(async () => {
        await result.current.submitQuery('/stats');
      });

      expect(mockStartNewTurn).not.toHaveBeenCalled();
      expect(mockSendMessageStream).not.toHaveBeenCalled();
    });
  });

  it('should not flicker streaming state to Idle between tool completion and submission', async () => {
    const toolCallResponseParts: PartListUnion = [
      { text: 'tool 1 final response' },
    ];

    const initialToolCalls: TrackedToolCall[] = [
      {
        request: { callId: 'call1', name: 'tool1', args: {} },
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

    const { result, rerender, client } = renderTestHook(initialToolCalls);

    // 1. Initial state should be Responding because a tool is executing.
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 2. Rerender with the completed tool call.
    // The useEffect should pick this up but hasn't called submitQuery yet.
    act(() => {
      rerender({
        client,
        history: [],
        addItem: mockAddItem,
        setShowHelp: mockSetShowHelp,
        config: mockConfig,
        onDebugMessage: mockOnDebugMessage,
        handleSlashCommand:
          mockHandleSlashCommand as unknown as typeof mockHandleSlashCommand,
        shellModeActive: false,
        loadedSettings: mockLoadedSettings,
        // This is the key part of the test: update the toolCalls array
        // to simulate the tool finishing.
        toolCalls: completedToolCalls,
      });
    });

    // 3. The state should *still* be Responding, not Idle.
    // This is because the completed tool's response has not been submitted yet.
    expect(result.current.streamingState).toBe(StreamingState.Responding);

    // 4. Wait for the useEffect to call submitQuery.
    await waitFor(() => {
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        toolCallResponseParts,
        expect.any(AbortSignal),
      );
    });

    // 5. After submission, the state should remain Responding.
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

  describe('Client-Initiated Tool Calls', () => {
    it('should execute a client-initiated tool without sending a response to Gemini', async () => {
      const clientToolRequest = {
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: 'test fact' },
      };
      mockHandleSlashCommand.mockResolvedValue(clientToolRequest);

      const completedToolCall: TrackedCompletedToolCall = {
        request: {
          callId: 'client-call-1',
          name: clientToolRequest.toolName,
          args: clientToolRequest.toolArgs,
          isClientInitiated: true,
        },
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'client-call-1',
          responseParts: [{ text: 'Memory saved' }],
          resultDisplay: 'Success: Memory saved',
          error: undefined,
        },
        tool: {
          name: clientToolRequest.toolName,
          description: 'Saves memory',
          getDescription: vi.fn(),
        } as any,
      };

      // 1. Initial render state: no tool calls
      mockUseReactToolScheduler.mockReturnValue([
        [],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ]);

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
        ),
      );

      // --- User runs the slash command ---
      await act(async () => {
        await result.current.submitQuery('/memory add "test fact"');
      });

      // The command handler schedules the tool. Now we simulate the tool completing.
      // 2. Before the next render, set the mock to return the completed tool.
      mockUseReactToolScheduler.mockReturnValue([
        [completedToolCall],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ]);

      // 3. Trigger a re-render to process the completed tool.
      act(() => {
        rerender();
      });

      // --- Assert the outcome ---
      await waitFor(() => {
        // The tool should be marked as submitted locally
        expect(mockMarkToolsAsSubmitted).toHaveBeenCalledWith([
          'client-call-1',
        ]);
        // Crucially, no message should be sent to the Gemini API
        expect(mockSendMessageStream).not.toHaveBeenCalled();
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

      mockUseReactToolScheduler.mockReturnValue([
        [completedToolCall],
        mockScheduleToolCalls,
        mockMarkToolsAsSubmitted,
      ]);

      const { rerender } = renderHook(() =>
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
        ),
      );

      act(() => {
        rerender();
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
      const mockAuthType = AuthType.LOGIN_WITH_GOOGLE_PERSONAL;
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
        );
      });
    });
  });
});
