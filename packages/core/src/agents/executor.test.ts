/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentExecutor, type ActivityCallback } from './executor.js';
import type {
  AgentDefinition,
  AgentInputs,
  SubagentActivityEvent,
  OutputConfig,
} from './types.js';
import { AgentTerminateMode } from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import {
  GeminiChat,
  StreamEventType,
  type StreamEvent,
} from '../core/geminiChat.js';
import {
  type FunctionCall,
  type Part,
  type GenerateContentResponse,
  type GenerateContentConfig,
} from '@google/genai';
import type { Config } from '../config/config.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { getDirectoryContextString } from '../utils/environmentContext.js';
import { z } from 'zod';

const { mockSendMessageStream, mockExecuteToolCall } = vi.hoisted(() => ({
  mockSendMessageStream: vi.fn(),
  mockExecuteToolCall: vi.fn(),
}));

vi.mock('../core/geminiChat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/geminiChat.js')>();
  return {
    ...actual,
    GeminiChat: vi.fn().mockImplementation(() => ({
      sendMessageStream: mockSendMessageStream,
    })),
  };
});

vi.mock('../core/nonInteractiveToolExecutor.js', () => ({
  executeToolCall: mockExecuteToolCall,
}));

vi.mock('../utils/environmentContext.js');

const MockedGeminiChat = vi.mocked(GeminiChat);
const mockedGetDirectoryContextString = vi.mocked(getDirectoryContextString);

// Constants for testing
const TASK_COMPLETE_TOOL_NAME = 'complete_task';
const MOCK_TOOL_NOT_ALLOWED = new MockTool({ name: 'write_file_interactive' });

/**
 * Helper to create a mock API response chunk.
 * Uses conditional spread to handle readonly functionCalls property safely.
 */
const createMockResponseChunk = (
  parts: Part[],
  functionCalls?: FunctionCall[],
): GenerateContentResponse =>
  ({
    candidates: [{ index: 0, content: { role: 'model', parts } }],
    ...(functionCalls && functionCalls.length > 0 ? { functionCalls } : {}),
  }) as unknown as GenerateContentResponse;

/**
 * Helper to mock a single turn of model response in the stream.
 */
const mockModelResponse = (
  functionCalls: FunctionCall[],
  thought?: string,
  text?: string,
) => {
  const parts: Part[] = [];
  if (thought) {
    parts.push({
      text: `**${thought}** This is the reasoning part.`,
      thought: true,
    });
  }
  if (text) parts.push({ text });

  const responseChunk = createMockResponseChunk(parts, functionCalls);

  mockSendMessageStream.mockImplementationOnce(async () =>
    (async function* () {
      yield {
        type: StreamEventType.CHUNK,
        value: responseChunk,
      } as StreamEvent;
    })(),
  );
};

/**
 * Helper to extract the message parameters sent to sendMessageStream.
 * Provides type safety for inspecting mock calls.
 */
const getMockMessageParams = (callIndex: number) => {
  const call = mockSendMessageStream.mock.calls[callIndex];
  expect(call).toBeDefined();
  // Arg 1 of sendMessageStream is the message parameters
  return call[1] as { message?: Part[]; config?: GenerateContentConfig };
};

let mockConfig: Config;
let parentToolRegistry: ToolRegistry;

/**
 * Type-safe helper to create agent definitions for tests.
 */
const createTestDefinition = <TOutput extends z.ZodTypeAny>(
  tools: Array<string | MockTool> = [LSTool.Name],
  runConfigOverrides: Partial<AgentDefinition<TOutput>['runConfig']> = {},
  outputConfigMode: 'default' | 'none' = 'default',
  schema: TOutput = z.string() as unknown as TOutput,
): AgentDefinition<TOutput> => {
  let outputConfig: OutputConfig<TOutput> | undefined;

  if (outputConfigMode === 'default') {
    outputConfig = {
      outputName: 'finalResult',
      description: 'The final result.',
      schema,
    };
  }

  return {
    name: 'TestAgent',
    description: 'An agent for testing.',
    inputConfig: {
      inputs: { goal: { type: 'string', required: true, description: 'goal' } },
    },
    modelConfig: { model: 'gemini-test-model', temp: 0, top_p: 1 },
    runConfig: { max_time_minutes: 5, max_turns: 5, ...runConfigOverrides },
    promptConfig: { systemPrompt: 'Achieve the goal: ${goal}.' },
    toolConfig: { tools },
    outputConfig,
  };
};

