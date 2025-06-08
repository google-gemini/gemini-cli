/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeminiStream, mergePartListUnions } from './useGeminiStream.js';
import {
  useReactToolScheduler,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedExecutingToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { Config } from '@gemini-cli/core';
import { Part, PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { Dispatch, SetStateAction } from 'react';

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

vi.mock('@gemini-cli/core', async (importOriginal) => {
  const actualCoreModule = (await importOriginal()) as any;
  return {
    ...(actualCoreModule || {}),
    GeminiClient: MockedGeminiClientClass, // Export the class for type checking or other direct uses
    Config: actualCoreModule.Config, // Ensure Config is passed through
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

vi.mock('./slashCommandProcessor.js', () => ({
  handleSlashCommand: vi.fn().mockReturnValue(false),
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
      getGeminiClient: mockGetGeminiClient,
      addHistory: vi.fn(),
    } as unknown as Config;
    mockOnDebugMessage = vi.fn();
    mockHandleSlashCommand = vi.fn().mockReturnValue(false);

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

  const renderTestHook = (
    initialToolCalls: TrackedToolCall[] = [],
    geminiClient?: any,
  ) => {
    mockUseReactToolScheduler.mockReturnValue([
      initialToolCalls,
      mockScheduleToolCalls,
      mockCancelAllToolCalls,
      mockMarkToolsAsSubmitted,
    ]);

    const client = geminiClient || mockConfig.getGeminiClient();

    const { result, rerender } = renderHook(
      (props: {
        client: any;
        addItem: UseHistoryManagerReturn['addItem'];
        setShowHelp: Dispatch<SetStateAction<boolean>>;
        config: Config;
        onDebugMessage: (message: string) => void;
        handleSlashCommand: (
          command: PartListUnion,
        ) =>
          | import('./slashCommandProcessor.js').SlashCommandActionReturn
          | boolean;
        shellModeActive: boolean;
      }) =>
        useGeminiStream(
          props.client,
          props.addItem,
          props.setShowHelp,
          props.config,
          props.onDebugMessage,
          props.handleSlashCommand,
          props.shellModeActive,
        ),
      {
        initialProps: {
          client,
          addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
          setShowHelp: mockSetShowHelp,
          config: mockConfig,
          onDebugMessage: mockOnDebugMessage,
          handleSlashCommand:
            mockHandleSlashCommand as unknown as typeof mockHandleSlashCommand,
          shellModeActive: false,
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
        request: { callId: 'call1', name: 'tool1', args: {} },
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

    // Simplified toolCalls to ensure the filter logic is the focus
    const simplifiedToolCalls: TrackedToolCall[] = [
      {
        request: { callId: 'call1', name: 'tool1', args: {} },
        status: 'success',
        responseSubmittedToGemini: false,
        response: {
          callId: 'call1',
          responseParts: toolCall1ResponseParts,
          error: undefined,
          resultDisplay: 'Tool 1 success display',
        },
        tool: {
          name: 'tool1',
          description: 'desc',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
        endTime: Date.now(),
      } as TrackedCompletedToolCall,
      {
        request: { callId: 'call2', name: 'tool2', args: {} },
        status: 'cancelled',
        responseSubmittedToGemini: false,
        response: {
          callId: 'call2',
          responseParts: toolCall2ResponseParts,
          error: undefined,
          resultDisplay: 'Tool 2 cancelled display',
        },
        tool: {
          name: 'tool2',
          description: 'desc',
          getDescription: vi.fn(),
        } as any,
        startTime: Date.now(),
        endTime: Date.now(),
        reason: 'test cancellation',
      } as TrackedCancelledToolCall,
    ];

    const {
      rerender,
      mockMarkToolsAsSubmitted,
      mockSendMessageStream: localMockSendMessageStream,
      client,
    } = renderTestHook(simplifiedToolCalls);

    act(() => {
      rerender({
        client,
        addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
        setShowHelp: mockSetShowHelp,
        config: mockConfig,
        onDebugMessage: mockOnDebugMessage,
        handleSlashCommand:
          mockHandleSlashCommand as unknown as typeof mockHandleSlashCommand,
        shellModeActive: false,
      });
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledTimes(0);
      expect(localMockSendMessageStream).toHaveBeenCalledTimes(0);
    });

    const expectedMergedResponse = mergePartListUnions([
      toolCall1ResponseParts,
      toolCall2ResponseParts,
    ]);
    expect(localMockSendMessageStream).toHaveBeenCalledWith(
      expectedMergedResponse,
      expect.any(AbortSignal),
    );
  });

  it('should handle all tool calls being cancelled', async () => {
    const toolCalls: TrackedToolCall[] = [
      {
        request: { callId: '1', name: 'testTool', args: {} },
        status: 'cancelled',
        response: {
          callId: '1',
          responseParts: [{ text: 'cancelled' }],
          error: undefined,
          resultDisplay: 'Tool 1 cancelled display',
        },
        responseSubmittedToGemini: false,
        tool: {
          name: 'testTool',
          description: 'desc',
          getDescription: vi.fn(),
        } as any,
      },
    ];

    const client = new MockedGeminiClientClass(mockConfig);
    const { mockMarkToolsAsSubmitted, rerender } = renderTestHook(
      toolCalls,
      client,
    );

    act(() => {
      rerender({
        client,
        addItem: mockAddItem as unknown as UseHistoryManagerReturn['addItem'],
        setShowHelp: mockSetShowHelp,
        config: mockConfig,
        onDebugMessage: mockOnDebugMessage,
        handleSlashCommand:
          mockHandleSlashCommand as unknown as typeof mockHandleSlashCommand,
        shellModeActive: false,
      });
    });

    await waitFor(() => {
      expect(mockMarkToolsAsSubmitted).toHaveBeenCalledTimes(0);
      expect(client.addHistory).toHaveBeenCalledTimes(2);
      expect(client.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [{ text: 'cancelled' }],
      });
    });
  });
});
