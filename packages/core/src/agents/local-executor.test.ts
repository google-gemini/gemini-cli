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
  type Mock,
} from 'vitest';
import { debugLogger } from '../utils/debugLogger.js';
import { LocalAgentExecutor, type ActivityCallback } from './local-executor.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import {
  DiscoveredMCPTool,
  MCP_QUALIFIED_NAME_SEPARATOR,
} from '../tools/mcp-tool.js';
import { LSTool } from '../tools/ls.js';
import { LS_TOOL_NAME, READ_FILE_TOOL_NAME } from '../tools/tool-names.js';
import {
  GeminiChat,
  StreamEventType,
  type StreamEvent,
} from '../core/geminiChat.js';
import {
  type FunctionCall,
  type Part,
  type GenerateContentResponse,
  type Content,
  type PartListUnion,
  type Tool,
  type CallableTool,
} from '@google/genai';
import type { Config } from '../config/config.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { getDirectoryContextString } from '../utils/environmentContext.js';
import { z } from 'zod';
import { getErrorMessage } from '../utils/errors.js';
import { promptIdContext } from '../utils/promptIdContext.js';
import {
  logAgentStart,
  logAgentFinish,
  logRecoveryAttempt,
} from '../telemetry/loggers.js';
import {
  LlmRole,
  AgentStartEvent,
  AgentFinishEvent,
  RecoveryAttemptEvent,
} from '../telemetry/types.js';
import type {
  AgentInputs,
  LocalAgentDefinition,
  SubagentActivityEvent,
  OutputConfig,
} from './types.js';
import { AgentTerminateMode } from './types.js';
import type { AnyDeclarativeTool, AnyToolInvocation } from '../tools/tools.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import { CompressionStatus } from '../core/turn.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import type {
  ModelConfigKey,
  ResolvedModelConfig,
} from '../services/modelConfigService.js';
import type { AgentRegistry } from './registry.js';
import { getModelConfigAlias } from './registry.js';
import type { ModelRouterService } from '../routing/modelRouterService.js';

const {
  mockSendMessageStream,
  mockScheduleAgentTools,
  mockSetSystemInstruction,
  mockCompress,
} = vi.hoisted(() => ({
  mockSendMessageStream: vi.fn(),
  mockScheduleAgentTools: vi.fn(),
  mockSetSystemInstruction: vi.fn(),
  mockCompress: vi.fn(),
}));

let mockChatHistory: Content[] = [];
const mockSetHistory = vi.fn((newHistory: Content[]) => {
  mockChatHistory = newHistory;
});

vi.mock('../services/chatCompressionService.js', () => ({
  ChatCompressionService: vi.fn().mockImplementation(() => ({
    compress: mockCompress,
  })),
}));

vi.mock('../core/geminiChat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/geminiChat.js')>();
  return {
    ...actual,
    GeminiChat: vi.fn().mockImplementation(() => ({
      sendMessageStream: mockSendMessageStream,
      getHistory: vi.fn((_curated?: boolean) => [...mockChatHistory]),
      setHistory: mockSetHistory,
      setSystemInstruction: mockSetSystemInstruction,
    })),
  };
});

vi.mock('./agent-scheduler.js', () => ({
  scheduleAgentTools: mockScheduleAgentTools,
}));

vi.mock('../utils/version.js', () => ({
  getVersion: vi.fn().mockResolvedValue('1.2.3'),
}));

vi.mock('../utils/environmentContext.js');

vi.mock('../telemetry/loggers.js', () => ({
  logAgentStart: vi.fn(),
  logAgentFinish: vi.fn(),
  logRecoveryAttempt: vi.fn(),
}));

vi.mock('../utils/schemaValidator.js', () => ({
  SchemaValidator: {
    validate: vi.fn().mockReturnValue(null),
    validateSchema: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../utils/filesearch/crawler.js', () => ({
  crawl: vi.fn().mockResolvedValue([]),
}));

vi.mock('../telemetry/clearcut-logger/clearcut-logger.js', () => ({
  ClearcutLogger: class {
    log() {}
  },
}));

vi.mock('../utils/promptIdContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/promptIdContext.js')>();
  return {
    ...actual,
    promptIdContext: {
      ...actual.promptIdContext,
      getStore: vi.fn(),
      run: vi.fn((_id, fn) => fn()),
    },
  };
});

const MockedGeminiChat = vi.mocked(GeminiChat);
const mockedGetDirectoryContextString = vi.mocked(getDirectoryContextString);
const mockedPromptIdContext = vi.mocked(promptIdContext);
const mockedLogAgentStart = vi.mocked(logAgentStart);
const mockedLogAgentFinish = vi.mocked(logAgentFinish);
const mockedLogRecoveryAttempt = vi.mocked(logRecoveryAttempt);

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
  return {
    modelConfigKey: call[0],
    message: call[1],
  } as { modelConfigKey: ModelConfigKey; message: PartListUnion };
};

let mockConfig: Config;
let parentToolRegistry: ToolRegistry;

/**
 * Type-safe helper to create agent definitions for tests.
 */

const createTestDefinition = <TOutput extends z.ZodTypeAny = z.ZodUnknown>(
  tools: Array<string | MockTool> = [LS_TOOL_NAME],
  runConfigOverrides: Partial<LocalAgentDefinition<TOutput>['runConfig']> = {},
  outputConfigMode: 'default' | 'none' = 'default',
  schema: TOutput = z.string() as unknown as TOutput,
): LocalAgentDefinition<TOutput> => {
  let outputConfig: OutputConfig<TOutput> | undefined;

  if (outputConfigMode === 'default') {
    outputConfig = {
      outputName: 'finalResult',
      description: 'The final result.',
      schema,
    };
  }

  return {
    kind: 'local',
    name: 'TestAgent',
    description: 'An agent for testing.',
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'goal' },
        },
        required: ['goal'],
      },
    },
    modelConfig: {
      model: 'gemini-test-model',
      generateContentConfig: {
        temperature: 0,
        topP: 1,
      },
    },
    runConfig: { maxTimeMinutes: 5, maxTurns: 5, ...runConfigOverrides },
    promptConfig: { systemPrompt: 'Achieve the goal: ${goal}.' },
    toolConfig: { tools },
    outputConfig,
  };
};

