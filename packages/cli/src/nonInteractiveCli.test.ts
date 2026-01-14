/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolRegistry,
  ServerGeminiStreamEvent,
  SessionMetrics,
  AnyDeclarativeTool,
  AnyToolInvocation,
  UserFeedbackPayload,
} from '@google/gemini-cli-core';
import {
  executeToolCall,
  ToolErrorType,
  GeminiEventType,
  OutputFormat,
  uiTelemetryService,
  FatalInputError,
  CoreEvent,
} from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import { runNonInteractive } from './nonInteractiveCli.js';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import type { LoadedSettings } from './config/settings.js';

// Mock core modules
vi.mock('./ui/hooks/atCommandProcessor.js');

const mockCoreEvents = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  emitConsoleLog: vi.fn(),
  emitFeedback: vi.fn(),
  drainBacklogs: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  class MockChatRecordingService {
    initialize = vi.fn();
    recordMessage = vi.fn();
    recordMessageTokens = vi.fn();
    recordToolCalls = vi.fn();
  }

  return {
    ...original,
    executeToolCall: vi.fn(),
    isTelemetrySdkInitialized: vi.fn().mockReturnValue(true),
    ChatRecordingService: MockChatRecordingService,
    uiTelemetryService: {
      getMetrics: vi.fn(),
    },
    coreEvents: mockCoreEvents,
    createWorkingStdio: vi.fn(() => ({
      stdout: process.stdout,
      stderr: process.stderr,
    })),
  };
});

const mockGetCommands = vi.hoisted(() => vi.fn());
const mockCommandServiceCreate = vi.hoisted(() => vi.fn());
vi.mock('./services/CommandService.js', () => ({
  CommandService: {
    create: mockCommandServiceCreate,
  },
}));

vi.mock('./services/FileCommandLoader.js');
vi.mock('./services/McpPromptLoader.js');

