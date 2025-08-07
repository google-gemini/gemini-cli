/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, Mock, afterEach } from 'vitest';
import {
  ContextState,
  SubAgentScope,
  SubagentTerminateMode,
  PromptConfig,
  ModelConfig,
  RunConfig,
  OutputConfig,
  ToolConfig,
} from './subagent.js';
import { Config, ConfigParameters } from '../config/config.js';
import { GeminiChat } from './geminiChat.js';
import { createContentGenerator } from './contentGenerator.js';
import { getEnvironmentContext } from '../utils/environmentContext.js';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GenerateContentConfig,
  Type,
} from '@google/genai';
import { ToolErrorType } from '../tools/tool-error.js';

vi.mock('./geminiChat.js');
vi.mock('./contentGenerator.js');
vi.mock('../utils/environmentContext.js');
vi.mock('./nonInteractiveToolExecutor.js');
vi.mock('../ide/ide-client.js');

async function createMockConfig(
  toolRegistryMocks = {},
): Promise<{ config: Config; toolRegistry: ToolRegistry }> {
  const configParams: ConfigParameters = {
    sessionId: 'test-session',
    model: DEFAULT_GEMINI_MODEL,
    targetDir: '.',
    debugMode: false,
    cwd: process.cwd(),
  };
  const config = new Config(configParams);
  await config.initialize();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await config.refreshAuth('test-auth' as any);

  // Mock ToolRegistry
  const mockToolRegistry = {
    getTool: vi.fn(),
    getFunctionDeclarationsFiltered: vi.fn().mockReturnValue([]),
    ...toolRegistryMocks,
  } as unknown as ToolRegistry;

  vi.spyOn(config, 'getToolRegistry').mockResolvedValue(mockToolRegistry);
  return { config, toolRegistry: mockToolRegistry };
}

// Helper to simulate LLM responses (sequence of tool calls over multiple turns)
const createMockStream = (
  functionCallsList: Array<FunctionCall[] | 'stop'>,
) => {
  let index = 0;
  return vi.fn().mockImplementation(() => {
    const response = functionCallsList[index] || 'stop';
    index++;
    return (async function* () {
      if (response === 'stop') {
        // When stopping, the model might return text, but the subagent logic primarily cares about the absence of functionCalls.
        yield { text: 'Done.' };
      } else if (response.length > 0) {
        yield { functionCalls: response };
      } else {
        yield { text: 'Done.' }; // Handle empty array also as stop
      }
    })();
  });
};

