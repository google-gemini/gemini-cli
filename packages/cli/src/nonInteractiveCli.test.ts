/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  executeToolCall,
  ToolRegistry,
  ToolErrorType,
  shutdownTelemetry,
  GeminiEventType,
  ServerGeminiStreamEvent,
  ChatRecordingService,
} from '@google/gemini-cli-core';
import { Part } from '@google/genai';
import { runNonInteractive } from './nonInteractiveCli.js';
import { vi } from 'vitest';

// Mock core modules
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const MockChatRecordingService = vi.fn();
  MockChatRecordingService.mockImplementation(() => ({
    initialize: vi.fn(),
    recordMessage: vi.fn(),
    recordMessageTokens: vi.fn(),
    recordToolCalls: vi.fn(),
  }));
  return {
    ...original,
    executeToolCall: vi.fn(),
    shutdownTelemetry: vi.fn(),
    isTelemetrySdkInitialized: vi.fn().mockReturnValue(true),
    ChatRecordingService: MockChatRecordingService,
  };
});

describe('runNonInteractive', () => {
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;
  let mockCoreExecuteToolCall: vi.Mock;
  let mockShutdownTelemetry: vi.Mock;
  let consoleErrorSpy: vi.SpyInstance;
  let processExitSpy: vi.SpyInstance;
  let processStdoutSpy: vi.SpyInstance;
  let mockGeminiClient: {
    sendMessageStream: vi.Mock;
  };
  let mockChatRecordingService: {
    initialize: vi.Mock;
    recordMessage: vi.Mock;
    recordMessageTokens: vi.Mock;
    recordToolCalls: vi.Mock;
  };

  beforeEach(() => {
    mockCoreExecuteToolCall = vi.mocked(executeToolCall);
    mockShutdownTelemetry = vi.mocked(shutdownTelemetry);

    // Set up mock for ChatRecordingService instance
    mockChatRecordingService = {
      initialize: vi.fn(),
      recordMessage: vi.fn(),
      recordMessageTokens: vi.fn(),
      recordToolCalls: vi.fn(),
    };

    // Configure the mocked constructor to return our mock instance
    vi.mocked(ChatRecordingService).mockImplementation(
      () => mockChatRecordingService as any,
    );

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as (code?: number) => never);
    processStdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    mockToolRegistry = {
      getTool: vi.fn(),
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;

    mockGeminiClient = {
      sendMessageStream: vi.fn(),
    };

    mockConfig = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      getProjectTempDir: vi.fn().mockReturnValue('/test/project/.gemini/tmp'),
      getIdeMode: vi.fn().mockReturnValue(false),
      getFullContext: vi.fn().mockReturnValue(false),
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getDebugMode: vi.fn().mockReturnValue(false),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function* createStreamFromEvents(
    events: ServerGeminiStreamEvent[],
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    for (const event of events) {
      yield event;
    }
  }

  it('should process input and write text output', async () => {
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Hello' },
      { type: GeminiEventType.Content, value: ' World' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Test input' }],
      expect.any(AbortSignal),
      'prompt-id-1',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith('Hello');
    expect(processStdoutSpy).toHaveBeenCalledWith(' World');
    expect(processStdoutSpy).toHaveBeenCalledWith('\n');
    expect(mockShutdownTelemetry).toHaveBeenCalled();
  });

  it('should handle a single tool call and respond', async () => {
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'testTool',
        args: { arg1: 'value1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-2',
      },
    };
    const toolResponse: Part[] = [{ text: 'Tool response' }];
    mockCoreExecuteToolCall.mockResolvedValue({ responseParts: toolResponse });

    const firstCallEvents: ServerGeminiStreamEvent[] = [toolCallEvent];
    const secondCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Final answer' },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

    await runNonInteractive(mockConfig, 'Use a tool', 'prompt-id-2');

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockCoreExecuteToolCall).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ name: 'testTool' }),
      expect.any(AbortSignal),
    );
    expect(mockGeminiClient.sendMessageStream).toHaveBeenNthCalledWith(
      2,
      [{ text: 'Tool response' }],
      expect.any(AbortSignal),
      'prompt-id-2',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith('Final answer');
    expect(processStdoutSpy).toHaveBeenCalledWith('\n');
  });

  it('should handle error during tool execution and should send error back to the model', async () => {
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'errorTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-3',
      },
    };
    mockCoreExecuteToolCall.mockResolvedValue({
      error: new Error('Execution failed'),
      errorType: ToolErrorType.EXECUTION_FAILED,
      responseParts: {
        functionResponse: {
          name: 'errorTool',
          response: {
            output: 'Error: Execution failed',
          },
        },
      },
      resultDisplay: 'Execution failed',
    });
    const finalResponse: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Content,
        value: 'Sorry, let me try again.',
      },
    ];
    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
      .mockReturnValueOnce(createStreamFromEvents(finalResponse));

    await runNonInteractive(mockConfig, 'Trigger tool error', 'prompt-id-3');

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool errorTool: Execution failed',
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockGeminiClient.sendMessageStream).toHaveBeenNthCalledWith(
      2,
      [
        {
          functionResponse: {
            name: 'errorTool',
            response: {
              output: 'Error: Execution failed',
            },
          },
        },
      ],
      expect.any(AbortSignal),
      'prompt-id-3',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith('Sorry, let me try again.');
  });

  it('should exit with error if sendMessageStream throws initially', async () => {
    const apiError = new Error('API connection failed');
    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw apiError;
    });

    await runNonInteractive(mockConfig, 'Initial fail', 'prompt-id-4');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[API Error: API connection failed]',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should not exit if a tool is not found, and should send error back to model', async () => {
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'nonexistentTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-5',
      },
    };
    mockCoreExecuteToolCall.mockResolvedValue({
      error: new Error('Tool "nonexistentTool" not found in registry.'),
      resultDisplay: 'Tool "nonexistentTool" not found in registry.',
    });
    const finalResponse: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Content,
        value: "Sorry, I can't find that tool.",
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
      .mockReturnValueOnce(createStreamFromEvents(finalResponse));

    await runNonInteractive(
      mockConfig,
      'Trigger tool not found',
      'prompt-id-5',
    );

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool nonexistentTool: Tool "nonexistentTool" not found in registry.',
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(processStdoutSpy).toHaveBeenCalledWith(
      "Sorry, I can't find that tool.",
    );
  });

  it('should exit when max session turns are exceeded', async () => {
    vi.mocked(mockConfig.getMaxSessionTurns).mockReturnValue(0);
    await runNonInteractive(mockConfig, 'Trigger loop', 'prompt-id-6');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
    );
  });

  describe('chat recording functionality', () => {
    it('should initialize ChatRecordingService and record user message', async () => {
      const events: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Response' },
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

      expect(vi.mocked(ChatRecordingService)).toHaveBeenCalledWith(mockConfig);
      expect(mockChatRecordingService.initialize).toHaveBeenCalled();
      expect(mockChatRecordingService.recordMessage).toHaveBeenCalledWith({
        type: 'user',
        content: 'Test input',
      });
    });

    it('should record Gemini response and token usage', async () => {
      const events: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Hello' },
        { type: GeminiEventType.Content, value: ' World' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP',
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 10,
              cachedContentTokenCount: 2,
              thoughtsTokenCount: 1,
              toolUsePromptTokenCount: 0,
              totalTokenCount: 18,
            },
          },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

      expect(mockChatRecordingService.recordMessage).toHaveBeenCalledWith({
        type: 'gemini',
        content: 'Hello World',
      });
      expect(mockChatRecordingService.recordMessageTokens).toHaveBeenCalledWith(
        {
          input: 5,
          output: 10,
          cached: 2,
          thoughts: 1,
          tool: 0,
          total: 18,
        },
      );
    });

    it('should not record empty Gemini response', async () => {
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: {
            reason: undefined,
            usageMetadata: { totalTokenCount: 5 },
          },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

      expect(mockChatRecordingService.recordMessage).toHaveBeenCalledTimes(1); // Only user message
      expect(mockChatRecordingService.recordMessage).toHaveBeenCalledWith({
        type: 'user',
        content: 'Test input',
      });
    });

    it('should record tool calls before and after execution', async () => {
      const toolCallEvent: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'tool-1',
          name: 'testTool',
          args: { arg1: 'value1' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-2',
        },
      };
      const toolResponse: Part[] = [{ text: 'Tool response' }];
      mockCoreExecuteToolCall.mockResolvedValue({
        responseParts: toolResponse,
        resultDisplay: 'Tool executed successfully',
      });

      const firstCallEvents: ServerGeminiStreamEvent[] = [toolCallEvent];
      const secondCallEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Final answer' },
      ];

      mockGeminiClient.sendMessageStream
        .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
        .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

      await runNonInteractive(mockConfig, 'Use a tool', 'prompt-id-2');

      // Should record tool calls twice - before and after execution
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenCalledTimes(2);

      // First call - before execution
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            id: 'tool-1',
            name: 'testTool',
            args: { arg1: 'value1' },
            status: 'executing',
            displayName: 'testTool',
          }),
        ],
      );

      // Second call - after execution
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenNthCalledWith(
        2,
        [
          expect.objectContaining({
            id: 'tool-1',
            name: 'testTool',
            args: { arg1: 'value1' },
            status: 'success',
            result: toolResponse,
            resultDisplay: 'Tool executed successfully',
          }),
        ],
      );
    });

    it('should record tool call errors correctly', async () => {
      const toolCallEvent: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'tool-error',
          name: 'errorTool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-id-3',
        },
      };

      mockCoreExecuteToolCall.mockResolvedValue({
        error: new Error('Execution failed'),
        errorType: ToolErrorType.EXECUTION_FAILED,
        responseParts: {
          functionResponse: {
            name: 'errorTool',
            response: { output: 'Error: Execution failed' },
          },
        },
        resultDisplay: 'Execution failed',
      });

      const firstCallEvents: ServerGeminiStreamEvent[] = [toolCallEvent];
      const secondCallEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Error handled' },
      ];

      mockGeminiClient.sendMessageStream
        .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
        .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

      await runNonInteractive(mockConfig, 'Trigger error', 'prompt-id-3');

      // Should record tool calls twice - before and after execution
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenCalledTimes(2);

      // First call - before execution
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            id: 'tool-error',
            name: 'errorTool',
            args: {},
            status: 'executing',
            displayName: 'errorTool',
          }),
        ],
      );

      // Second call - after execution with error
      expect(mockChatRecordingService.recordToolCalls).toHaveBeenNthCalledWith(
        2,
        [
          expect.objectContaining({
            id: 'tool-error',
            name: 'errorTool',
            args: {},
            status: 'error',
            result: undefined,
            resultDisplay: 'Execution failed',
            displayName: 'errorTool',
          }),
        ],
      );
    });

    it('should handle missing usage metadata gracefully', async () => {
      const events: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Response' },
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: undefined },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

      expect(mockChatRecordingService.recordMessageTokens).toHaveBeenCalledWith(
        {
          input: 0,
          output: 0,
          cached: 0,
          thoughts: 0,
          tool: 0,
          total: 0,
        },
      );
    });
  });
});