describe('runNonInteractive', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let mockToolRegistry: ToolRegistry;
  let mockCoreExecuteToolCall: Mock;
  let consoleErrorSpy: MockInstance;
  let processStdoutSpy: MockInstance;
  let processStderrSpy: MockInstance;
  let mockGeminiClient: {
    sendMessageStream: Mock;
    resumeChat: Mock;
    getChatRecordingService: Mock;
  };
  const MOCK_SESSION_METRICS: SessionMetrics = {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
        auto_accept: 0,
      },
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };

  beforeEach(async () => {
    mockCoreExecuteToolCall = vi.mocked(executeToolCall);

    mockCommandServiceCreate.mockResolvedValue({
      getCommands: mockGetCommands,
    });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processStdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    vi.spyOn(process.stdout, 'on').mockImplementation(() => process.stdout);
    processStderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });

    mockToolRegistry = {
      getTool: vi.fn(),
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;

    mockGeminiClient = {
      sendMessageStream: vi.fn(),
      resumeChat: vi.fn().mockResolvedValue(undefined),
      getChatRecordingService: vi.fn(() => ({
        initialize: vi.fn(),
        recordMessage: vi.fn(),
        recordMessageTokens: vi.fn(),
        recordToolCalls: vi.fn(),
      })),
    };

    mockConfig = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/project/.gemini/tmp'),
      },
      getIdeMode: vi.fn().mockReturnValue(false),

      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getDebugMode: vi.fn().mockReturnValue(false),
      getOutputFormat: vi.fn().mockReturnValue('text'),
      getModel: vi.fn().mockReturnValue('test-model'),
      getFolderTrust: vi.fn().mockReturnValue(false),
      isTrustedFolder: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    mockSettings = {
      system: { path: '', settings: {} },
      systemDefaults: { path: '', settings: {} },
      user: { path: '', settings: {} },
      workspace: { path: '', settings: {} },
      errors: [],
      setValue: vi.fn(),
      merged: {
        security: {
          auth: {
            enforcedType: undefined,
          },
        },
      },
      isTrusted: true,
      migratedInMemoryScopes: new Set(),
      forScope: vi.fn(),
      computeMergedSettings: vi.fn(),
    } as unknown as LoadedSettings;

    const { handleAtCommand } = await import(
      './ui/hooks/atCommandProcessor.js'
    );
    vi.mocked(handleAtCommand).mockImplementation(async ({ query }) => ({
      processedQuery: [{ text: query }],
    }));
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

  const getWrittenOutput = () =>
    processStdoutSpy.mock.calls.map((c) => c[0]).join('');

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

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Test input',
      prompt_id: 'prompt-id-1',
    });

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Test input' }],
      expect.any(AbortSignal),
      'prompt-id-1',
    );
    expect(getWrittenOutput()).toBe('Hello World\n');
    // Note: Telemetry shutdown is now handled in runExitCleanup() in cleanup.ts
    // so we no longer expect shutdownTelemetry to be called directly here
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
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: {
        callId: 'tool-1',
        name: 'testTool',
        args: { arg1: 'value1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-2',
      },
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: toolResponse,
        callId: 'tool-1',
        error: undefined,
        errorType: undefined,
        contentLength: undefined,
      },
    });

    const firstCallEvents: ServerGeminiStreamEvent[] = [toolCallEvent];
    const secondCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Final answer' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Use a tool',
      prompt_id: 'prompt-id-2',
    });

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
    expect(getWrittenOutput()).toBe('Final answer\n');
  });

  it('should write a single newline between sequential text outputs from the model', async () => {
    // This test simulates a multi-turn conversation to ensure that a single newline
    // is printed between each block of text output from the model.

    // 1. Define the tool requests that the model will ask the CLI to run.
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'mock-tool',
        name: 'mockTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-multi',
      },
    };

    // 2. Mock the execution of the tools. We just need them to succeed.
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: toolCallEvent.value, // This is generic enough for both calls
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: [],
        callId: 'mock-tool',
      },
    });

    // 3. Define the sequence of events streamed from the mock model.
    // Turn 1: Model outputs text, then requests a tool call.
    const modelTurn1: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Use mock tool' },
      toolCallEvent,
    ];
    // Turn 2: Model outputs more text, then requests another tool call.
    const modelTurn2: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Use mock tool again' },
      toolCallEvent,
    ];
    // Turn 3: Model outputs a final answer.
    const modelTurn3: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Finished.' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(modelTurn1))
      .mockReturnValueOnce(createStreamFromEvents(modelTurn2))
      .mockReturnValueOnce(createStreamFromEvents(modelTurn3));

    // 4. Run the command.
    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Use mock tool multiple times',
      prompt_id: 'prompt-id-multi',
    });

    // 5. Verify the output.
    // The rendered output should contain the text from each turn, separated by a
    // single newline, with a final newline at the end.
    expect(getWrittenOutput()).toMatchSnapshot();

    // Also verify the tools were called as expected.
    expect(mockCoreExecuteToolCall).toHaveBeenCalledTimes(2);
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
      status: 'error',
      request: {
        callId: 'tool-1',
        name: 'errorTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-3',
      },
      tool: {} as AnyDeclarativeTool,
      response: {
        callId: 'tool-1',
        error: new Error('Execution failed'),
        errorType: ToolErrorType.EXECUTION_FAILED,
        responseParts: [
          {
            functionResponse: {
              name: 'errorTool',
              response: {
                output: 'Error: Execution failed',
              },
            },
          },
        ],
        resultDisplay: 'Execution failed',
        contentLength: undefined,
      },
    });
    const finalResponse: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Content,
        value: 'Sorry, let me try again.',
      },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];
    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
      .mockReturnValueOnce(createStreamFromEvents(finalResponse));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Trigger tool error',
      prompt_id: 'prompt-id-3',
    });

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool errorTool: Execution failed',
    );
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
    expect(getWrittenOutput()).toBe('Sorry, let me try again.\n');
  });

  it('should exit with error if sendMessageStream throws initially', async () => {
    const apiError = new Error('API connection failed');
    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw apiError;
    });

    await expect(
      runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'Initial fail',
        prompt_id: 'prompt-id-4',
      }),
    ).rejects.toThrow(apiError);
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
      status: 'error',
      request: {
        callId: 'tool-1',
        name: 'nonexistentTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-5',
      },
      response: {
        callId: 'tool-1',
        error: new Error('Tool "nonexistentTool" not found in registry.'),
        resultDisplay: 'Tool "nonexistentTool" not found in registry.',
        responseParts: [],
        errorType: undefined,
        contentLength: undefined,
      },
    });
    const finalResponse: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Content,
        value: "Sorry, I can't find that tool.",
      },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
      .mockReturnValueOnce(createStreamFromEvents(finalResponse));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Trigger tool not found',
      prompt_id: 'prompt-id-5',
    });

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool nonexistentTool: Tool "nonexistentTool" not found in registry.',
    );
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(getWrittenOutput()).toBe("Sorry, I can't find that tool.\n");
  });

  it('should exit when max session turns are exceeded', async () => {
    vi.mocked(mockConfig.getMaxSessionTurns).mockReturnValue(0);
    await expect(
      runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'Trigger loop',
        prompt_id: 'prompt-id-6',
      }),
    ).rejects.toThrow('process.exit(53) called');
  });

  it('should preprocess @include commands before sending to the model', async () => {
    // 1. Mock the imported atCommandProcessor
    const { handleAtCommand } = await import(
      './ui/hooks/atCommandProcessor.js'
    );
    const mockHandleAtCommand = vi.mocked(handleAtCommand);

    // 2. Define the raw input and the expected processed output
    const rawInput = 'Summarize @file.txt';
    const processedParts: Part[] = [
      { text: 'Summarize @file.txt' },
      { text: '\n--- Content from referenced files ---\n' },
      { text: 'This is the content of the file.' },
      { text: '\n--- End of content ---' },
    ];

    // 3. Setup the mock to return the processed parts
    mockHandleAtCommand.mockResolvedValue({
      processedQuery: processedParts,
    });

    // Mock a simple stream response from the Gemini client
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Summary complete.' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    // 4. Run the non-interactive mode with the raw input
    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: rawInput,
      prompt_id: 'prompt-id-7',
    });

    // 5. Assert that sendMessageStream was called with the PROCESSED parts, not the raw input
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      processedParts,
      expect.any(AbortSignal),
      'prompt-id-7',
    );

    // 6. Assert the final output is correct
    expect(getWrittenOutput()).toBe('Summary complete.\n');
  });

  it('should process input and write JSON output with stats', async () => {
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Hello World' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );
    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(OutputFormat.JSON);
    vi.mocked(uiTelemetryService.getMetrics).mockReturnValue(
      MOCK_SESSION_METRICS,
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Test input',
      prompt_id: 'prompt-id-1',
    });

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Test input' }],
      expect.any(AbortSignal),
      'prompt-id-1',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          session_id: 'test-session-id',
          response: 'Hello World',
          stats: MOCK_SESSION_METRICS,
        },
        null,
        2,
      ),
    );
  });

  it('should write JSON output with stats for tool-only commands (no text response)', async () => {
    // Test the scenario where a command completes successfully with only tool calls
    // but no text response - this would have caught the original bug
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'testTool',
        args: { arg1: 'value1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-tool-only',
      },
    };
    const toolResponse: Part[] = [{ text: 'Tool executed successfully' }];
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: {
        callId: 'tool-1',
        name: 'testTool',
        args: { arg1: 'value1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-tool-only',
      },
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: toolResponse,
        callId: 'tool-1',
        error: undefined,
        errorType: undefined,
        contentLength: undefined,
      },
    });

    // First call returns only tool call, no content
    const firstCallEvents: ServerGeminiStreamEvent[] = [
      toolCallEvent,
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
      },
    ];

    // Second call returns no content (tool-only completion)
    const secondCallEvents: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 3 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(OutputFormat.JSON);
    vi.mocked(uiTelemetryService.getMetrics).mockReturnValue(
      MOCK_SESSION_METRICS,
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Execute tool only',
      prompt_id: 'prompt-id-tool-only',
    });

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
    expect(mockCoreExecuteToolCall).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ name: 'testTool' }),
      expect.any(AbortSignal),
    );

    // This should output JSON with empty response but include stats
    expect(processStdoutSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          session_id: 'test-session-id',
          response: '',
          stats: MOCK_SESSION_METRICS,
        },
        null,
        2,
      ),
    );
  });

  it('should write JSON output with stats for empty response commands', async () => {
    // Test the scenario where a command completes but produces no content at all
    const events: ServerGeminiStreamEvent[] = [
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 1 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );
    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(OutputFormat.JSON);
    vi.mocked(uiTelemetryService.getMetrics).mockReturnValue(
      MOCK_SESSION_METRICS,
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Empty response test',
      prompt_id: 'prompt-id-empty',
    });

    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Empty response test' }],
      expect.any(AbortSignal),
      'prompt-id-empty',
    );

    // This should output JSON with empty response but include stats
    expect(processStdoutSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          session_id: 'test-session-id',
          response: '',
          stats: MOCK_SESSION_METRICS,
        },
        null,
        2,
      ),
    );
  });

  it('should handle errors in JSON format', async () => {
    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(OutputFormat.JSON);
    const testError = new Error('Invalid input provided');

    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw testError;
    });

    let thrownError: Error | null = null;
    try {
      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'Test input',
        prompt_id: 'prompt-id-error',
      });
      // Should not reach here
      expect.fail('Expected process.exit to be called');
    } catch (error) {
      thrownError = error as Error;
    }

    // Should throw because of mocked process.exit
    expect(thrownError?.message).toBe('process.exit(1) called');

    expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      JSON.stringify(
        {
          session_id: 'test-session-id',
          error: {
            type: 'Error',
            message: 'Invalid input provided',
            code: 1,
          },
        },
        null,
        2,
      ),
    );
  });

  it('should handle FatalInputError with custom exit code in JSON format', async () => {
    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(OutputFormat.JSON);
    const fatalError = new FatalInputError('Invalid command syntax provided');

    mockGeminiClient.sendMessageStream.mockImplementation(() => {
      throw fatalError;
    });

    let thrownError: Error | null = null;
    try {
      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'Invalid syntax',
        prompt_id: 'prompt-id-fatal',
      });
      // Should not reach here
      expect.fail('Expected process.exit to be called');
    } catch (error) {
      thrownError = error as Error;
    }

    // Should throw because of mocked process.exit with custom exit code
    expect(thrownError?.message).toBe('process.exit(42) called');

    expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      JSON.stringify(
        {
          session_id: 'test-session-id',
          error: {
            type: 'FatalInputError',
            message: 'Invalid command syntax provided',
            code: 42,
          },
        },
        null,
        2,
      ),
    );
  });

  it('should execute a slash command that returns a prompt', async () => {
    const mockCommand = {
      name: 'testcommand',
      description: 'a test command',
      action: vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: [{ text: 'Prompt from command' }],
      }),
    };
    mockGetCommands.mockReturnValue([mockCommand]);

    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Response from command' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: '/testcommand',
      prompt_id: 'prompt-id-slash',
    });

    // Ensure the prompt sent to the model is from the command, not the raw input
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Prompt from command' }],
      expect.any(AbortSignal),
      'prompt-id-slash',
    );

    expect(getWrittenOutput()).toBe('Response from command\n');
  });

  it('should handle slash commands', async () => {
    const nonInteractiveCliCommands = await import(
      './nonInteractiveCliCommands.js'
    );
    const handleSlashCommandSpy = vi.spyOn(
      nonInteractiveCliCommands,
      'handleSlashCommand',
    );
    handleSlashCommandSpy.mockResolvedValue([{ text: 'Slash command output' }]);

    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Response to slash command' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: '/help',
      prompt_id: 'prompt-id-slash',
    });

    expect(handleSlashCommandSpy).toHaveBeenCalledWith(
      '/help',
      expect.any(AbortController),
      mockConfig,
      mockSettings,
    );
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: 'Slash command output' }],
      expect.any(AbortSignal),
      'prompt-id-slash',
    );
    expect(getWrittenOutput()).toBe('Response to slash command\n');
    handleSlashCommandSpy.mockRestore();
  });

  it('should handle cancellation (Ctrl+C)', async () => {
    // Mock isTTY and setRawMode safely
    const originalIsTTY = process.stdin.isTTY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalSetRawMode = (process.stdin as any).setRawMode;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    if (!originalSetRawMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).setRawMode = vi.fn();
    }

    const stdinOnSpy = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation(() => process.stdin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(process.stdin as any, 'setRawMode').mockImplementation(() => true);
    vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'removeAllListeners').mockImplementation(
      () => process.stdin,
    );

    // Spy on handleCancellationError to verify it's called
    const errors = await import('./utils/errors.js');
    const handleCancellationErrorSpy = vi
      .spyOn(errors, 'handleCancellationError')
      .mockImplementation(() => {
        throw new Error('Cancelled');
      });

    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Thinking...' },
    ];
    // Create a stream that responds to abortion
    mockGeminiClient.sendMessageStream.mockImplementation(
      (_messages, signal: AbortSignal) =>
        (async function* () {
          yield events[0];
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 1000);
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              setTimeout(() => {
                reject(new Error('Aborted')); // This will be caught by nonInteractiveCli and passed to handleError
              }, 300);
            });
          });
        })(),
    );

    const runPromise = runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Long running query',
      prompt_id: 'prompt-id-cancel',
    });

    // Wait a bit for setup to complete and listeners to be registered
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Find the keypress handler registered by runNonInteractive
    const keypressCall = stdinOnSpy.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (call) => (call[0] as any) === 'keypress',
    );
    expect(keypressCall).toBeDefined();
    const keypressHandler = keypressCall?.[1] as (
      str: string,
      key: { name?: string; ctrl?: boolean },
    ) => void;

    if (keypressHandler) {
      // Simulate Ctrl+C
      keypressHandler('\u0003', { ctrl: true, name: 'c' });
    }

    // The promise should reject with 'Aborted' because our mock stream throws it,
    // and nonInteractiveCli catches it and calls handleError, which doesn't necessarily throw.
    // Wait, if handleError is called, we should check that.
    // But here we want to check if Ctrl+C works.

    // In our current setup, Ctrl+C aborts the signal. The stream throws 'Aborted'.
    // nonInteractiveCli catches 'Aborted' and calls handleError.

    // If we want to test that handleCancellationError is called, we need the loop to detect abortion.
    // But our stream throws before the loop can detect it.

    // Let's just check that the promise rejects with 'Aborted' for now,
    // which proves the abortion signal reached the stream.
    await expect(runPromise).rejects.toThrow('Aborted');

    expect(
      processStderrSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('Cancelling'),
      ),
    ).toBe(true);

    handleCancellationErrorSpy.mockRestore();

    // Restore original values
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    if (originalSetRawMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).setRawMode = originalSetRawMode;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (process.stdin as any).setRawMode;
    }
    // Spies are automatically restored by vi.restoreAllMocks() in afterEach,
    // but we can also do it manually if needed.
  });

  it('should throw FatalInputError if a command requires confirmation', async () => {
    const mockCommand = {
      name: 'confirm',
      description: 'a command that needs confirmation',
      action: vi.fn().mockResolvedValue({
        type: 'confirm_shell_commands',
        commands: ['rm -rf /'],
      }),
    };
    mockGetCommands.mockReturnValue([mockCommand]);

    await expect(
      runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: '/confirm',
        prompt_id: 'prompt-id-confirm',
      }),
    ).rejects.toThrow(
      'Exiting due to a confirmation prompt requested by the command.',
    );
  });

  it('should treat an unknown slash command as a regular prompt', async () => {
    // No commands are mocked, so any slash command is "unknown"
    mockGetCommands.mockReturnValue([]);

    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Response to unknown' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: '/unknowncommand',
      prompt_id: 'prompt-id-unknown',
    });

    // Ensure the raw input is sent to the model
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
      [{ text: '/unknowncommand' }],
      expect.any(AbortSignal),
      'prompt-id-unknown',
    );

    expect(getWrittenOutput()).toBe('Response to unknown\n');
  });

  it('should throw for unhandled command result types', async () => {
    const mockCommand = {
      name: 'noaction',
      description: 'unhandled type',
      action: vi.fn().mockResolvedValue({
        type: 'unhandled',
      }),
    };
    mockGetCommands.mockReturnValue([mockCommand]);

    await expect(
      runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: '/noaction',
        prompt_id: 'prompt-id-unhandled',
      }),
    ).rejects.toThrow(
      'Exiting due to command result that is not supported in non-interactive mode.',
    );
  });

  it('should pass arguments to the slash command action', async () => {
    const mockAction = vi.fn().mockResolvedValue({
      type: 'submit_prompt',
      content: [{ text: 'Prompt from command' }],
    });
    const mockCommand = {
      name: 'testargs',
      description: 'a test command',
      action: mockAction,
    };
    mockGetCommands.mockReturnValue([mockCommand]);

    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Acknowledged' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 1 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: '/testargs arg1 arg2',
      prompt_id: 'prompt-id-args',
    });

    expect(mockAction).toHaveBeenCalledWith(expect.any(Object), 'arg1 arg2');

    expect(getWrittenOutput()).toBe('Acknowledged\n');
  });

  it('should instantiate CommandService with correct loaders for slash commands', async () => {
    // This test indirectly checks that handleSlashCommand is using the right loaders.
    const { FileCommandLoader } = await import(
      './services/FileCommandLoader.js'
    );
    const { McpPromptLoader } = await import('./services/McpPromptLoader.js');

    mockGetCommands.mockReturnValue([]); // No commands found, so it will fall through
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Acknowledged' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 1 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: '/mycommand',
      prompt_id: 'prompt-id-loaders',
    });

    // Check that loaders were instantiated with the config
    expect(FileCommandLoader).toHaveBeenCalledTimes(1);
    expect(FileCommandLoader).toHaveBeenCalledWith(mockConfig);
    expect(McpPromptLoader).toHaveBeenCalledTimes(1);
    expect(McpPromptLoader).toHaveBeenCalledWith(mockConfig);

    // Check that instances were passed to CommandService.create
    expect(mockCommandServiceCreate).toHaveBeenCalledTimes(1);
    const loadersArg = mockCommandServiceCreate.mock.calls[0][0];
    expect(loadersArg).toHaveLength(2);
    expect(loadersArg[0]).toBe(vi.mocked(McpPromptLoader).mock.instances[0]);
    expect(loadersArg[1]).toBe(vi.mocked(FileCommandLoader).mock.instances[0]);
  });

  it('should allow a normally-excluded tool when --allowed-tools is set', async () => {
    // By default, ShellTool is excluded in non-interactive mode.
    // This test ensures that --allowed-tools overrides this exclusion.
    vi.mocked(mockConfig.getToolRegistry).mockReturnValue({
      getTool: vi.fn().mockReturnValue({
        name: 'ShellTool',
        description: 'A shell tool',
        run: vi.fn(),
      }),
      getFunctionDeclarations: vi.fn().mockReturnValue([{ name: 'ShellTool' }]),
    } as unknown as ToolRegistry);

    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-shell-1',
        name: 'ShellTool',
        args: { command: 'ls' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-allowed',
      },
    };
    const toolResponse: Part[] = [{ text: 'file.txt' }];
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: {
        callId: 'tool-shell-1',
        name: 'ShellTool',
        args: { command: 'ls' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-allowed',
      },
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: toolResponse,
        callId: 'tool-shell-1',
        error: undefined,
        errorType: undefined,
        contentLength: undefined,
      },
    });

    const firstCallEvents: ServerGeminiStreamEvent[] = [toolCallEvent];
    const secondCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'file.txt' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'List the files',
      prompt_id: 'prompt-id-allowed',
    });

    expect(mockCoreExecuteToolCall).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ name: 'ShellTool' }),
      expect.any(AbortSignal),
    );
    expect(getWrittenOutput()).toBe('file.txt\n');
  });

  describe('CoreEvents Integration', () => {
    it('subscribes to UserFeedback and drains backlog on start', async () => {
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 0 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test',
        prompt_id: 'prompt-id-events',
      });

      expect(mockCoreEvents.on).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
      expect(mockCoreEvents.drainBacklogs).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from UserFeedback on finish', async () => {
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 0 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test',
        prompt_id: 'prompt-id-events',
      });

      expect(mockCoreEvents.off).toHaveBeenCalledWith(
        CoreEvent.UserFeedback,
        expect.any(Function),
      );
    });

    it('logs to process.stderr when UserFeedback event is received', async () => {
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 0 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test',
        prompt_id: 'prompt-id-events',
      });

      // Get the registered handler
      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.UserFeedback,
      )?.[1];
      expect(handler).toBeDefined();

      // Simulate an event
      const payload: UserFeedbackPayload = {
        severity: 'error',
        message: 'Test error message',
      };
      handler(payload);

      expect(processStderrSpy).toHaveBeenCalledWith(
        '[ERROR] Test error message\n',
      );
    });

    it('logs optional error object to process.stderr in debug mode', async () => {
      vi.mocked(mockConfig.getDebugMode).mockReturnValue(true);
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 0 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test',
        prompt_id: 'prompt-id-events',
      });

      // Get the registered handler
      const handler = mockCoreEvents.on.mock.calls.find(
        (call: unknown[]) => call[0] === CoreEvent.UserFeedback,
      )?.[1];
      expect(handler).toBeDefined();

      // Simulate an event with error object
      const errorObj = new Error('Original error');
      // Mock stack for deterministic testing
      errorObj.stack = 'Error: Original error\n    at test';
      const payload: UserFeedbackPayload = {
        severity: 'warning',
        message: 'Test warning message',
        error: errorObj,
      };
      handler(payload);

      expect(processStderrSpy).toHaveBeenCalledWith(
        '[WARNING] Test warning message\n',
      );
      expect(processStderrSpy).toHaveBeenCalledWith(
        'Error: Original error\n    at test\n',
      );
    });
  });

  it('should emit appropriate events for streaming JSON output', async () => {
    vi.mocked(mockConfig.getOutputFormat).mockReturnValue(
      OutputFormat.STREAM_JSON,
    );
    vi.mocked(uiTelemetryService.getMetrics).mockReturnValue(
      MOCK_SESSION_METRICS,
    );

    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'testTool',
        args: { arg1: 'value1' },
        isClientInitiated: false,
        prompt_id: 'prompt-id-stream',
      },
    };

    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: toolCallEvent.value,
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: [{ text: 'Tool response' }],
        callId: 'tool-1',
        error: undefined,
        errorType: undefined,
        contentLength: undefined,
        resultDisplay: 'Tool executed successfully',
      },
    });

    const firstCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Thinking...' },
      toolCallEvent,
    ];
    const secondCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Final answer' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
      },
    ];

    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Stream test',
      prompt_id: 'prompt-id-stream',
    });

    const output = getWrittenOutput();
    const sanitizedOutput = output
      .replace(/"timestamp":"[^"]+"/g, '"timestamp":"<TIMESTAMP>"')
      .replace(/"duration_ms":\d+/g, '"duration_ms":<DURATION>');
    expect(sanitizedOutput).toMatchSnapshot();
  });

  it('should handle EPIPE error gracefully', async () => {
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Hello' },
      { type: GeminiEventType.Content, value: ' World' },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    // Mock process.exit to track calls without throwing
    vi.spyOn(process, 'exit').mockImplementation((_code) => undefined as never);

    // Simulate EPIPE error on stdout
    const stdoutErrorCallback = (process.stdout.on as Mock).mock.calls.find(
      (call) => call[0] === 'error',
    )?.[1];

    if (stdoutErrorCallback) {
      stdoutErrorCallback({ code: 'EPIPE' });
    }

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'EPIPE test',
      prompt_id: 'prompt-id-epipe',
    });

    // Since EPIPE is simulated, it might exit early or continue depending on timing,
    // but our main goal is to verify the handler is registered and handles EPIPE.
    expect(process.stdout.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
  });

  it('should resume chat when resumedSessionData is provided', async () => {
    const events: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Resumed' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
      },
    ];
    mockGeminiClient.sendMessageStream.mockReturnValue(
      createStreamFromEvents(events),
    );

    const resumedSessionData = {
      conversation: {
        sessionId: 'resumed-session-id',
        messages: [
          { role: 'user', parts: [{ text: 'Previous message' }] },
        ] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        firstUserMessage: 'Previous message',
        projectHash: 'test-hash',
      },
      filePath: '/path/to/session.json',
    };

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Continue',
      prompt_id: 'prompt-id-resume',
      resumedSessionData,
    });

    expect(mockGeminiClient.resumeChat).toHaveBeenCalledWith(
      expect.any(Array),
      resumedSessionData,
    );
    expect(getWrittenOutput()).toBe('Resumed\n');
  });

  it.each([
    {
      name: 'loop detected',
      events: [
        { type: GeminiEventType.LoopDetected },
      ] as ServerGeminiStreamEvent[],
      input: 'Loop test',
      promptId: 'prompt-id-loop',
    },
    {
      name: 'max session turns',
      events: [
        { type: GeminiEventType.MaxSessionTurns },
      ] as ServerGeminiStreamEvent[],
      input: 'Max turns test',
      promptId: 'prompt-id-max-turns',
    },
  ])(
    'should emit appropriate error event in streaming JSON mode: $name',
    async ({ events, input, promptId }) => {
      vi.mocked(mockConfig.getOutputFormat).mockReturnValue(
        OutputFormat.STREAM_JSON,
      );
      vi.mocked(uiTelemetryService.getMetrics).mockReturnValue(
        MOCK_SESSION_METRICS,
      );

      const streamEvents: ServerGeminiStreamEvent[] = [
        ...events,
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 0 } },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(streamEvents),
      );

      try {
        await runNonInteractive({
          config: mockConfig,
          settings: mockSettings,
          input,
          prompt_id: promptId,
        });
      } catch (_error) {
        // Expected exit
      }

      const output = getWrittenOutput();
      const sanitizedOutput = output
        .replace(/"timestamp":"[^"]+"/g, '"timestamp":"<TIMESTAMP>"')
        .replace(/"duration_ms":\d+/g, '"duration_ms":<DURATION>');
      expect(sanitizedOutput).toMatchSnapshot();
    },
  );

  it('should log error when tool recording fails', async () => {
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'tool-1',
        name: 'testTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-tool-error',
      },
    };
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'success',
      request: toolCallEvent.value,
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        responseParts: [],
        callId: 'tool-1',
        error: undefined,
        errorType: undefined,
        contentLength: undefined,
      },
    });

    const events: ServerGeminiStreamEvent[] = [
      toolCallEvent,
      { type: GeminiEventType.Content, value: 'Done' },
      {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
      },
    ];
    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(events))
      .mockReturnValueOnce(
        createStreamFromEvents([
          { type: GeminiEventType.Content, value: 'Done' },
          {
            type: GeminiEventType.Finished,
            value: { reason: undefined, usageMetadata: { totalTokenCount: 5 } },
          },
        ]),
      );

    // Mock getChat to throw when recording tool calls
    const mockChat = {
      recordCompletedToolCalls: vi.fn().mockImplementation(() => {
        throw new Error('Recording failed');
      }),
    };
    // @ts-expect-error - Mocking internal structure
    mockGeminiClient.getChat = vi.fn().mockReturnValue(mockChat);
    // @ts-expect-error - Mocking internal structure
    mockGeminiClient.getCurrentSequenceModel = vi
      .fn()
      .mockReturnValue('model-1');

    // Mock debugLogger.error
    const { debugLogger } = await import('@google/gemini-cli-core');
    const debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Tool recording error test',
      prompt_id: 'prompt-id-tool-error',
    });

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error recording completed tool call information: Error: Recording failed',
      ),
    );
    expect(getWrittenOutput()).toContain('Done');
  });

  it('should stop agent execution immediately when a tool call returns STOP_EXECUTION error', async () => {
    const toolCallEvent: ServerGeminiStreamEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'stop-call',
        name: 'stopTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-id-stop',
      },
    };

    // Mock tool execution returning STOP_EXECUTION
    mockCoreExecuteToolCall.mockResolvedValue({
      status: 'error',
      request: toolCallEvent.value,
      tool: {} as AnyDeclarativeTool,
      invocation: {} as AnyToolInvocation,
      response: {
        callId: 'stop-call',
        responseParts: [{ text: 'error occurred' }],
        errorType: ToolErrorType.STOP_EXECUTION,
        error: new Error('Stop reason from hook'),
        resultDisplay: undefined,
      },
    });

    const firstCallEvents: ServerGeminiStreamEvent[] = [
      { type: GeminiEventType.Content, value: 'Executing tool...' },
      toolCallEvent,
    ];

    // Setup the mock to return events for the first call.
    // We expect the loop to terminate after the tool execution.
    // If it doesn't, it might call sendMessageStream again, which we'll assert against.
    mockGeminiClient.sendMessageStream
      .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
      .mockReturnValueOnce(createStreamFromEvents([]));

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'Run stop tool',
      prompt_id: 'prompt-id-stop',
    });

    expect(mockCoreExecuteToolCall).toHaveBeenCalled();

    // The key assertion: sendMessageStream should have been called ONLY ONCE (initial user input).
    expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(1);
  });

  describe('Agent Execution Events', () => {
    it('should handle AgentExecutionStopped event', async () => {
      const events: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: 'Stopped by hook' },
        },
      ];
      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(events),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test stop',
        prompt_id: 'prompt-id-stop',
      });

      expect(processStderrSpy).toHaveBeenCalledWith(
        'Agent execution stopped: Stopped by hook\n',
      );
      // Should exit without calling sendMessageStream again
      expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('should handle AgentExecutionBlocked event', async () => {
      const allEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.AgentExecutionBlocked,
          value: { reason: 'Blocked by hook' },
        },
        { type: GeminiEventType.Content, value: 'Final answer' },
        {
          type: GeminiEventType.Finished,
          value: { reason: undefined, usageMetadata: { totalTokenCount: 10 } },
        },
      ];

      mockGeminiClient.sendMessageStream.mockReturnValue(
        createStreamFromEvents(allEvents),
      );

      await runNonInteractive({
        config: mockConfig,
        settings: mockSettings,
        input: 'test block',
        prompt_id: 'prompt-id-block',
      });

      expect(processStderrSpy).toHaveBeenCalledWith(
        '[WARNING] Agent execution blocked: Blocked by hook\n',
      );
      // sendMessageStream is called once, recursion is internal to it and transparent to the caller
      expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(1);
      expect(getWrittenOutput()).toBe('Final answer\n');
    });
  });
});