describe('subagent.ts', () => {
  describe('ContextState', () => {
    it('should set and get values correctly', () => {
      const context = new ContextState();
      context.set('key1', 'value1');
      context.set('key2', 123);
      expect(context.get('key1')).toBe('value1');
      expect(context.get('key2')).toBe(123);
      expect(context.get_keys()).toEqual(['key1', 'key2']);
    });

    it('should return undefined for missing keys', () => {
      const context = new ContextState();
      expect(context.get('missing')).toBeUndefined();
    });
  });

  describe('SubAgentScope', () => {
    let mockSendMessageStream: Mock;

    const defaultModelConfig: ModelConfig = {
      model: 'gemini-1.5-flash-latest',
      temp: 0.5, // Specific temp to test override
      top_p: 1,
    };

    const defaultRunConfig: RunConfig = {
      max_time_minutes: 5,
      max_turns: 10,
    };

    beforeEach(async () => {
      vi.clearAllMocks();

      vi.mocked(getEnvironmentContext).mockResolvedValue([
        { text: 'Env Context' },
      ]);
      vi.mocked(createContentGenerator).mockResolvedValue({
        getGenerativeModel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      mockSendMessageStream = vi.fn();
      // We mock the implementation of the constructor.
      vi.mocked(GeminiChat).mockImplementation(
        () =>
          ({
            sendMessageStream: mockSendMessageStream,
          }) as unknown as GeminiChat,
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Helper to safely access generationConfig from mock calls
    const getGenerationConfigFromMock = (
      callIndex = 0,
    ): GenerateContentConfig & { systemInstruction?: string | Content } => {
      const callArgs = vi.mocked(GeminiChat).mock.calls[callIndex];
      const generationConfig = callArgs?.[2];
      // Ensure it's defined before proceeding
      expect(generationConfig).toBeDefined();
      if (!generationConfig) throw new Error('generationConfig is undefined');
      return generationConfig as GenerateContentConfig & {
        systemInstruction?: string | Content;
      };
    };

    describe('create (Tool Validation)', () => {
      const promptConfig: PromptConfig = { systemPrompt: 'Test prompt' };

      it('should create a SubAgentScope successfully with minimal config', async () => {
        const { config } = await createMockConfig();
        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );
        expect(scope).toBeInstanceOf(SubAgentScope);
      });

      it('should throw an error if a tool requires confirmation', async () => {
        const mockTool = {
          schema: { parameters: { type: Type.OBJECT, properties: {} } },
          build: vi.fn().mockReturnValue({
            shouldConfirmExecute: vi.fn().mockResolvedValue({
              type: 'exec',
              title: 'Confirm',
              command: 'rm -rf /',
            }),
          }),
        };

        const { config } = await createMockConfig({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getTool: vi.fn().mockReturnValue(mockTool as any),
        });

        const toolConfig: ToolConfig = { tools: ['risky_tool'] };

        await expect(
          SubAgentScope.create(
            'test-agent',
            config,
            promptConfig,
            defaultModelConfig,
            defaultRunConfig,
            toolConfig,
          ),
        ).rejects.toThrow(
          'Tool "risky_tool" requires user confirmation and cannot be used in a non-interactive subagent.',
        );
      });

      it('should succeed if tools do not require confirmation', async () => {
        const mockTool = {
          schema: { parameters: { type: Type.OBJECT, properties: {} } },
          build: vi.fn().mockReturnValue({
            shouldConfirmExecute: vi.fn().mockResolvedValue(null),
          }),
        };
        const { config } = await createMockConfig({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getTool: vi.fn().mockReturnValue(mockTool as any),
        });

        const toolConfig: ToolConfig = { tools: ['safe_tool'] };

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          toolConfig,
        );
        expect(scope).toBeInstanceOf(SubAgentScope);
      });

      it('should skip interactivity check and warn for tools with required parameters', async () => {
        const consoleWarnSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        const mockToolWithParams = {
          schema: {
            parameters: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING },
              },
              required: ['path'],
            },
          },
          // build should not be called, but we mock it to be safe
          build: vi.fn(),
        };

        const { config } = await createMockConfig({
          getTool: vi.fn().mockReturnValue(mockToolWithParams),
        });

        const toolConfig: ToolConfig = { tools: ['tool_with_params'] };

        // The creation should succeed without throwing
        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          toolConfig,
        );

        expect(scope).toBeInstanceOf(SubAgentScope);

        // Check that the warning was logged
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Cannot check tool "tool_with_params" for interactivity because it requires parameters. Assuming it is safe for non-interactive use.',
        );

        // Ensure build was never called
        expect(mockToolWithParams.build).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
      });
    });

    describe('runNonInteractive - Initialization and Prompting', () => {
      it('should correctly template the system prompt and initialize GeminiChat', async () => {
        const { config } = await createMockConfig();

        vi.mocked(GeminiChat).mockClear();

        const promptConfig: PromptConfig = {
          systemPrompt: 'Hello ${name}, your task is ${task}.',
        };
        const context = new ContextState();
        context.set('name', 'Agent');
        context.set('task', 'Testing');

        // Model stops immediately
        mockSendMessageStream.mockImplementation(createMockStream(['stop']));

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );

        await scope.runNonInteractive(context);

        // Check if GeminiChat was initialized correctly by the subagent
        expect(GeminiChat).toHaveBeenCalledTimes(1);
        const callArgs = vi.mocked(GeminiChat).mock.calls[0];

        // Check Generation Config
        const generationConfig = getGenerationConfigFromMock();

        // Check temperature override
        expect(generationConfig.temperature).toBe(defaultModelConfig.temp);
        expect(generationConfig.systemInstruction).toContain(
          'Hello Agent, your task is Testing.',
        );
        expect(generationConfig.systemInstruction).toContain(
          'Important Rules:',
        );

        // Check History (should include environment context)
        const history = callArgs[3];
        expect(history).toEqual([
          { role: 'user', parts: [{ text: 'Env Context' }] },
          {
            role: 'model',
            parts: [{ text: 'Got it. Thanks for the context!' }],
          },
        ]);
      });

      it('should include output instructions in the system prompt when outputs are defined', async () => {
        const { config } = await createMockConfig();
        vi.mocked(GeminiChat).mockClear();

        const promptConfig: PromptConfig = { systemPrompt: 'Do the task.' };
        const outputConfig: OutputConfig = {
          outputs: {
            result1: 'The first result',
          },
        };
        const context = new ContextState();

        // Model stops immediately
        mockSendMessageStream.mockImplementation(createMockStream(['stop']));

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          undefined, // ToolConfig
          outputConfig,
        );

        await scope.runNonInteractive(context);

        const generationConfig = getGenerationConfigFromMock();
        const systemInstruction = generationConfig.systemInstruction as string;

        expect(systemInstruction).toContain('Do the task.');
        expect(systemInstruction).toContain(
          'you MUST emit the required output variables',
        );
        expect(systemInstruction).toContain(
          "Use 'self.emitvalue' to emit the 'result1' key",
        );
      });

      it('should use initialMessages instead of systemPrompt if provided', async () => {
        const { config } = await createMockConfig();
        vi.mocked(GeminiChat).mockClear();

        const initialMessages: Content[] = [
          { role: 'user', parts: [{ text: 'Hi' }] },
        ];
        const promptConfig: PromptConfig = { initialMessages };
        const context = new ContextState();

        // Model stops immediately
        mockSendMessageStream.mockImplementation(createMockStream(['stop']));

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );

        await scope.runNonInteractive(context);

        const callArgs = vi.mocked(GeminiChat).mock.calls[0];
        const generationConfig = getGenerationConfigFromMock();
        const history = callArgs[3];

        expect(generationConfig.systemInstruction).toBeUndefined();
        expect(history).toEqual([
          { role: 'user', parts: [{ text: 'Env Context' }] },
          {
            role: 'model',
            parts: [{ text: 'Got it. Thanks for the context!' }],
          },
          ...initialMessages,
        ]);
      });

      it('should throw an error if template variables are missing', async () => {
        const { config } = await createMockConfig();
        const promptConfig: PromptConfig = {
          systemPrompt: 'Hello ${name}, you are missing ${missing}.',
        };
        const context = new ContextState();
        context.set('name', 'Agent');
        // 'missing' is not set

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );

        // The error from templating causes the runNonInteractive to reject and the terminate_reason to be ERROR.
        await expect(scope.runNonInteractive(context)).rejects.toThrow(
          'Missing context values for the following keys: missing',
        );
        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.ERROR);
      });

      it('should validate that systemPrompt and initialMessages are mutually exclusive', async () => {
        const { config } = await createMockConfig();
        const promptConfig: PromptConfig = {
          systemPrompt: 'System',
          initialMessages: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        };
        const context = new ContextState();

        const agent = await SubAgentScope.create(
          'TestAgent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );

        await expect(agent.runNonInteractive(context)).rejects.toThrow(
          'PromptConfig cannot have both `systemPrompt` and `initialMessages` defined.',
        );
        expect(agent.output.terminate_reason).toBe(SubagentTerminateMode.ERROR);
      });
    });

    describe('runNonInteractive - Execution and Tool Use', () => {
      const promptConfig: PromptConfig = { systemPrompt: 'Execute task.' };

      it('should terminate with GOAL if no outputs are expected and model stops', async () => {
        const { config } = await createMockConfig();
        // Model stops immediately
        mockSendMessageStream.mockImplementation(createMockStream(['stop']));

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          // No ToolConfig, No OutputConfig
        );

        await scope.runNonInteractive(new ContextState());

        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.GOAL);
        expect(scope.output.emitted_vars).toEqual({});
        expect(mockSendMessageStream).toHaveBeenCalledTimes(1);
        // Check the initial message
        expect(mockSendMessageStream.mock.calls[0][0].message).toEqual([
          { text: 'Get Started!' },
        ]);
      });

      it('should handle self.emitvalue and terminate with GOAL when outputs are met', async () => {
        const { config } = await createMockConfig();
        const outputConfig: OutputConfig = {
          outputs: { result: 'The final result' },
        };

        // Turn 1: Model responds with emitvalue call
        // Turn 2: Model stops after receiving the tool response
        mockSendMessageStream.mockImplementation(
          createMockStream([
            [
              {
                name: 'self.emitvalue',
                args: {
                  emit_variable_name: 'result',
                  emit_variable_value: 'Success!',
                },
              },
            ],
            'stop',
          ]),
        );

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          undefined,
          outputConfig,
        );

        await scope.runNonInteractive(new ContextState());

        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.GOAL);
        expect(scope.output.emitted_vars).toEqual({ result: 'Success!' });
        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);

        // Check the tool response sent back in the second call
        const secondCallArgs = mockSendMessageStream.mock.calls[1][0];
        expect(secondCallArgs.message).toEqual([
          { text: 'Emitted variable result successfully' },
        ]);
      });

      it('should execute external tools and provide the response to the model', async () => {
        const listFilesToolDef: FunctionDeclaration = {
          name: 'list_files',
          description: 'Lists files',
          parameters: { type: Type.OBJECT, properties: {} },
        };

        const { config, toolRegistry } = await createMockConfig({
          getFunctionDeclarationsFiltered: vi
            .fn()
            .mockReturnValue([listFilesToolDef]),
        });
        const toolConfig: ToolConfig = { tools: ['list_files'] };

        // Turn 1: Model calls the external tool
        // Turn 2: Model stops
        mockSendMessageStream.mockImplementation(
          createMockStream([
            [
              {
                id: 'call_1',
                name: 'list_files',
                args: { path: '.' },
              },
            ],
            'stop',
          ]),
        );

        // Mock the tool execution result
        vi.mocked(executeToolCall).mockResolvedValue({
          callId: 'call_1',
          responseParts: 'file1.txt\nfile2.ts',
          resultDisplay: 'Listed 2 files',
          error: undefined,
          errorType: undefined, // Or ToolErrorType.NONE if available and appropriate
        });

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          toolConfig,
        );

        await scope.runNonInteractive(new ContextState());

        // Check tool execution
        expect(executeToolCall).toHaveBeenCalledWith(
          config,
          expect.objectContaining({ name: 'list_files', args: { path: '.' } }),
          toolRegistry,
          expect.any(AbortSignal),
        );

        // Check the response sent back to the model
        const secondCallArgs = mockSendMessageStream.mock.calls[1][0];
        expect(secondCallArgs.message).toEqual([
          { text: 'file1.txt\nfile2.ts' },
        ]);

        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.GOAL);
      });

      it('should provide specific tool error responses to the model', async () => {
        const { config } = await createMockConfig();
        const toolConfig: ToolConfig = { tools: ['failing_tool'] };

        // Turn 1: Model calls the failing tool
        // Turn 2: Model stops after receiving the error response
        mockSendMessageStream.mockImplementation(
          createMockStream([
            [
              {
                id: 'call_fail',
                name: 'failing_tool',
                args: {},
              },
            ],
            'stop',
          ]),
        );

        // Mock the tool execution failure.
        vi.mocked(executeToolCall).mockResolvedValue({
          callId: 'call_fail',
          responseParts: 'ERROR: Tool failed catastrophically', // This should be sent to the model
          resultDisplay: 'Tool failed catastrophically',
          error: new Error('Failure'),
          errorType: ToolErrorType.INVALID_TOOL_PARAMS,
        });

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          toolConfig,
        );

        await scope.runNonInteractive(new ContextState());

        // The agent should send the specific error message from responseParts.
        const secondCallArgs = mockSendMessageStream.mock.calls[1][0];

        expect(secondCallArgs.message).toEqual([
          {
            text: 'ERROR: Tool failed catastrophically',
          },
        ]);
      });

      it('should nudge the model if it stops before emitting all required variables', async () => {
        const { config } = await createMockConfig();
        const outputConfig: OutputConfig = {
          outputs: { required_var: 'Must be present' },
        };

        // Turn 1: Model stops prematurely
        // Turn 2: Model responds to the nudge and emits the variable
        // Turn 3: Model stops
        mockSendMessageStream.mockImplementation(
          createMockStream([
            'stop',
            [
              {
                name: 'self.emitvalue',
                args: {
                  emit_variable_name: 'required_var',
                  emit_variable_value: 'Here it is',
                },
              },
            ],
            'stop',
          ]),
        );

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
          undefined,
          outputConfig,
        );

        await scope.runNonInteractive(new ContextState());

        // Check the nudge message sent in Turn 2
        const secondCallArgs = mockSendMessageStream.mock.calls[1][0];

        // We check that the message contains the required variable name and the nudge phrasing.
        expect(secondCallArgs.message[0].text).toContain('required_var');
        expect(secondCallArgs.message[0].text).toContain(
          'You have stopped calling tools',
        );

        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.GOAL);
        expect(scope.output.emitted_vars).toEqual({
          required_var: 'Here it is',
        });
        expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
      });
    });

    describe('runNonInteractive - Termination and Recovery', () => {
      const promptConfig: PromptConfig = { systemPrompt: 'Execute task.' };

      it('should terminate with MAX_TURNS if the limit is reached', async () => {
        const { config } = await createMockConfig();
        const runConfig: RunConfig = { ...defaultRunConfig, max_turns: 2 };

        // Model keeps looping by calling emitvalue repeatedly
        mockSendMessageStream.mockImplementation(
          createMockStream([
            [
              {
                name: 'self.emitvalue',
                args: { emit_variable_name: 'loop', emit_variable_value: 'v1' },
              },
            ],
            [
              {
                name: 'self.emitvalue',
                args: { emit_variable_name: 'loop', emit_variable_value: 'v2' },
              },
            ],
            // This turn should not happen
            [
              {
                name: 'self.emitvalue',
                args: { emit_variable_name: 'loop', emit_variable_value: 'v3' },
              },
            ],
          ]),
        );

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          runConfig,
        );

        await scope.runNonInteractive(new ContextState());

        expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
        expect(scope.output.terminate_reason).toBe(
          SubagentTerminateMode.MAX_TURNS,
        );
      });

      it('should terminate with TIMEOUT if the time limit is reached during an LLM call', async () => {
        // Use fake timers to reliably test timeouts
        vi.useFakeTimers();

        const { config } = await createMockConfig();
        const runConfig: RunConfig = { max_time_minutes: 5, max_turns: 100 };

        // We need to control the resolution of the sendMessageStream promise to advance the timer during execution.
        let resolveStream: (
          value: AsyncGenerator<unknown, void, unknown>,
        ) => void;
        const streamPromise = new Promise<
          AsyncGenerator<unknown, void, unknown>
        >((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolveStream = resolve as any;
        });

        // The LLM call will hang until we resolve the promise.
        mockSendMessageStream.mockReturnValue(streamPromise);

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          runConfig,
        );

        const runPromise = scope.runNonInteractive(new ContextState());

        // Advance time beyond the limit (6 minutes) while the agent is awaiting the LLM response.
        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

        // Now resolve the stream. The model returns 'stop'.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolveStream!(createMockStream(['stop'])() as any);

        await runPromise;

        expect(scope.output.terminate_reason).toBe(
          SubagentTerminateMode.TIMEOUT,
        );
        expect(mockSendMessageStream).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
      });

      it('should terminate with ERROR if the model call throws', async () => {
        const { config } = await createMockConfig();
        mockSendMessageStream.mockRejectedValue(new Error('API Failure'));

        const scope = await SubAgentScope.create(
          'test-agent',
          config,
          promptConfig,
          defaultModelConfig,
          defaultRunConfig,
        );

        await expect(
          scope.runNonInteractive(new ContextState()),
        ).rejects.toThrow('API Failure');
        expect(scope.output.terminate_reason).toBe(SubagentTerminateMode.ERROR);
      });
    });
  });
});
