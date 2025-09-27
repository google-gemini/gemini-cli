/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedClass,
} from 'vitest';
import { AgentExecutor, type ActivityCallback } from './executor.js';
import type {
  AgentDefinition,
  AgentInputs,
  SubagentActivityEvent,
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
import type {
  FunctionCall,
  Part,
  GenerateContentResponse,
} from '@google/genai';
import type { Config } from '../config/config.js';
import { MockTool } from '../test-utils/mock-tool.js';

const { mockSendMessageStream, mockExecuteToolCall } = vi.hoisted(() => ({
  mockSendMessageStream: vi.fn(),
  mockExecuteToolCall: vi.fn(),
}));

vi.mock('../core/geminiChat.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    GeminiChat: vi.fn().mockImplementation(() => ({
      sendMessageStream: mockSendMessageStream,
    })),
  };
});

vi.mock('../core/nonInteractiveToolExecutor.js', () => ({
  executeToolCall: mockExecuteToolCall,
}));

const MockedGeminiChat = GeminiChat as MockedClass<typeof GeminiChat>;

// A mock tool that is NOT on the NON_INTERACTIVE_TOOL_ALLOWLIST
const MOCK_TOOL_NOT_ALLOWED = new MockTool({ name: 'write_file' });

const createMockResponseChunk = (
  parts: Part[],
  functionCalls?: FunctionCall[],
): GenerateContentResponse =>
  ({
    candidates: [{ index: 0, content: { role: 'model', parts } }],
    functionCalls,
  }) as unknown as GenerateContentResponse;

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

  const responseChunk = createMockResponseChunk(
    parts,
    // Ensure functionCalls is undefined if the array is empty, matching API behavior
    functionCalls.length > 0 ? functionCalls : undefined,
  );

  mockSendMessageStream.mockImplementationOnce(async () =>
    (async function* () {
      yield {
        type: StreamEventType.CHUNK,
        value: responseChunk,
      } as StreamEvent;
    })(),
  );
};

let mockConfig: Config;
let parentToolRegistry: ToolRegistry;

const createTestDefinition = (
  tools: Array<string | MockTool> = [LSTool.Name],
  runConfigOverrides: Partial<AgentDefinition['runConfig']> = {},
  outputConfigOverrides: Partial<AgentDefinition['outputConfig']> = {},
): AgentDefinition => ({
  name: 'TestAgent',
  description: 'An agent for testing.',
  inputConfig: {
    inputs: { goal: { type: 'string', required: true, description: 'goal' } },
  },
  modelConfig: { model: 'gemini-test-model', temp: 0, top_p: 1 },
  runConfig: { max_time_minutes: 5, max_turns: 5, ...runConfigOverrides },
  promptConfig: { systemPrompt: 'Achieve the goal: ${goal}.' },
  toolConfig: { tools },
  outputConfig: { description: 'The final result.', ...outputConfigOverrides },
});