describe('AgentExecutor', () => {
  let activities: SubagentActivityEvent[];
  let onActivity: ActivityCallback;
  let abortController: AbortController;
  let signal: AbortSignal;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockSendMessageStream.mockReset();
    mockExecuteToolCall.mockReset();

    MockedGeminiChat.mockImplementation(
      () =>
        ({
          sendMessageStream: mockSendMessageStream,
        }) as unknown as GeminiChat,
    );

    vi.useFakeTimers();

    mockConfig = makeFakeConfig();
    parentToolRegistry = new ToolRegistry(mockConfig);
    parentToolRegistry.registerTool(new LSTool(mockConfig));
    parentToolRegistry.registerTool(new ReadFileTool(mockConfig));
    parentToolRegistry.registerTool(MOCK_TOOL_NOT_ALLOWED);

    vi.spyOn(mockConfig, 'getToolRegistry').mockResolvedValue(
      parentToolRegistry,
    );

    mockedGetDirectoryContextString.mockResolvedValue(
      'Mocked Environment Context',
    );

    activities = [];
    onActivity = (activity) => activities.push(activity);
    abortController = new AbortController();
    signal = abortController.signal;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create (Initialization and Validation)', () => {
    it('should create successfully with allowed tools', async () => {
      const definition = createTestDefinition([LSTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('SECURITY: should throw if a tool is not on the non-interactive allowlist', async () => {
      const definition = createTestDefinition([MOCK_TOOL_NOT_ALLOWED.name]);
      await expect(
        AgentExecutor.create(definition, mockConfig, onActivity),
      ).rejects.toThrow(/not on the allow-list for non-interactive execution/);
    });

    it('should create an isolated ToolRegistry for the agent', async () => {
      const definition = createTestDefinition([LSTool.Name, ReadFileTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const agentRegistry = executor['toolRegistry'] as ToolRegistry;

      expect(agentRegistry).not.toBe(parentToolRegistry);
      expect(agentRegistry.getAllToolNames()).toEqual(
        expect.arrayContaining([LSTool.Name, ReadFileTool.Name]),
      );
      expect(agentRegistry.getAllToolNames()).toHaveLength(2);
      expect(agentRegistry.getTool(MOCK_TOOL_NOT_ALLOWED.name)).toBeUndefined();
    });
  });

  describe('run (Execution Loop and Logic)', () => {
    it('should execute successfully when model calls complete_task with output (Happy Path with Output)', async () => {
      const definition = createTestDefinition();
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      const inputs: AgentInputs = { goal: 'Find files' };

      // Turn 1: Model calls ls
      mockModelResponse(
        [{ name: LSTool.Name, args: { path: '.' }, id: 'call1' }],
        'T1: Listing',
      );
      mockExecuteToolCall.mockResolvedValueOnce({
        callId: 'call1',
        resultDisplay: 'file1.txt',
        responseParts: [
          {
            functionResponse: {
              name: LSTool.Name,
              response: { result: 'file1.txt' },
              id: 'call1',
            },
          },
        ],
        error: undefined,
      });

      // Turn 2: Model calls complete_task with required output
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Found file1.txt' },
            id: 'call2',
          },
        ],
        'T2: Done',
      );

      const output = await executor.run(inputs, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      const chatConstructorArgs = MockedGeminiChat.mock.calls[0];
      const chatConfig = chatConstructorArgs[1];
      expect(chatConfig?.systemInstruction).toContain(
        `MUST call the \`${TASK_COMPLETE_TOOL_NAME}\` tool`,
      );

      const turn1Params = getMockMessageParams(0);

      const firstToolGroup = turn1Params.config?.tools?.[0];
      expect(firstToolGroup).toBeDefined();

      if (!firstToolGroup || !('functionDeclarations' in firstToolGroup)) {
        throw new Error(
          'Test expectation failed: Config does not contain functionDeclarations.',
        );
      }

      const sentTools = firstToolGroup.functionDeclarations;
      expect(sentTools).toBeDefined();

      expect(sentTools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: LSTool.Name }),
          expect.objectContaining({ name: TASK_COMPLETE_TOOL_NAME }),
        ]),
      );

      const completeToolDef = sentTools!.find(
        (t) => t.name === TASK_COMPLETE_TOOL_NAME,
      );
      expect(completeToolDef?.parameters?.required).toContain('finalResult');

      expect(output.result).toBe('Found file1.txt');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);

      expect(activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'THOUGHT_CHUNK',
            data: { text: 'T1: Listing' },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_END',
            data: { name: LSTool.Name, output: 'file1.txt' },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_START',
            data: {
              name: TASK_COMPLETE_TOOL_NAME,
              args: { finalResult: 'Found file1.txt' },
            },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_END',
            data: {
              name: TASK_COMPLETE_TOOL_NAME,
              output: expect.stringContaining('Output submitted'),
            },
          }),
        ]),
      );
    });

    it('should execute successfully when model calls complete_task without output (Happy Path No Output)', async () => {
      const definition = createTestDefinition([LSTool.Name], {}, 'none');
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        { name: LSTool.Name, args: { path: '.' }, id: 'call1' },
      ]);
      mockExecuteToolCall.mockResolvedValueOnce({
        callId: 'call1',
        resultDisplay: 'ok',
        responseParts: [
          {
            functionResponse: { name: LSTool.Name, response: {}, id: 'call1' },
          },
        ],
      });

      mockModelResponse(
        [{ name: TASK_COMPLETE_TOOL_NAME, args: {}, id: 'call2' }],
        'Task finished.',
      );

      const output = await executor.run({ goal: 'Do work' }, signal);

      const turn1Params = getMockMessageParams(0);
      const firstToolGroup = turn1Params.config?.tools?.[0];

      expect(firstToolGroup).toBeDefined();
      if (!firstToolGroup || !('functionDeclarations' in firstToolGroup)) {
        throw new Error(
          'Test expectation failed: Config does not contain functionDeclarations.',
        );
      }

      const sentTools = firstToolGroup.functionDeclarations;
      expect(sentTools).toBeDefined();

      const completeToolDef = sentTools!.find(
        (t) => t.name === TASK_COMPLETE_TOOL_NAME,
      );
      expect(completeToolDef?.parameters?.required).toEqual([]);
      expect(completeToolDef?.description).toContain(
        'signal that you have completed',
      );

      expect(output.result).toBe('Task completed successfully.');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
    });

    it('should error immediately if the model stops tools without calling complete_task (Protocol Violation)', async () => {
      const definition = createTestDefinition();
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        { name: LSTool.Name, args: { path: '.' }, id: 'call1' },
      ]);
      mockExecuteToolCall.mockResolvedValueOnce({
        callId: 'call1',
        resultDisplay: 'ok',
        responseParts: [
          {
            functionResponse: { name: LSTool.Name, response: {}, id: 'call1' },
          },
        ],
      });

      mockModelResponse([], 'I think I am done.');

      const output = await executor.run({ goal: 'Strict test' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      const expectedError = `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}' to finalize the session.`;

      expect(output.terminate_reason).toBe(AgentTerminateMode.ERROR);
      expect(output.result).toBe(expectedError);

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'protocol_violation',
            error: expectedError,
          }),
        }),
      );
    });

    it('should report an error if complete_task is called with missing required arguments', async () => {
      const definition = createTestDefinition();
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Missing arg
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { wrongArg: 'oops' },
          id: 'call1',
        },
      ]);

      // Turn 2: Corrected
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'Corrected result' },
          id: 'call2',
        },
      ]);

      const output = await executor.run({ goal: 'Error test' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      const expectedError =
        "Missing required argument 'finalResult' for completion.";

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: {
            context: 'tool_call',
            name: TASK_COMPLETE_TOOL_NAME,
            error: expectedError,
          },
        }),
      );

      const turn2Params = getMockMessageParams(1);
      const turn2Parts = turn2Params.message;
      expect(turn2Parts).toBeDefined();
      expect(turn2Parts).toHaveLength(1);

      expect(turn2Parts![0]).toEqual(
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            name: TASK_COMPLETE_TOOL_NAME,
            response: { error: expectedError },
            id: 'call1',
          }),
        }),
      );

      expect(output.result).toBe('Corrected result');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
    });

    it('should handle multiple calls to complete_task in the same turn (accept first, block rest)', async () => {
      const definition = createTestDefinition([], {}, 'none');
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Duplicate calls
      mockModelResponse([
        { name: TASK_COMPLETE_TOOL_NAME, args: {}, id: 'call1' },
        { name: TASK_COMPLETE_TOOL_NAME, args: {}, id: 'call2' },
      ]);

      const output = await executor.run({ goal: 'Dup test' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);

      const completions = activities.filter(
        (a) =>
          a.type === 'TOOL_CALL_END' &&
          a.data['name'] === TASK_COMPLETE_TOOL_NAME,
      );
      const errors = activities.filter(
        (a) => a.type === 'ERROR' && a.data['name'] === TASK_COMPLETE_TOOL_NAME,
      );

      expect(completions).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].data['error']).toContain(
        'Task already marked complete in this turn',
      );
    });

    it('should execute parallel tool calls and then complete', async () => {
      const definition = createTestDefinition([LSTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const call1: FunctionCall = {
        name: LSTool.Name,
        args: { path: '/a' },
        id: 'c1',
      };
      const call2: FunctionCall = {
        name: LSTool.Name,
        args: { path: '/b' },
        id: 'c2',
      };

      // Turn 1: Parallel calls
      mockModelResponse([call1, call2]);

      // Concurrency mock
      let callsStarted = 0;
      let resolveCalls: () => void;
      const bothStarted = new Promise<void>((r) => {
        resolveCalls = r;
      });

      mockExecuteToolCall.mockImplementation(async (_ctx, reqInfo) => {
        callsStarted++;
        if (callsStarted === 2) resolveCalls();
        await vi.advanceTimersByTimeAsync(100);
        return {
          callId: reqInfo.callId,
          resultDisplay: 'ok',
          responseParts: [
            {
              functionResponse: {
                name: reqInfo.name,
                response: {},
                id: reqInfo.callId,
              },
            },
          ],
        };
      });

      // Turn 2: Completion
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'done' },
          id: 'c3',
        },
      ]);

      const runPromise = executor.run({ goal: 'Parallel' }, signal);

      await vi.advanceTimersByTimeAsync(1);
      await bothStarted;
      await vi.advanceTimersByTimeAsync(150);
      await vi.advanceTimersByTimeAsync(1);

      const output = await runPromise;

      expect(mockExecuteToolCall).toHaveBeenCalledTimes(2);
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);

      // Safe access to message parts
      const turn2Params = getMockMessageParams(1);
      const parts = turn2Params.message;
      expect(parts).toBeDefined();
      expect(parts).toHaveLength(2);
      expect(parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            functionResponse: expect.objectContaining({ id: 'c1' }),
          }),
          expect.objectContaining({
            functionResponse: expect.objectContaining({ id: 'c2' }),
          }),
        ]),
      );
    });

    it('SECURITY: should block unauthorized tools and provide explicit failure to model', async () => {
      const definition = createTestDefinition([LSTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Model tries to use a tool not in its config
      const badCallId = 'bad_call_1';
      mockModelResponse([
        {
          name: ReadFileTool.Name,
          args: { path: 'secret.txt' },
          id: badCallId,
        },
      ]);

      // Turn 2: Model gives up and completes
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'Could not read file.' },
          id: 'c2',
        },
      ]);

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await executor.run({ goal: 'Sec test' }, signal);

      // Verify external executor was not called (Security held)
      expect(mockExecuteToolCall).not.toHaveBeenCalled();

      // 2. Verify console warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[AgentExecutor] Blocked call:`),
      );
      consoleWarnSpy.mockRestore();

      // Verify specific error was sent back to model
      const turn2Params = getMockMessageParams(1);
      const parts = turn2Params.message;
      expect(parts).toBeDefined();
      expect(parts![0]).toEqual(
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            id: badCallId,
            name: ReadFileTool.Name,
            response: {
              error: expect.stringContaining('Unauthorized tool call'),
            },
          }),
        }),
      );

      // Verify Activity Stream reported the error
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'tool_call_unauthorized',
            name: ReadFileTool.Name,
          }),
        }),
      );
    });
  });

  describe('run (Termination Conditions)', () => {
    const mockWorkResponse = (id: string) => {
      mockModelResponse([{ name: LSTool.Name, args: { path: '.' }, id }]);
      mockExecuteToolCall.mockResolvedValueOnce({
        callId: id,
        resultDisplay: 'ok',
        responseParts: [
          { functionResponse: { name: LSTool.Name, response: {}, id } },
        ],
      });
    };

    it('should terminate when max_turns is reached', async () => {
      const MAX = 2;
      const definition = createTestDefinition([LSTool.Name], {
        max_turns: MAX,
      });
      const executor = await AgentExecutor.create(definition, mockConfig);

      mockWorkResponse('t1');
      mockWorkResponse('t2');

      const output = await executor.run({ goal: 'Turns test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.MAX_TURNS);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(MAX);
    });

    it('should terminate if timeout is reached', async () => {
      const definition = createTestDefinition([LSTool.Name], {
        max_time_minutes: 1,
      });
      const executor = await AgentExecutor.create(definition, mockConfig);

      mockModelResponse([{ name: LSTool.Name, args: { path: '.' }, id: 't1' }]);

      // Long running tool
      mockExecuteToolCall.mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(61 * 1000);
        return {
          callId: 't1',
          resultDisplay: 'ok',
          responseParts: [],
        };
      });

      const output = await executor.run({ goal: 'Timeout test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.TIMEOUT);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('should terminate when AbortSignal is triggered', async () => {
      const definition = createTestDefinition();
      const executor = await AgentExecutor.create(definition, mockConfig);

      mockSendMessageStream.mockImplementationOnce(async () =>
        (async function* () {
          yield {
            type: StreamEventType.CHUNK,
            value: createMockResponseChunk([
              { text: 'Thinking...', thought: true },
            ]),
          } as StreamEvent;
          abortController.abort();
        })(),
      );

      const output = await executor.run({ goal: 'Abort test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.ABORTED);
    });
  });
});