describe('LocalAgentExecutor', () => {
  let activities: SubagentActivityEvent[];
  let onActivity: ActivityCallback;
  let abortController: AbortController;
  let signal: AbortSignal;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockCompress.mockClear();
    mockSetHistory.mockClear();
    mockSendMessageStream.mockReset();
    mockSetSystemInstruction.mockReset();
    mockScheduleAgentTools.mockReset();
    mockedLogAgentStart.mockReset();
    mockedLogAgentFinish.mockReset();
    mockedPromptIdContext.getStore.mockReset();
    mockedPromptIdContext.run.mockImplementation((_id, fn) => fn());

    (ChatCompressionService as Mock).mockImplementation(() => ({
      compress: mockCompress,
    }));
    mockCompress.mockResolvedValue({
      newHistory: null,
      info: { compressionStatus: CompressionStatus.NOOP },
    });

    MockedGeminiChat.mockImplementation(
      () =>
        ({
          sendMessageStream: mockSendMessageStream,
          setSystemInstruction: mockSetSystemInstruction,
          getHistory: vi.fn((_curated?: boolean) => [...mockChatHistory]),
          getLastPromptTokenCount: vi.fn(() => 100),
          setHistory: mockSetHistory,
        }) as unknown as GeminiChat,
    );

    vi.useFakeTimers();

    mockConfig = makeFakeConfig();
    parentToolRegistry = new ToolRegistry(
      mockConfig,
      mockConfig.getMessageBus(),
    );
    parentToolRegistry.registerTool(
      new LSTool(mockConfig, mockConfig.getMessageBus()),
    );
    parentToolRegistry.registerTool(
      new MockTool({ name: READ_FILE_TOOL_NAME }),
    );
    parentToolRegistry.registerTool(MOCK_TOOL_NOT_ALLOWED);

    vi.spyOn(mockConfig, 'getToolRegistry').mockReturnValue(parentToolRegistry);
    vi.spyOn(mockConfig, 'getAgentRegistry').mockReturnValue({
      getAllAgentNames: () => [],
    } as unknown as AgentRegistry);

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
      const definition = createTestDefinition([LS_TOOL_NAME]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      expect(executor).toBeInstanceOf(LocalAgentExecutor);
    });

    it('should allow any tool for experimentation (formerly SECURITY check)', async () => {
      const definition = createTestDefinition([MOCK_TOOL_NOT_ALLOWED.name]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      expect(executor).toBeInstanceOf(LocalAgentExecutor);
    });

    it('should create an isolated ToolRegistry for the agent', async () => {
      const definition = createTestDefinition([
        LS_TOOL_NAME,
        READ_FILE_TOOL_NAME,
      ]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const agentRegistry = executor['toolRegistry'];

      expect(agentRegistry).not.toBe(parentToolRegistry);
      expect(agentRegistry.getAllToolNames()).toEqual(
        expect.arrayContaining([LS_TOOL_NAME, READ_FILE_TOOL_NAME]),
      );
      expect(agentRegistry.getAllToolNames()).toHaveLength(2);
      expect(agentRegistry.getTool(MOCK_TOOL_NOT_ALLOWED.name)).toBeUndefined();
    });

    it('should use parentPromptId from context to create agentId', async () => {
      const parentId = 'parent-id';
      mockedPromptIdContext.getStore.mockReturnValue(parentId);

      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      expect(executor['agentId']).toMatch(
        new RegExp(`^${parentId}-${definition.name}-`),
      );
    });

    it('should correctly apply templates to initialMessages', async () => {
      const definition = createTestDefinition();
      // Override promptConfig to use initialMessages instead of systemPrompt
      definition.promptConfig = {
        initialMessages: [
          { role: 'user', parts: [{ text: 'Goal: ${goal}' }] },
          { role: 'model', parts: [{ text: 'OK, starting on ${goal}.' }] },
        ],
      };
      const inputs = { goal: 'TestGoal' };

      // Mock a response to prevent the loop from running forever
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'done' },
          id: 'call1',
        },
      ]);

      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      await executor.run(inputs, signal);

      const chatConstructorArgs = MockedGeminiChat.mock.calls[0];
      const startHistory = chatConstructorArgs[3]; // history is the 4th arg

      expect(startHistory).toBeDefined();
      expect(startHistory).toHaveLength(2);

      // Perform checks on defined objects to satisfy TS
      const firstPart = startHistory?.[0]?.parts?.[0];
      expect(firstPart?.text).toBe('Goal: TestGoal');

      const secondPart = startHistory?.[1]?.parts?.[0];
      expect(secondPart?.text).toBe('OK, starting on TestGoal.');
    });

    it('should filter out subagent tools to prevent recursion', async () => {
      const subAgentName = 'recursive-agent';
      // Register a mock tool that simulates a subagent
      parentToolRegistry.registerTool(new MockTool({ name: subAgentName }));

      // Mock the agent registry to return the subagent name
      vi.spyOn(
        mockConfig.getAgentRegistry(),
        'getAllAgentNames',
      ).mockReturnValue([subAgentName]);

      const definition = createTestDefinition([LS_TOOL_NAME, subAgentName]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const agentRegistry = executor['toolRegistry'];

      // LS should be present
      expect(agentRegistry.getTool(LS_TOOL_NAME)).toBeDefined();
      // Subagent should be filtered out
      expect(agentRegistry.getTool(subAgentName)).toBeUndefined();
    });

    it('should default to ALL tools (except subagents) when toolConfig is undefined', async () => {
      const subAgentName = 'recursive-agent';
      // Register tools in parent registry
      // LS_TOOL_NAME is already registered in beforeEach
      const otherTool = new MockTool({ name: 'other-tool' });
      parentToolRegistry.registerTool(otherTool);
      parentToolRegistry.registerTool(new MockTool({ name: subAgentName }));

      // Mock the agent registry to return the subagent name
      vi.spyOn(
        mockConfig.getAgentRegistry(),
        'getAllAgentNames',
      ).mockReturnValue([subAgentName]);

      // Create definition and force toolConfig to be undefined
      const definition = createTestDefinition();
      definition.toolConfig = undefined;

      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const agentRegistry = executor['toolRegistry'];

      // Should include standard tools
      expect(agentRegistry.getTool(LS_TOOL_NAME)).toBeDefined();
      expect(agentRegistry.getTool('other-tool')).toBeDefined();

      // Should exclude subagent
      expect(agentRegistry.getTool(subAgentName)).toBeUndefined();
    });

    it('should enforce qualified names for MCP tools in agent definitions', async () => {
      const serverName = 'mcp-server';
      const toolName = 'mcp-tool';
      const qualifiedName = `${serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${toolName}`;

      const mockMcpTool = {
        tool: vi.fn(),
        callTool: vi.fn(),
      } as unknown as CallableTool;

      const mcpTool = new DiscoveredMCPTool(
        mockMcpTool,
        serverName,
        toolName,
        'description',
        {},
        mockConfig.getMessageBus(),
      );

      // Mock getTool to return our real DiscoveredMCPTool instance
      const getToolSpy = vi
        .spyOn(parentToolRegistry, 'getTool')
        .mockImplementation((name) => {
          if (name === toolName || name === qualifiedName) {
            return mcpTool;
          }
          return undefined;
        });

      // 1. Qualified name works and registers the tool (using short name per status quo)
      const definition = createTestDefinition([qualifiedName]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const agentRegistry = executor['toolRegistry'];
      // Registry shortening logic means it's registered as 'mcp-tool' internally
      expect(agentRegistry.getTool(toolName)).toBeDefined();

      // 2. Unqualified name for MCP tool THROWS
      const badDefinition = createTestDefinition([toolName]);
      await expect(
        LocalAgentExecutor.create(badDefinition, mockConfig, onActivity),
      ).rejects.toThrow(/must be requested with its server prefix/);

      getToolSpy.mockRestore();
    });
  });

  describe('run (Execution Loop and Logic)', () => {
    it('should log AgentFinish with error if run throws', async () => {
      const definition = createTestDefinition();
      // Make the definition invalid to cause an error during run
      definition.inputConfig.inputSchema = {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'goal' },
        },
        required: ['goal'],
      };
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Run without inputs to trigger validation error
      await expect(executor.run({}, signal)).rejects.toThrow(
        /Missing required input parameters/,
      );

      expect(mockedLogAgentStart).toHaveBeenCalledTimes(1);
      expect(mockedLogAgentFinish).toHaveBeenCalledTimes(1);
      expect(mockedLogAgentFinish).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          terminate_reason: AgentTerminateMode.ERROR,
        }),
      );
    });

    it('should execute successfully when model calls complete_task with output (Happy Path with Output)', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      const inputs: AgentInputs = { goal: 'Find files' };

      // Turn 1: Model calls ls
      mockModelResponse(
        [{ name: LS_TOOL_NAME, args: { path: '.' }, id: 'call1' }],
        'T1: Listing',
      );
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: 'call1',
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: 'call1',
            resultDisplay: 'file1.txt',
            responseParts: [
              {
                functionResponse: {
                  name: LS_TOOL_NAME,
                  response: { result: 'file1.txt' },
                  id: 'call1',
                },
              },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);

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

      const systemInstruction = MockedGeminiChat.mock.calls[0][1];
      expect(systemInstruction).toContain(
        `MUST call the \`${TASK_COMPLETE_TOOL_NAME}\` tool`,
      );
      expect(systemInstruction).toContain('Mocked Environment Context');
      expect(systemInstruction).toContain(
        'You are running in a non-interactive mode',
      );
      expect(systemInstruction).toContain('Always use absolute paths');

      const { modelConfigKey } = getMockMessageParams(0);
      expect(modelConfigKey.model).toBe(getModelConfigAlias(definition));

      const chatConstructorArgs = MockedGeminiChat.mock.calls[0];
      // tools are the 3rd argument (index 2), passed as [{ functionDeclarations: [...] }]
      const passedToolsArg = chatConstructorArgs[2] as Tool[];
      const sentTools = passedToolsArg[0].functionDeclarations;
      expect(sentTools).toBeDefined();

      expect(sentTools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: LS_TOOL_NAME }),
          expect.objectContaining({ name: TASK_COMPLETE_TOOL_NAME }),
        ]),
      );

      const completeToolDef = sentTools!.find(
        (t) => t.name === TASK_COMPLETE_TOOL_NAME,
      );
      expect(completeToolDef?.parameters?.required).toContain('finalResult');

      expect(output.result).toBe('Found file1.txt');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);

      // Telemetry checks
      expect(mockedLogAgentStart).toHaveBeenCalledTimes(1);
      expect(mockedLogAgentStart).toHaveBeenCalledWith(
        mockConfig,
        expect.any(AgentStartEvent),
      );
      expect(mockedLogAgentFinish).toHaveBeenCalledTimes(1);
      expect(mockedLogAgentFinish).toHaveBeenCalledWith(
        mockConfig,
        expect.any(AgentFinishEvent),
      );
      const finishEvent = mockedLogAgentFinish.mock.calls[0][1];
      expect(finishEvent.terminate_reason).toBe(AgentTerminateMode.GOAL);

      // Context checks
      expect(mockedPromptIdContext.run).toHaveBeenCalledTimes(2); // Two turns
      const agentId = executor['agentId'];
      expect(mockedPromptIdContext.run).toHaveBeenNthCalledWith(
        1,
        `${agentId}#0`,
        expect.any(Function),
      );
      expect(mockedPromptIdContext.run).toHaveBeenNthCalledWith(
        2,
        `${agentId}#1`,
        expect.any(Function),
      );

      expect(activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'THOUGHT_CHUNK',
            data: { text: 'T1: Listing' },
          }),
          expect.objectContaining({
            type: 'TOOL_CALL_END',
            data: { name: LS_TOOL_NAME, output: 'file1.txt' },
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
      const definition = createTestDefinition([LS_TOOL_NAME], {}, 'none');
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        { name: LS_TOOL_NAME, args: { path: '.' }, id: 'call1' },
      ]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: 'call1',
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: 'call1',
            resultDisplay: 'ok',
            responseParts: [
              {
                functionResponse: {
                  name: LS_TOOL_NAME,
                  response: {},
                  id: 'call1',
                },
              },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);

      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { result: 'All work done' },
            id: 'call2',
          },
        ],
        'Task finished.',
      );

      const output = await executor.run({ goal: 'Do work' }, signal);

      const { modelConfigKey } = getMockMessageParams(0);
      expect(modelConfigKey.model).toBe(getModelConfigAlias(definition));

      const chatConstructorArgs = MockedGeminiChat.mock.calls[0];
      const passedToolsArg = chatConstructorArgs[2] as Tool[];
      const sentTools = passedToolsArg[0].functionDeclarations;
      expect(sentTools).toBeDefined();

      const completeToolDef = sentTools!.find(
        (t) => t.name === TASK_COMPLETE_TOOL_NAME,
      );
      expect(completeToolDef?.parameters?.required).toEqual(['result']);
      expect(completeToolDef?.description).toContain(
        'submit your final findings',
      );

      expect(output.result).toBe('All work done');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
    });

    it('should error immediately if the model stops tools without calling complete_task (Protocol Violation)', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        { name: LS_TOOL_NAME, args: { path: '.' }, id: 'call1' },
      ]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: 'call1',
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: 'call1',
            resultDisplay: 'ok',
            responseParts: [
              {
                functionResponse: {
                  name: LS_TOOL_NAME,
                  response: {},
                  id: 'call1',
                },
              },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);

      // Turn 2 (protocol violation)
      mockModelResponse([], 'I think I am done.');

      // Turn 3 (recovery turn - also fails)
      mockModelResponse([], 'I still give up.');

      const output = await executor.run({ goal: 'Strict test' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(3);

      const expectedError = `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}'.`;

      expect(output.terminate_reason).toBe(
        AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL,
      );
      expect(output.result).toBe(expectedError);

      // Telemetry check for error
      expect(mockedLogAgentFinish).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          terminate_reason: AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL,
        }),
      );

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
      const executor = await LocalAgentExecutor.create(
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

      expect((turn2Parts as Part[])[0]).toEqual(
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
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Duplicate calls
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { result: 'done' },
          id: 'call1',
        },
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { result: 'ignored' },
          id: 'call2',
        },
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
      const definition = createTestDefinition([LS_TOOL_NAME]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      const call1: FunctionCall = {
        name: LS_TOOL_NAME,
        args: { path: '/a' },
        id: 'c1',
      };
      const call2: FunctionCall = {
        name: LS_TOOL_NAME,
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

      mockScheduleAgentTools.mockImplementation(
        async (_ctx, requests: ToolCallRequestInfo[]) => {
          const results = await Promise.all(
            requests.map(async (reqInfo) => {
              callsStarted++;
              if (callsStarted === 2) resolveCalls();
              await vi.advanceTimersByTimeAsync(100);
              return {
                status: 'success',
                request: reqInfo,
                tool: {} as AnyDeclarativeTool,
                invocation: {} as AnyToolInvocation,
                response: {
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
                  error: undefined,
                  errorType: undefined,
                  contentLength: undefined,
                },
              };
            }),
          );
          return results;
        },
      );

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

      expect(mockScheduleAgentTools).toHaveBeenCalledTimes(1);
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
      const definition = createTestDefinition([LS_TOOL_NAME]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Model tries to use a tool not in its config
      const badCallId = 'bad_call_1';
      mockModelResponse([
        {
          name: READ_FILE_TOOL_NAME,
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
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      await executor.run({ goal: 'Sec test' }, signal);

      // Verify external executor was not called (Security held)
      expect(mockScheduleAgentTools).not.toHaveBeenCalled();

      // 2. Verify console warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[LocalAgentExecutor] Blocked call:`),
      );
      consoleWarnSpy.mockRestore();

      // Verify specific error was sent back to model
      const turn2Params = getMockMessageParams(1);
      const parts = turn2Params.message;
      expect(parts).toBeDefined();
      expect((parts as Part[])[0]).toEqual(
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            id: badCallId,
            name: READ_FILE_TOOL_NAME,
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
            name: READ_FILE_TOOL_NAME,
          }),
        }),
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should report an error if complete_task output fails schema validation', async () => {
      const definition = createTestDefinition(
        [],
        {},
        'default',
        z.string().min(10), // The schema is for the output value itself
      );
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Invalid arg (too short)
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'short' },
          id: 'call1',
        },
      ]);

      // Turn 2: Corrected
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'This is a much longer and valid result' },
          id: 'call2',
        },
      ]);

      const output = await executor.run({ goal: 'Validation test' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      const expectedError =
        'Output validation failed: {"formErrors":["String must contain at least 10 character(s)"],"fieldErrors":{}}';

      // Check that the error was reported in the activity stream
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: {
            context: 'tool_call',
            name: TASK_COMPLETE_TOOL_NAME,
            error: expect.stringContaining('Output validation failed'),
          },
        }),
      );

      // Check that the error was sent back to the model for the next turn
      const turn2Params = getMockMessageParams(1);
      const turn2Parts = turn2Params.message;
      expect(turn2Parts).toEqual([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            name: TASK_COMPLETE_TOOL_NAME,
            response: { error: expectedError },
            id: 'call1',
          }),
        }),
      ]);

      // Check that the agent eventually succeeded
      expect(output.result).toContain('This is a much longer and valid result');
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
    });

    it('should throw and log if GeminiChat creation fails', async () => {
      const definition = createTestDefinition();
      const initError = new Error('Chat creation failed');
      MockedGeminiChat.mockImplementationOnce(() => {
        throw initError;
      });

      // We expect the error to be thrown during the run, not creation
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      await expect(executor.run({ goal: 'test' }, signal)).rejects.toThrow(
        `Failed to create chat object: ${getErrorMessage(initError)}`,
      );

      // Ensure the error was reported via the activity callback
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            error: `Error: Failed to create chat object: ${getErrorMessage(initError)}`,
          }),
        }),
      );

      // Ensure the agent run was logged as a failure
      expect(mockedLogAgentFinish).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          terminate_reason: AgentTerminateMode.ERROR,
        }),
      );
    });

    it('should handle a failed tool call and feed the error to the model', async () => {
      const definition = createTestDefinition([LS_TOOL_NAME]);
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      const toolErrorMessage = 'Tool failed spectacularly';

      // Turn 1: Model calls a tool that will fail
      mockModelResponse([
        { name: LS_TOOL_NAME, args: { path: '/fake' }, id: 'call1' },
      ]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'error',
          request: {
            callId: 'call1',
            name: LS_TOOL_NAME,
            args: { path: '/fake' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: 'call1',
            resultDisplay: '',
            responseParts: [
              {
                functionResponse: {
                  name: LS_TOOL_NAME,
                  response: { error: toolErrorMessage },
                  id: 'call1',
                },
              },
            ],
            error: new Error(toolErrorMessage),
            errorType: 'ToolError',
            contentLength: 0,
          },
        },
      ]);

      // Turn 2: Model sees the error and completes
      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'Aborted due to tool failure.' },
          id: 'call2',
        },
      ]);

      const output = await executor.run({ goal: 'Tool failure test' }, signal);

      expect(mockScheduleAgentTools).toHaveBeenCalledTimes(1);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      // Verify the error was reported in the activity stream
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: {
            context: 'tool_call',
            name: LS_TOOL_NAME,
            error: toolErrorMessage,
          },
        }),
      );

      // Verify the error was sent back to the model
      const turn2Params = getMockMessageParams(1);
      const parts = turn2Params.message;
      expect(parts).toEqual([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            name: LS_TOOL_NAME,
            id: 'call1',
            response: {
              error: toolErrorMessage,
            },
          }),
        }),
      ]);

      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
      expect(output.result).toBe('Aborted due to tool failure.');
    });
  });

  describe('Model Routing', () => {
    it('should use model routing when the agent model is "auto"', async () => {
      const definition = createTestDefinition();
      definition.modelConfig.model = 'auto';

      const mockRouter = {
        route: vi.fn().mockResolvedValue({
          model: 'routed-model',
          metadata: { source: 'test', reasoning: 'test' },
        }),
      };
      vi.spyOn(mockConfig, 'getModelRouterService').mockReturnValue(
        mockRouter as unknown as ModelRouterService,
      );

      // Mock resolved config to return 'auto'
      vi.spyOn(
        mockConfig.modelConfigService,
        'getResolvedConfig',
      ).mockReturnValue({
        model: 'auto',
        generateContentConfig: {},
      } as unknown as ResolvedModelConfig);

      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'done' },
          id: 'call1',
        },
      ]);

      await executor.run({ goal: 'test' }, signal);

      expect(mockRouter.route).toHaveBeenCalled();
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'routed-model' }),
        expect.any(Array),
        expect.any(String),
        expect.any(AbortSignal),
        LlmRole.SUBAGENT,
      );
    });

    it('should NOT use model routing when the agent model is NOT "auto"', async () => {
      const definition = createTestDefinition();
      definition.modelConfig.model = 'concrete-model';

      const mockRouter = {
        route: vi.fn(),
      };
      vi.spyOn(mockConfig, 'getModelRouterService').mockReturnValue(
        mockRouter as unknown as ModelRouterService,
      );

      // Mock resolved config to return 'concrete-model'
      vi.spyOn(
        mockConfig.modelConfigService,
        'getResolvedConfig',
      ).mockReturnValue({
        model: 'concrete-model',
        generateContentConfig: {},
      } as unknown as ResolvedModelConfig);

      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockModelResponse([
        {
          name: TASK_COMPLETE_TOOL_NAME,
          args: { finalResult: 'done' },
          id: 'call1',
        },
      ]);

      await executor.run({ goal: 'test' }, signal);

      expect(mockRouter.route).not.toHaveBeenCalled();
      expect(mockSendMessageStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'concrete-model' }),
        expect.any(Array),
        expect.any(String),
        expect.any(AbortSignal),
        LlmRole.SUBAGENT,
      );
    });
  });

  describe('run (Termination Conditions)', () => {
    const mockWorkResponse = (id: string) => {
      mockModelResponse([{ name: LS_TOOL_NAME, args: { path: '.' }, id }]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: id,
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: id,
            resultDisplay: 'ok',
            responseParts: [
              { functionResponse: { name: LS_TOOL_NAME, response: {}, id } },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);
    };

    it('should terminate when max_turns is reached', async () => {
      const MAX = 2;
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTurns: MAX,
      });
      const executor = await LocalAgentExecutor.create(definition, mockConfig);

      mockWorkResponse('t1');
      mockWorkResponse('t2');
      // Recovery turn
      mockModelResponse([], 'I give up');

      const output = await executor.run({ goal: 'Turns test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.MAX_TURNS);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(MAX + 1);
    });

    it('should terminate with TIMEOUT if a model call takes too long', async () => {
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTimeMinutes: 0.5, // 30 seconds
      });
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Mock a model call that is interruptible by an abort signal.
      mockSendMessageStream.mockImplementationOnce(
        async (_key, _message, _promptId, signal) =>
          // eslint-disable-next-line require-yield
          (async function* () {
            await new Promise<void>((resolve) => {
              // This promise resolves when aborted, ending the generator.
              signal?.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            });
          })(),
      );
      // Recovery turn
      mockModelResponse([], 'I give up');

      const runPromise = executor.run({ goal: 'Timeout test' }, signal);

      // Advance time past the timeout to trigger the abort.
      await vi.advanceTimersByTimeAsync(31 * 1000);

      const output = await runPromise;

      expect(output.terminate_reason).toBe(AgentTerminateMode.TIMEOUT);
      expect(output.result).toContain('Agent timed out after 0.5 minutes.');
      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

      // Verify activity stream reported the timeout
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'timeout',
            error: 'Agent timed out after 0.5 minutes.',
          }),
        }),
      );

      // Verify telemetry
      expect(mockedLogAgentFinish).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          terminate_reason: AgentTerminateMode.TIMEOUT,
        }),
      );
    });

    it('should terminate with TIMEOUT if a tool call takes too long', async () => {
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTimeMinutes: 1,
      });
      const executor = await LocalAgentExecutor.create(definition, mockConfig);

      mockModelResponse([
        { name: LS_TOOL_NAME, args: { path: '.' }, id: 't1' },
      ]);

      // Long running tool
      mockScheduleAgentTools.mockImplementationOnce(
        async (_ctx, requests: ToolCallRequestInfo[]) => {
          await vi.advanceTimersByTimeAsync(61 * 1000);
          return [
            {
              status: 'success',
              request: requests[0],
              tool: {} as AnyDeclarativeTool,
              invocation: {} as AnyToolInvocation,
              response: {
                callId: 't1',
                resultDisplay: 'ok',
                responseParts: [],
                error: undefined,
                errorType: undefined,
                contentLength: undefined,
              },
            },
          ];
        },
      );

      // Recovery turn
      mockModelResponse([], 'I give up');

      const output = await executor.run({ goal: 'Timeout test' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.TIMEOUT);
      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
    });

    it('should terminate when AbortSignal is triggered', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(definition, mockConfig);

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

  describe('run (Recovery Turns)', () => {
    const mockWorkResponse = (id: string) => {
      mockModelResponse([{ name: LS_TOOL_NAME, args: { path: '.' }, id }]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: id,
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: id,
            resultDisplay: 'ok',
            responseParts: [
              { functionResponse: { name: LS_TOOL_NAME, response: {}, id } },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);
    };

    it('should recover successfully if complete_task is called during the grace turn after MAX_TURNS', async () => {
      const MAX = 1;
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTurns: MAX,
      });
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1 (hits max_turns)
      mockWorkResponse('t1');

      // Recovery Turn (succeeds)
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Recovered!' },
            id: 't2',
          },
        ],
        'Recovering from max turns',
      );

      const output = await executor.run({ goal: 'Turns recovery' }, signal);

      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
      expect(output.result).toBe('Recovered!');
      expect(mockSendMessageStream).toHaveBeenCalledTimes(MAX + 1); // 1 regular + 1 recovery

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'THOUGHT_CHUNK',
          data: {
            text: 'Execution limit reached (MAX_TURNS). Attempting one final recovery turn with a grace period.',
          },
        }),
      );
      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'THOUGHT_CHUNK',
          data: { text: 'Graceful recovery succeeded.' },
        }),
      );
    });

    it('should fail if complete_task is NOT called during the grace turn after MAX_TURNS', async () => {
      const MAX = 1;
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTurns: MAX,
      });
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1 (hits max_turns)
      mockWorkResponse('t1');

      // Recovery Turn (fails by calling no tools)
      mockModelResponse([], 'I give up again.');

      const output = await executor.run(
        { goal: 'Turns recovery fail' },
        signal,
      );

      expect(output.terminate_reason).toBe(AgentTerminateMode.MAX_TURNS);
      expect(output.result).toContain('Agent reached max turns limit');
      expect(mockSendMessageStream).toHaveBeenCalledTimes(MAX + 1);

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'recovery_turn',
            error: 'Graceful recovery attempt failed. Reason: stop',
          }),
        }),
      );
    });

    it('should recover successfully from a protocol violation (no complete_task)', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Normal work
      mockWorkResponse('t1');

      // Turn 2: Protocol violation (no tool calls)
      mockModelResponse([], 'I think I am done, but I forgot the right tool.');

      // Turn 3: Recovery turn (succeeds)
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Recovered from violation!' },
            id: 't3',
          },
        ],
        'My mistake, here is the completion.',
      );

      const output = await executor.run({ goal: 'Violation recovery' }, signal);

      expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
      expect(output.result).toBe('Recovered from violation!');

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'THOUGHT_CHUNK',
          data: {
            text: 'Execution limit reached (ERROR_NO_COMPLETE_TASK_CALL). Attempting one final recovery turn with a grace period.',
          },
        }),
      );
    });

    it('should fail recovery from a protocol violation if it violates again', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Turn 1: Normal work
      mockWorkResponse('t1');

      // Turn 2: Protocol violation (no tool calls)
      mockModelResponse([], 'I think I am done, but I forgot the right tool.');

      // Turn 3: Recovery turn (fails again)
      mockModelResponse([], 'I still dont know what to do.');

      const output = await executor.run(
        { goal: 'Violation recovery fail' },
        signal,
      );

      expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
      expect(output.terminate_reason).toBe(
        AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL,
      );
      expect(output.result).toContain(
        `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}'`,
      );

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'recovery_turn',
            error: 'Graceful recovery attempt failed. Reason: stop',
          }),
        }),
      );
    });

    it('should recover successfully from a TIMEOUT', async () => {
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTimeMinutes: 0.5, // 30 seconds
      });
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Mock a model call that gets interrupted by the timeout.
      mockSendMessageStream.mockImplementationOnce(
        async (_key, _message, _promptId, signal) =>
          // eslint-disable-next-line require-yield
          (async function* () {
            // This promise never resolves, it waits for abort.
            await new Promise<void>((resolve) => {
              signal?.addEventListener('abort', () => resolve(), {
                once: true,
              });
            });
          })(),
      );

      // Recovery turn (succeeds)
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Recovered from timeout!' },
            id: 't2',
          },
        ],
        'Apologies for the delay, finishing up.',
      );

      const runPromise = executor.run({ goal: 'Timeout recovery' }, signal);

      // Advance time past the timeout to trigger the abort and recovery.
      await vi.advanceTimersByTimeAsync(31 * 1000);

      const output = await runPromise;

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2); // 1 failed + 1 recovery
      expect(output.terminate_reason).toBe(AgentTerminateMode.GOAL);
      expect(output.result).toBe('Recovered from timeout!');

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'THOUGHT_CHUNK',
          data: {
            text: 'Execution limit reached (TIMEOUT). Attempting one final recovery turn with a grace period.',
          },
        }),
      );
    });

    it('should fail recovery from a TIMEOUT if the grace period also times out', async () => {
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTimeMinutes: 0.5, // 30 seconds
      });
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      mockSendMessageStream.mockImplementationOnce(
        async (_key, _message, _promptId, signal) =>
          // eslint-disable-next-line require-yield
          (async function* () {
            await new Promise<void>((resolve) =>
              signal?.addEventListener('abort', () => resolve(), {
                once: true,
              }),
            );
          })(),
      );

      // Mock the recovery call to also be long-running
      mockSendMessageStream.mockImplementationOnce(
        async (_key, _message, _promptId, signal) =>
          // eslint-disable-next-line require-yield
          (async function* () {
            await new Promise<void>((resolve) =>
              signal?.addEventListener('abort', () => resolve(), {
                once: true,
              }),
            );
          })(),
      );

      const runPromise = executor.run(
        { goal: 'Timeout recovery fail' },
        signal,
      );

      // 1. Trigger the main timeout
      await vi.advanceTimersByTimeAsync(31 * 1000);
      // 2. Let microtasks run (start recovery turn)
      await vi.advanceTimersByTimeAsync(1);
      // 3. Trigger the grace period timeout (60s)
      await vi.advanceTimersByTimeAsync(61 * 1000);

      const output = await runPromise;

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
      expect(output.terminate_reason).toBe(AgentTerminateMode.TIMEOUT);
      expect(output.result).toContain('Agent timed out after 0.5 minutes.');

      expect(activities).toContainEqual(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            context: 'recovery_turn',
            error: 'Graceful recovery attempt failed. Reason: stop',
          }),
        }),
      );
    });
  });
  describe('Telemetry and Logging', () => {
    const mockWorkResponse = (id: string) => {
      mockModelResponse([{ name: LS_TOOL_NAME, args: { path: '.' }, id }]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: id,
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: id,
            resultDisplay: 'ok',
            responseParts: [
              { functionResponse: { name: LS_TOOL_NAME, response: {}, id } },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);
    };

    beforeEach(() => {
      mockedLogRecoveryAttempt.mockClear();
    });

    it('should log a RecoveryAttemptEvent when a recoverable error occurs and recovery fails', async () => {
      const MAX = 1;
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTurns: MAX,
      });
      const executor = await LocalAgentExecutor.create(definition, mockConfig);

      // Turn 1 (hits max_turns)
      mockWorkResponse('t1');

      // Recovery Turn (fails by calling no tools)
      mockModelResponse([], 'I give up again.');

      await executor.run({ goal: 'Turns recovery fail' }, signal);

      expect(mockedLogRecoveryAttempt).toHaveBeenCalledTimes(1);
      const recoveryEvent = mockedLogRecoveryAttempt.mock.calls[0][1];
      expect(recoveryEvent).toBeInstanceOf(RecoveryAttemptEvent);
      expect(recoveryEvent.agent_name).toBe(definition.name);
      expect(recoveryEvent.reason).toBe(AgentTerminateMode.MAX_TURNS);
      expect(recoveryEvent.success).toBe(false);
      expect(recoveryEvent.turn_count).toBe(1);
      expect(recoveryEvent.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should log a successful RecoveryAttemptEvent when recovery succeeds', async () => {
      const MAX = 1;
      const definition = createTestDefinition([LS_TOOL_NAME], {
        maxTurns: MAX,
      });
      const executor = await LocalAgentExecutor.create(definition, mockConfig);

      // Turn 1 (hits max_turns)
      mockWorkResponse('t1');

      // Recovery Turn (succeeds)
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Recovered!' },
            id: 't2',
          },
        ],
        'Recovering from max turns',
      );

      await executor.run({ goal: 'Turns recovery success' }, signal);

      expect(mockedLogRecoveryAttempt).toHaveBeenCalledTimes(1);
      const recoveryEvent = mockedLogRecoveryAttempt.mock.calls[0][1];
      expect(recoveryEvent).toBeInstanceOf(RecoveryAttemptEvent);
      expect(recoveryEvent.success).toBe(true);
      expect(recoveryEvent.reason).toBe(AgentTerminateMode.MAX_TURNS);
    });

    describe('Model Steering', () => {
      let configWithHints: Config;

      beforeEach(() => {
        configWithHints = makeFakeConfig({ modelSteering: true });
        vi.spyOn(configWithHints, 'getAgentRegistry').mockReturnValue({
          getAllAgentNames: () => [],
        } as unknown as AgentRegistry);
        vi.spyOn(configWithHints, 'getToolRegistry').mockReturnValue(
          parentToolRegistry,
        );
      });

      it('should inject user hints into the next turn after they are added', async () => {
        const definition = createTestDefinition();

        const executor = await LocalAgentExecutor.create(
          definition,
          configWithHints,
        );

        // Turn 1: Model calls LS
        mockModelResponse(
          [{ name: LS_TOOL_NAME, args: { path: '.' }, id: 'call1' }],
          'T1: Listing',
        );

        // We use a manual promise to ensure the hint is added WHILE Turn 1 is "running"
        let resolveToolCall: (value: unknown) => void;
        const toolCallPromise = new Promise((resolve) => {
          resolveToolCall = resolve;
        });
        mockScheduleAgentTools.mockReturnValueOnce(toolCallPromise);

        // Turn 2: Model calls complete_task
        mockModelResponse(
          [
            {
              name: TASK_COMPLETE_TOOL_NAME,
              args: { finalResult: 'Done' },
              id: 'call2',
            },
          ],
          'T2: Done',
        );

        const runPromise = executor.run({ goal: 'Hint test' }, signal);

        // Give the loop a chance to start and register the listener
        await vi.advanceTimersByTimeAsync(1);

        configWithHints.userHintService.addUserHint('Initial Hint');

        // Resolve the tool call to complete Turn 1
        resolveToolCall!([
          {
            status: 'success',
            request: {
              callId: 'call1',
              name: LS_TOOL_NAME,
              args: { path: '.' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
            tool: {} as AnyDeclarativeTool,
            invocation: {} as AnyToolInvocation,
            response: {
              callId: 'call1',
              resultDisplay: 'file1.txt',
              responseParts: [
                {
                  functionResponse: {
                    name: LS_TOOL_NAME,
                    response: { result: 'file1.txt' },
                    id: 'call1',
                  },
                },
              ],
            },
          },
        ]);

        await runPromise;

        // The first call to sendMessageStream should NOT contain the hint (it was added after start)
        // The SECOND call to sendMessageStream SHOULD contain the hint
        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
        const secondTurnMessageParts = mockSendMessageStream.mock.calls[1][1];
        expect(secondTurnMessageParts).toContainEqual(
          expect.objectContaining({
            text: expect.stringContaining('Initial Hint'),
          }),
        );
      });

      it('should NOT inject legacy hints added before executor was created', async () => {
        const definition = createTestDefinition();
        configWithHints.userHintService.addUserHint('Legacy Hint');

        const executor = await LocalAgentExecutor.create(
          definition,
          configWithHints,
        );

        mockModelResponse([
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Done' },
            id: 'call1',
          },
        ]);

        await executor.run({ goal: 'Isolation test' }, signal);

        // The first call to sendMessageStream should NOT contain the legacy hint
        expect(mockSendMessageStream).toHaveBeenCalled();
        const firstTurnMessageParts = mockSendMessageStream.mock.calls[0][1];
        // We expect only the goal, no hints injected at turn start
        for (const part of firstTurnMessageParts) {
          if (part.text) {
            expect(part.text).not.toContain('Legacy Hint');
          }
        }
      });

      it('should inject mid-execution hints into subsequent turns', async () => {
        const definition = createTestDefinition();
        const executor = await LocalAgentExecutor.create(
          definition,
          configWithHints,
        );

        // Turn 1: Model calls LS
        mockModelResponse(
          [{ name: LS_TOOL_NAME, args: { path: '.' }, id: 'call1' }],
          'T1: Listing',
        );

        // We use a manual promise to ensure the hint is added WHILE Turn 1 is "running"
        let resolveToolCall: (value: unknown) => void;
        const toolCallPromise = new Promise((resolve) => {
          resolveToolCall = resolve;
        });
        mockScheduleAgentTools.mockReturnValueOnce(toolCallPromise);

        // Turn 2: Model calls complete_task
        mockModelResponse(
          [
            {
              name: TASK_COMPLETE_TOOL_NAME,
              args: { finalResult: 'Done' },
              id: 'call2',
            },
          ],
          'T2: Done',
        );

        // Start execution
        const runPromise = executor.run({ goal: 'Mid-turn hint test' }, signal);

        // Small delay to ensure the run loop has reached the await and registered listener
        await vi.advanceTimersByTimeAsync(1);

        // Add the hint while the tool call is pending
        configWithHints.userHintService.addUserHint('Corrective Hint');

        // Now resolve the tool call to complete Turn 1
        resolveToolCall!([
          {
            status: 'success',
            request: {
              callId: 'call1',
              name: LS_TOOL_NAME,
              args: { path: '.' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
            tool: {} as AnyDeclarativeTool,
            invocation: {} as AnyToolInvocation,
            response: {
              callId: 'call1',
              resultDisplay: 'file1.txt',
              responseParts: [
                {
                  functionResponse: {
                    name: LS_TOOL_NAME,
                    response: { result: 'file1.txt' },
                    id: 'call1',
                  },
                },
              ],
            },
          },
        ]);

        await runPromise;

        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

        // The second turn (turn 1) should contain the corrective hint.
        const secondTurnMessageParts = mockSendMessageStream.mock.calls[1][1];
        expect(secondTurnMessageParts).toContainEqual(
          expect.objectContaining({
            text: expect.stringContaining('Corrective Hint'),
          }),
        );
      });
    });
  });
  describe('Chat Compression', () => {
    const mockWorkResponse = (id: string) => {
      mockModelResponse([{ name: LS_TOOL_NAME, args: { path: '.' }, id }]);
      mockScheduleAgentTools.mockResolvedValueOnce([
        {
          status: 'success',
          request: {
            callId: id,
            name: LS_TOOL_NAME,
            args: { path: '.' },
            isClientInitiated: false,
            prompt_id: 'test-prompt',
          },
          tool: {} as AnyDeclarativeTool,
          invocation: {} as AnyToolInvocation,
          response: {
            callId: id,
            resultDisplay: 'ok',
            responseParts: [
              { functionResponse: { name: LS_TOOL_NAME, response: {}, id } },
            ],
            error: undefined,
            errorType: undefined,
            contentLength: undefined,
          },
        },
      ]);
    };

    it('should attempt to compress chat history on each turn', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // Mock compression to do nothing
      mockCompress.mockResolvedValue({
        newHistory: null,
        info: { compressionStatus: CompressionStatus.NOOP },
      });

      // Turn 1
      mockWorkResponse('t1');

      // Turn 2: Complete
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Done' },
            id: 'call2',
          },
        ],
        'T2',
      );

      await executor.run({ goal: 'Compress test' }, signal);

      expect(mockCompress).toHaveBeenCalledTimes(2);
    });

    it('should update chat history when compression is successful', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      const compressedHistory: Content[] = [
        { role: 'user', parts: [{ text: 'compressed' }] },
      ];

      mockCompress.mockResolvedValue({
        newHistory: compressedHistory,
        info: { compressionStatus: CompressionStatus.COMPRESSED },
      });

      // Turn 1: Complete
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Done' },
            id: 'call1',
          },
        ],
        'T1',
      );

      await executor.run({ goal: 'Compress success' }, signal);

      expect(mockCompress).toHaveBeenCalledTimes(1);
      expect(mockSetHistory).toHaveBeenCalledTimes(1);
      expect(mockSetHistory).toHaveBeenCalledWith(compressedHistory);
    });

    it('should pass hasFailedCompressionAttempt=true to compression after a failure', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );

      // First call fails
      mockCompress.mockResolvedValueOnce({
        newHistory: null,
        info: {
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        },
      });
      // Second call is neutral
      mockCompress.mockResolvedValueOnce({
        newHistory: null,
        info: { compressionStatus: CompressionStatus.NOOP },
      });

      // Turn 1
      mockWorkResponse('t1');
      // Turn 2: Complete
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Done' },
            id: 't2',
          },
        ],
        'T2',
      );

      await executor.run({ goal: 'Compress fail' }, signal);

      expect(mockCompress).toHaveBeenCalledTimes(2);
      // First call, hasFailedCompressionAttempt is false
      expect(mockCompress.mock.calls[0][5]).toBe(false);
      // Second call, hasFailedCompressionAttempt is true
      expect(mockCompress.mock.calls[1][5]).toBe(true);
    });

    it('should reset hasFailedCompressionAttempt flag after a successful compression', async () => {
      const definition = createTestDefinition();
      const executor = await LocalAgentExecutor.create(
        definition,
        mockConfig,
        onActivity,
      );
      const compressedHistory: Content[] = [
        { role: 'user', parts: [{ text: 'compressed' }] },
      ];

      // Turn 1: Fails
      mockCompress.mockResolvedValueOnce({
        newHistory: null,
        info: {
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        },
      });
      // Turn 2: Succeeds
      mockCompress.mockResolvedValueOnce({
        newHistory: compressedHistory,
        info: { compressionStatus: CompressionStatus.COMPRESSED },
      });
      // Turn 3: Neutral
      mockCompress.mockResolvedValueOnce({
        newHistory: null,
        info: { compressionStatus: CompressionStatus.NOOP },
      });

      // Turn 1
      mockWorkResponse('t1');
      // Turn 2
      mockWorkResponse('t2');
      // Turn 3: Complete
      mockModelResponse(
        [
          {
            name: TASK_COMPLETE_TOOL_NAME,
            args: { finalResult: 'Done' },
            id: 't3',
          },
        ],
        'T3',
      );

      await executor.run({ goal: 'Compress reset' }, signal);

      expect(mockCompress).toHaveBeenCalledTimes(3);
      // Call 1: hasFailed... is false
      expect(mockCompress.mock.calls[0][5]).toBe(false);
      // Call 2: hasFailed... is true
      expect(mockCompress.mock.calls[1][5]).toBe(true);
      // Call 3: hasFailed... is false again
      expect(mockCompress.mock.calls[2][5]).toBe(false);

      expect(mockSetHistory).toHaveBeenCalledTimes(1);
      expect(mockSetHistory).toHaveBeenCalledWith(compressedHistory);
    });
  });
});