describe('AgentExecutor', () => {
  let activities: SubagentActivityEvent[];
  let onActivity: ActivityCallback;
  let abortController: AbortController;
  let signal: AbortSignal;

  beforeEach(async () => {
    mockSendMessageStream.mockClear();
    mockExecuteToolCall.mockClear();
    vi.clearAllMocks();
    // Use fake timers for timeout and concurrency testing
    vi.useFakeTimers();

    mockConfig = makeFakeConfig();
    parentToolRegistry = new ToolRegistry(mockConfig);
    parentToolRegistry.registerTool(new LSTool(mockConfig));
    parentToolRegistry.registerTool(new ReadFileTool(mockConfig));
    parentToolRegistry.registerTool(MOCK_TOOL_NOT_ALLOWED);

    vi.spyOn(mockConfig, 'getToolRegistry').mockResolvedValue(
      parentToolRegistry,
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
      ).rejects.toThrow(
        `Tool "${MOCK_TOOL_NOT_ALLOWED.name}" is not on the allow-list for non-interactive execution`,
      );
    });

    it('should create an isolated ToolRegistry for the agent', async () => {
      const definition = createTestDefinition([LSTool.Name, ReadFileTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      // @ts-expect-error - accessing private property for test validation
      const agentRegistry = executor.toolRegistry as ToolRegistry;

      expect(agentRegistry).not.toBe(parentToolRegistry);
      expect(agentRegistry.getAllToolNames()).toEqual(
        expect.arrayContaining([LSTool.Name, ReadFileTool.Name]),
      );
      expect(agentRegistry.getAllToolNames()).toHaveLength(2);
      expect(agentRegistry.getTool(MOCK_TOOL_NOT_ALLOWED.name)).toBeUndefined();
    });
  });

  describe('run (Execution Loop and Logic)', () => {
    it('should execute a successful work and extraction phase (Happy Path) and emit activities', async () => {
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

      // Turn 2: Model stops
      mockModelResponse([], 'T2: Done');

      // Extraction Phase
      mockModelResponse([], undefined, 'Result: file1.txt.');

      const output = await executor.run(inputs, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
      expect(mockExecuteToolCall).toHaveBeenCalledTimes(1);

      // Verify System Prompt Templating
      const chatConstructorArgs = MockedGeminiChat.mock.calls[0];
      const chatConfig = chatConstructorArgs[1];
      expect(chatConfig?.systemInstruction).toContain(
        'Achieve the goal: Find files.',
      );
      // Verify standard rules are appended
      expect(chatConfig?.systemInstruction).toContain(
        'You are running in a non-interactive mode.',
      );

      // Verify Extraction Phase Call (Specific arguments)
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        'gemini-test-model',
        expect.objectContaining({
          // Extraction message should be based on outputConfig.description
          message: expect.arrayContaining([
            {
              text: expect.stringContaining(
                'Based on your work so far, provide: The final result.',
              ),
            },
          ]),
          config: expect.objectContaining({ tools: undefined }), // No tools in extraction
        }),
        expect.stringContaining('#extraction'),
      );

      expect(output.result).toBe('Result: file1.txt.');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);

      // Verify Activity Stream (Observability)
      expect(activities).toEqual(
        expect.arrayContaining([
          // Thought subjects are extracted by the executor (parseThought)
          expect.objectContaining({
            type: 'THOUGHT_CHUNK',
            data: { text: 'T1: Listing' },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_START',
            data: { name: LSTool.Name, args: { path: '.' } },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_END',
            data: { name: LSTool.Name, output: 'file1.txt' },
          }),
          expect.objectContaining({
            type: 'THOUGHT_CHUNK',
            data: { text: 'T2: Done' },
          }),
        ]),
      );
    });

    it('should execute parallel tool calls concurrently', async () => {
      const definition = createTestDefinition([LSTool.Name, ReadFileTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const call1 = {
        name: LSTool.Name,
        args: { path: '/dir1' },
        id: 'call1',
      };
      // Using LSTool twice for simplicity in mocking standardized responses.
      const call2 = {
        name: LSTool.Name,
        args: { path: '/dir2' },
        id: 'call2',
      };

      // Turn 1: Model calls two tools simultaneously
      mockModelResponse([call1, call2], 'T1: Listing both');

      // Use concurrency tracking to ensure parallelism
      let activeCalls = 0;
      let maxActiveCalls = 0;

      mockExecuteToolCall.mockImplementation(async (_ctx, reqInfo) => {
        activeCalls++;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        // Simulate latency. We must advance the fake timers for this to resolve.
        await new Promise((resolve) => setTimeout(resolve, 100));
        activeCalls--;
        return {
          callId: reqInfo.callId,
          resultDisplay: `Result for ${reqInfo.name}`,
          responseParts: [
            {
              functionResponse: {
                name: reqInfo.name,
                response: {},
                id: reqInfo.callId,
              },
            },
          ],
          error: undefined,
        };
      });

      // Turn 2: Model stops
      mockModelResponse([]);
      // Extraction
      mockModelResponse([], undefined, 'Done.');

      const runPromise = executor.run({ goal: 'Parallel test' }, signal);

      // Advance timers while the parallel calls (Promise.all + setTimeout) are running
      await vi.advanceTimersByTimeAsync(150);

      await runPromise;

      expect(mockExecuteToolCall).toHaveBeenCalledTimes(2);
      expect(maxActiveCalls).toBe(2);

      // Verify the input to the next model call (Turn 2) contains both responses
      // sendMessageStream calls: [0] Turn 1, [1] Turn 2, [2] Extraction
      const turn2Input = mockSendMessageStream.mock.calls[1][1];
      const turn2Parts = turn2Input.message as Part[];

      // Promise.all preserves the order of the input array.
      expect(turn2Parts.length).toBe(2);
      expect(turn2Parts[0]).toEqual(
        expect.objectContaining({
          functionResponse: expect.objectContaining({ id: 'call1' }),
        }),
      );
      expect(turn2Parts[1]).toEqual(
        expect.objectContaining({
          functionResponse: expect.objectContaining({ id: 'call2' }),
        }),
      );
    });

    it('should handle tool execution failure gracefully and report error', async () => {
      const definition = createTestDefinition([LSTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Model calls ls, but it fails
      mockModelResponse([
        { name: LSTool.Name, args: { path: '/invalid' }, id: 'call1' },
      ]);

      const errorMessage = 'Internal failure.';
      mockExecuteToolCall.mockResolvedValueOnce({
        callId: 'call1',
        resultDisplay: `Error: ${errorMessage}`,
        responseParts: undefined, // Failed tools might return undefined parts
        error: { message: errorMessage },
      });

      // Turn 2: Model stops
      mockModelResponse([]);
      mockModelResponse([], undefined, 'Failed.');

      await executor.run({ goal: 'Failure test' }, signal);

      // Verify that the error was reported in the activity stream
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: {
            error: errorMessage,
            context: 'tool_call',
            name: LSTool.Name,
          },
        }),
      );

      // Verify the input to the next model call (Turn 2) contains the fallback error message
      const turn2Input = mockSendMessageStream.mock.calls[1][1];
      const turn2Parts = turn2Input.message as Part[];
      expect(turn2Parts).toEqual([
        {
          text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
        },
      ]);
    });

    it('SECURITY: should block calls to tools not registered for the agent at runtime', async () => {
      // Agent definition only includes LSTool
      const definition = createTestDefinition([LSTool.Name]);
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Model hallucinates a call to ReadFileTool
      // (ReadFileTool exists in the parent registry but not the agent's isolated registry)
      mockModelResponse([
        {
          name: ReadFileTool.Name,
          args: { path: 'config.txt' },
          id: 'call_blocked',
        },
      ]);

      // Turn 2: Model stops
      mockModelResponse([]);
      // Extraction
      mockModelResponse([], undefined, 'Done.');

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await executor.run({ goal: 'Security test' }, signal);

      // Verify executeToolCall was NEVER called because the tool was unauthorized
      expect(mockExecuteToolCall).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `attempted to call unauthorized tool '${ReadFileTool.Name}'`,
        ),
      );

      consoleWarnSpy.mockRestore();

      // Verify the input to the next model call (Turn 2) indicates failure (as the only call was blocked)
      const turn2Input = mockSendMessageStream.mock.calls[1][1];
      const turn2Parts = turn2Input.message as Part[];
      expect(turn2Parts[0].text).toContain('All tool calls failed');
    });

    it('should use OutputConfig completion_criteria in the extraction message', async () => {
      const definition = createTestDefinition(
        [LSTool.Name],
        {},
        {
          description: 'A summary.',
          completion_criteria: ['Must include file names', 'Must be concise'],
        },
      );

      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Model stops immediately
      mockModelResponse([]);

      // Extraction Phase
      mockModelResponse([], undefined, 'Result: Done.');

      await executor.run({ goal: 'Extraction test' }, signal);

      // Verify the extraction call (the second call)
      const extractionCallArgs = mockSendMessageStream.mock.calls[1][1];
      const extractionMessageParts = extractionCallArgs.message as Part[];
      const extractionText = extractionMessageParts[0].text;

      expect(extractionText).toContain(
        'Based on your work so far, provide: A summary.',
      );
      expect(extractionText).toContain('Be sure you have addressed:');
      expect(extractionText).toContain('- Must include file names');
      expect(extractionText).toContain('- Must be concise');
    });
  });

  describe('run (Termination Conditions)', () => {
    const mockKeepAliveResponse = () => {
      mockModelResponse(
        [{ name: LSTool.Name, args: { path: '.' }, id: 'loop' }],
        'Looping',
      );
      mockExecuteToolCall.mockResolvedValue({
        callId: 'loop',
        resultDisplay: 'ok',
        responseParts: [
          { functionResponse: { name: LSTool.Name, response: {}, id: 'loop' } },
        ],
        error: undefined,
      });
    };

    it('should terminate when max_turns is reached', async () => {
      const MAX_TURNS = 2;
      const definition = createTestDefinition([LSTool.Name], {
        max_turns: MAX_TURNS,
      });
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1
      mockKeepAliveResponse();
      // Turn 2
      mockKeepAliveResponse();

      const output = await executor.run({ goal: 'Termination test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.MAX_TURNS);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(MAX_TURNS);
      // Extraction phase should be skipped when termination is forced
      expect(mockSendMessageStream).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.stringContaining('#extraction'),
      );
    });

    it('should terminate if timeout is reached', async () => {
      const definition = createTestDefinition([LSTool.Name], {
        max_time_minutes: 5,
        max_turns: 100,
      });
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1 setup
      mockModelResponse(
        [{ name: LSTool.Name, args: { path: '.' }, id: 'loop' }],
        'Looping',
      );

      // Mock a tool call that takes a long time, causing the overall timeout
      mockExecuteToolCall.mockImplementation(async () => {
        // Advance time past the 5-minute limit during the tool call execution
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
        return {
          callId: 'loop',
          resultDisplay: 'ok',
          responseParts: [
            {
              functionResponse: { name: LSTool.Name, response: {}, id: 'loop' },
            },
          ],
          error: undefined,
        };
      });

      const output = await executor.run({ goal: 'Termination test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.TIMEOUT);
      // Should only have called the model once before the timeout check stopped it
      expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
    });

    it('should terminate when AbortSignal is triggered mid-stream', async () => {
      const definition = createTestDefinition();
      const executor = await AgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Mock the model response stream
      mockSendMessageStream.mockImplementation(async () =>
        (async function* () {
          // Yield the first chunk
          yield {
            type: StreamEventType.CHUNK,
            value: createMockResponseChunk([
              { text: '**Thinking** Step 1', thought: true },
            ]),
          } as StreamEvent;

          // Simulate abort happening mid-stream
          abortController.abort();
          // The loop in callModel should break immediately due to signal check.
        })(),
      );

      const output = await executor.run({ goal: 'Termination test' }, signal);
      expect(output.terminate_reason).toBe(AgentTerminateMode.ABORTED);
    });
  });
});
