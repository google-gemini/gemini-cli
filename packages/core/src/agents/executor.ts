/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import { Type } from '@google/genai';
import type {
  Content,
  Part,
  FunctionCall,
  GenerateContentConfig,
  FunctionDeclaration,
  Schema,
} from '@google/genai';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolCallRequestInfo } from '../core/turn.js';
import { getDirectoryContextString } from '../utils/environmentContext.js';
import { GlobTool } from '../tools/glob.js';
import { GrepTool } from '../tools/grep.js';
import { RipGrepTool } from '../tools/ripGrep.js';
import { LSTool } from '../tools/ls.js';
import { MemoryTool } from '../tools/memoryTool.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { WebSearchTool } from '../tools/web-search.js';
import type {
  AgentDefinition,
  AgentInputs,
  OutputObject,
  SubagentActivityEvent,
} from './types.js';
import { AgentTerminateMode } from './types.js';
import { templateString } from './utils.js';
import { parseThought } from '../utils/thoughtUtils.js';
import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** A callback function to report on agent activity. */
export type ActivityCallback = (activity: SubagentActivityEvent) => void;

const TASK_COMPLETE_TOOL_NAME = 'complete_task';

/**
 * Executes an agent loop based on an {@link AgentDefinition}.
 *
 * This executor runs the agent in a loop, calling tools until it calls the
 * mandatory `complete_task` tool to signal completion.
 */
export class AgentExecutor<TOutput extends z.ZodTypeAny> {
  readonly definition: AgentDefinition<TOutput>;

  private readonly agentId: string;
  private readonly toolRegistry: ToolRegistry;
  private readonly runtimeContext: Config;
  private readonly onActivity?: ActivityCallback;

  /**
   * Creates and validates a new `AgentExecutor` instance.
   *
   * This method ensures that all tools specified in the agent's definition are
   * safe for non-interactive use before creating the executor.
   *
   * @param definition The definition object for the agent.
   * @param runtimeContext The global runtime configuration.
   * @param onActivity An optional callback to receive activity events.
   * @returns A promise that resolves to a new `AgentExecutor` instance.
   */
  static async create<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
    runtimeContext: Config,
    onActivity?: ActivityCallback,
  ): Promise<AgentExecutor<TOutput>> {
    // Create an isolated tool registry for this agent instance.
    const agentToolRegistry = new ToolRegistry(runtimeContext);
    const parentToolRegistry = await runtimeContext.getToolRegistry();

    if (definition.toolConfig) {
      for (const toolRef of definition.toolConfig.tools) {
        if (typeof toolRef === 'string') {
          // If the tool is referenced by name, retrieve it from the parent
          // registry and register it with the agent's isolated registry.
          const toolFromParent = parentToolRegistry.getTool(toolRef);
          if (toolFromParent) {
            agentToolRegistry.registerTool(toolFromParent);
          }
        } else if (
          typeof toolRef === 'object' &&
          'name' in toolRef &&
          'build' in toolRef
        ) {
          agentToolRegistry.registerTool(toolRef);
        }
        // Note: Raw `FunctionDeclaration` objects in the config don't need to be
        // registered; their schemas are passed directly to the model later.
      }

      // Validate that all registered tools are safe for non-interactive
      // execution.
      await AgentExecutor.validateTools(agentToolRegistry, definition.name);
    }

    return new AgentExecutor(
      definition,
      runtimeContext,
      agentToolRegistry,
      onActivity,
    );
  }

  /**
   * Constructs a new AgentExecutor instance.
   *
   * @private This constructor is private. Use the static `create` method to
   * instantiate the class.
   */
  private constructor(
    definition: AgentDefinition<TOutput>,
    runtimeContext: Config,
    toolRegistry: ToolRegistry,
    onActivity?: ActivityCallback,
  ) {
    this.definition = definition;
    this.runtimeContext = runtimeContext;
    this.toolRegistry = toolRegistry;
    this.onActivity = onActivity;

    const randomIdPart = Math.random().toString(36).slice(2, 8);
    this.agentId = `${this.definition.name}-${randomIdPart}`;
  }

  /**
   * Runs the agent.
   *
   * @param inputs The validated input parameters for this invocation.
   * @param signal An `AbortSignal` for cancellation.
   * @returns A promise that resolves to the agent's final output.
   */
  async run(inputs: AgentInputs, signal: AbortSignal): Promise<OutputObject> {
    const startTime = Date.now();
    let turnCounter = 0;

    try {
      const chat = await this.createChatObject(inputs);
      const tools = this.prepareToolsList();
      let terminateReason = AgentTerminateMode.ERROR;
      let finalResult: string | null = null;

      const query = this.definition.promptConfig.query
        ? templateString(this.definition.promptConfig.query, inputs)
        : 'Get Started!';
      let currentMessage: Content = { role: 'user', parts: [{ text: query }] };

      while (true) {
        // Check for termination conditions like max turns or timeout.
        const reason = this.checkTermination(startTime, turnCounter);
        if (reason) {
          terminateReason = reason;
          break;
        }
        if (signal.aborted) {
          terminateReason = AgentTerminateMode.ABORTED;
          break;
        }

        // Call model
        const promptId = `${this.runtimeContext.getSessionId()}#${this.agentId}#${turnCounter++}`;
        const { functionCalls } = await this.callModel(
          chat,
          currentMessage,
          tools,
          signal,
          promptId,
        );

        if (signal.aborted) {
          terminateReason = AgentTerminateMode.ABORTED;
          break;
        }

        // If the model stops calling tools without calling complete_task, it's an error.
        if (functionCalls.length === 0) {
          terminateReason = AgentTerminateMode.ERROR;
          finalResult = `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}' to finalize the session.`;
          this.emitActivity('ERROR', {
            error: finalResult,
            context: 'protocol_violation',
          });
          break;
        }

        const { nextMessage, submittedOutput, taskCompleted } =
          await this.processFunctionCalls(functionCalls, signal, promptId);

        if (taskCompleted) {
          finalResult = submittedOutput ?? 'Task completed successfully.';
          terminateReason = AgentTerminateMode.GOAL;
          break;
        }

        currentMessage = nextMessage;
      }

      if (terminateReason === AgentTerminateMode.GOAL) {
        return {
          result: finalResult || 'Task completed.',
          terminate_reason: terminateReason,
        };
      }

      return {
        result:
          finalResult || 'Agent execution was terminated before completion.',
        terminate_reason: terminateReason,
      };
    } catch (error) {
      this.emitActivity('ERROR', { error: String(error) });
      throw error; // Re-throw the error for the parent context to handle.
    }
  }

  /**
   * Calls the generative model with the current context and tools.
   *
   * @returns The model's response, including any tool calls or text.
   */
  private async callModel(
    chat: GeminiChat,
    message: Content,
    tools: FunctionDeclaration[],
    signal: AbortSignal,
    promptId: string,
  ): Promise<{ functionCalls: FunctionCall[]; textResponse: string }> {
    const messageParams = {
      message: message.parts || [],
      config: {
        abortSignal: signal,
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      },
    };

    const responseStream = await chat.sendMessageStream(
      this.definition.modelConfig.model,
      messageParams,
      promptId,
    );

    const functionCalls: FunctionCall[] = [];
    let textResponse = '';

    for await (const resp of responseStream) {
      if (signal.aborted) break;

      if (resp.type === StreamEventType.CHUNK) {
        const chunk = resp.value;
        const parts = chunk.candidates?.[0]?.content?.parts;

        // Extract and emit any subject "thought" content from the model.
        const { subject } = parseThought(
          parts?.find((p) => p.thought)?.text || '',
        );
        if (subject) {
          this.emitActivity('THOUGHT_CHUNK', { text: subject });
        }

        // Collect any function calls requested by the model.
        if (chunk.functionCalls) {
          functionCalls.push(...chunk.functionCalls);
        }

        // Handle text response (non-thought text)
        const text =
          parts
            ?.filter((p) => !p.thought && p.text)
            .map((p) => p.text)
            .join('') || '';

        if (text) {
          textResponse += text;
        }
      }
    }

    return { functionCalls, textResponse };
  }

  /** Initializes a `GeminiChat` instance for the agent run. */
  private async createChatObject(inputs: AgentInputs): Promise<GeminiChat> {
    const { promptConfig, modelConfig } = this.definition;

    if (!promptConfig.systemPrompt && !promptConfig.initialMessages) {
      throw new Error(
        'PromptConfig must define either `systemPrompt` or `initialMessages`.',
      );
    }

    const startHistory = this.applyTemplateToInitialMessages(
      promptConfig.initialMessages ?? [],
      inputs,
    );

    // Build system instruction from the templated prompt string.
    const systemInstruction = promptConfig.systemPrompt
      ? await this.buildSystemPrompt(inputs)
      : undefined;

    try {
      const generationConfig: GenerateContentConfig = {
        temperature: modelConfig.temp,
        topP: modelConfig.top_p,
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: modelConfig.thinkingBudget ?? -1,
        },
      };

      if (systemInstruction) {
        generationConfig.systemInstruction = systemInstruction;
      }

      return new GeminiChat(
        this.runtimeContext,
        generationConfig,
        startHistory,
      );
    } catch (error) {
      await reportError(
        error,
        `Error initializing Gemini chat for agent ${this.definition.name}.`,
        startHistory,
        'startChat',
      );
      // Re-throw as a more specific error after reporting.
      throw new Error(`Failed to create chat object: ${error}`);
    }
  }

  /**
   * Executes function calls requested by the model and returns the results.
   *
   * @returns A new `Content` object for history, any submitted output, and completion status.
   */
  private async processFunctionCalls(
    functionCalls: FunctionCall[],
    signal: AbortSignal,
    promptId: string,
  ): Promise<{
    nextMessage: Content;
    submittedOutput: string | null;
    taskCompleted: boolean;
  }> {
    const allowedToolNames = new Set(this.toolRegistry.getAllToolNames());
    // Always allow the completion tool
    allowedToolNames.add(TASK_COMPLETE_TOOL_NAME);

    let submittedOutput: string | null = null;
    let taskCompleted = false;

    // We'll collect promises for the tool executions
    const toolExecutionPromises: Array<Promise<Part[] | void>> = [];
    // And we'll need a place to store the synchronous results (like complete_task or blocked calls)
    const syncResponseParts: Part[] = [];

    for (const [index, functionCall] of functionCalls.entries()) {
      const callId = functionCall.id ?? `${promptId}-${index}`;
      const args = (functionCall.args ?? {}) as Record<string, unknown>;

      this.emitActivity('TOOL_CALL_START', {
        name: functionCall.name,
        args,
      });

      if (functionCall.name === TASK_COMPLETE_TOOL_NAME) {
        if (taskCompleted) {
          // We already have a completion from this turn. Ignore subsequent ones.
          const error =
            'Task already marked complete in this turn. Ignoring duplicate call.';
          syncResponseParts.push({
            functionResponse: {
              name: TASK_COMPLETE_TOOL_NAME,
              response: { error },
              id: callId,
            },
          });
          this.emitActivity('ERROR', {
            context: 'tool_call',
            name: functionCall.name,
            error,
          });
          continue;
        }

        const { outputConfig } = this.definition;
        taskCompleted = true; // Signal completion regardless of output presence

        if (outputConfig) {
          const outputName = outputConfig.outputName;
          if (args[outputName] !== undefined) {
            const outputValue = args[outputName];
            const validationResult = outputConfig.schema.safeParse(outputValue);

            if (!validationResult.success) {
              taskCompleted = false; // Validation failed, revoke completion
              const error = `Output validation failed: ${JSON.stringify(validationResult.error.flatten())}`;
              syncResponseParts.push({
                functionResponse: {
                  name: TASK_COMPLETE_TOOL_NAME,
                  response: { error },
                  id: callId,
                },
              });
              this.emitActivity('ERROR', {
                context: 'tool_call',
                name: functionCall.name,
                error,
              });
              continue;
            }

            const validatedOutput = validationResult.data;
            if (this.definition.processOutput) {
              submittedOutput = this.definition.processOutput(validatedOutput);
            } else {
              submittedOutput =
                typeof outputValue === 'string'
                  ? outputValue
                  : JSON.stringify(outputValue, null, 2);
            }
            syncResponseParts.push({
              functionResponse: {
                name: TASK_COMPLETE_TOOL_NAME,
                response: { result: 'Output submitted and task completed.' },
                id: callId,
              },
            });
            this.emitActivity('TOOL_CALL_END', {
              name: functionCall.name,
              output: 'Output submitted and task completed.',
            });
          } else {
            // Failed to provide required output.
            taskCompleted = false; // Revoke completion status
            const error = `Missing required argument '${outputName}' for completion.`;
            syncResponseParts.push({
              functionResponse: {
                name: TASK_COMPLETE_TOOL_NAME,
                response: { error },
                id: callId,
              },
            });
            this.emitActivity('ERROR', {
              context: 'tool_call',
              name: functionCall.name,
              error,
            });
          }
        } else {
          // No output expected. Just signal completion.
          submittedOutput = 'Task completed successfully.';
          syncResponseParts.push({
            functionResponse: {
              name: TASK_COMPLETE_TOOL_NAME,
              response: { status: 'Task marked complete.' },
              id: callId,
            },
          });
          this.emitActivity('TOOL_CALL_END', {
            name: functionCall.name,
            output: 'Task marked complete.',
          });
        }
        continue;
      }

      // Handle standard tools
      if (!allowedToolNames.has(functionCall.name as string)) {
        const error = `Unauthorized tool call: '${functionCall.name}' is not available to this agent.`;

        console.warn(`[AgentExecutor] Blocked call: ${error}`);

        syncResponseParts.push({
          functionResponse: {
            name: functionCall.name as string,
            id: callId,
            response: { error },
          },
        });

        this.emitActivity('ERROR', {
          context: 'tool_call_unauthorized',
          name: functionCall.name,
          callId,
          error,
        });

        continue;
      }

      const requestInfo: ToolCallRequestInfo = {
        callId,
        name: functionCall.name as string,
        args,
        isClientInitiated: true,
        prompt_id: promptId,
      };

      // Create a promise for the tool execution
      const executionPromise = (async () => {
        const toolResponse = await executeToolCall(
          this.runtimeContext,
          requestInfo,
          signal,
        );

        if (toolResponse.error) {
          this.emitActivity('ERROR', {
            context: 'tool_call',
            name: functionCall.name,
            error: toolResponse.error.message,
          });
        } else {
          this.emitActivity('TOOL_CALL_END', {
            name: functionCall.name,
            output: toolResponse.resultDisplay,
          });
        }

        return toolResponse.responseParts;
      })();

      toolExecutionPromises.push(executionPromise);
    }

    // Wait for all tool executions to complete
    const asyncResults = await Promise.all(toolExecutionPromises);

    // Combine all response parts
    const toolResponseParts: Part[] = [...syncResponseParts];
    for (const result of asyncResults) {
      if (result) {
        toolResponseParts.push(...result);
      }
    }

    // If all authorized tool calls failed (and task isn't complete), provide a generic error.
    if (
      functionCalls.length > 0 &&
      toolResponseParts.length === 0 &&
      !taskCompleted
    ) {
      toolResponseParts.push({
        text: 'All tool calls failed or were unauthorized. Please analyze the errors and try an alternative approach.',
      });
    }

    return {
      nextMessage: { role: 'user', parts: toolResponseParts },
      submittedOutput,
      taskCompleted,
    };
  }

  /**
   * Prepares the list of tool function declarations to be sent to the model.
   */
  private prepareToolsList(): FunctionDeclaration[] {
    const toolsList: FunctionDeclaration[] = [];
    const { toolConfig, outputConfig } = this.definition;

    if (toolConfig) {
      const toolNamesToLoad: string[] = [];
      for (const toolRef of toolConfig.tools) {
        if (typeof toolRef === 'string') {
          toolNamesToLoad.push(toolRef);
        } else if (typeof toolRef === 'object' && 'schema' in toolRef) {
          // Tool instance with an explicit schema property.
          toolsList.push(toolRef.schema as FunctionDeclaration);
        } else {
          // Raw `FunctionDeclaration` object.
          toolsList.push(toolRef as FunctionDeclaration);
        }
      }
      // Add schemas from tools that were registered by name.
      toolsList.push(
        ...this.toolRegistry.getFunctionDeclarationsFiltered(toolNamesToLoad),
      );
    }

    // Always inject complete_task.
    // Configure its schema based on whether output is expected.
    const completeTool: FunctionDeclaration = {
      name: TASK_COMPLETE_TOOL_NAME,
      description: outputConfig
        ? 'Call this tool to submit your final answer and complete the task. This is the ONLY way to finish.'
        : 'Call this tool to signal that you have completed your task. This is the ONLY way to finish.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: [],
      },
    };

    if (outputConfig) {
      const jsonSchema = zodToJsonSchema(outputConfig.schema);
      const {
        $schema: _$schema,
        definitions: _definitions,
        ...schema
      } = jsonSchema;
      completeTool.parameters!.properties![outputConfig.outputName] =
        schema as Schema;
      completeTool.parameters!.required!.push(outputConfig.outputName);
    }

    toolsList.push(completeTool);

    return toolsList;
  }

  /** Builds the system prompt from the agent definition and inputs. */
  private async buildSystemPrompt(inputs: AgentInputs): Promise<string> {
    const { promptConfig } = this.definition;
    if (!promptConfig.systemPrompt) {
      return '';
    }

    // Inject user inputs into the prompt template.
    let finalPrompt = templateString(promptConfig.systemPrompt, inputs);

    // Append environment context (CWD and folder structure).
    const dirContext = await getDirectoryContextString(this.runtimeContext);
    finalPrompt += `\n\n# Environment Context\n${dirContext}`;

    // Append standard rules for non-interactive execution.
    finalPrompt += `
Important Rules:
* You are running in a non-interactive mode. You CANNOT ask the user for input or clarification.
* Work systematically using available tools to complete your task.
* Always use absolute paths for file operations. Construct them using the provided "Environment Context".`;

    finalPrompt += `
* When you have completed your task, you MUST call the \`${TASK_COMPLETE_TOOL_NAME}\` tool.
* Do not call any other tools in the same turn as \`${TASK_COMPLETE_TOOL_NAME}\`.
* This is the ONLY way to complete your mission. If you stop calling tools without calling this, you have failed.`;

    return finalPrompt;
  }

  /**
   * Applies template strings to initial messages.
   *
   * @param initialMessages The initial messages from the prompt config.
   * @param inputs The validated input parameters for this invocation.
   * @returns A new array of `Content` with templated strings.
   */
  private applyTemplateToInitialMessages(
    initialMessages: Content[],
    inputs: AgentInputs,
  ): Content[] {
    return initialMessages.map((content) => {
      const newParts = (content.parts ?? []).map((part) => {
        if ('text' in part && part.text !== undefined) {
          return { text: templateString(part.text, inputs) };
        }
        return part;
      });
      return { ...content, parts: newParts };
    });
  }

  /**
   * Validates that all tools in a registry are safe for non-interactive use.
   *
   * @throws An error if a tool is not on the allow-list for non-interactive execution.
   */
  private static async validateTools(
    toolRegistry: ToolRegistry,
    agentName: string,
  ): Promise<void> {
    // Tools that are non-interactive. This is temporary until we have tool
    // confirmations for subagents.
    const allowlist = new Set([
      LSTool.Name,
      ReadFileTool.Name,
      GrepTool.Name,
      RipGrepTool.Name,
      GlobTool.Name,
      ReadManyFilesTool.Name,
      MemoryTool.Name,
      WebSearchTool.Name,
    ]);
    for (const tool of toolRegistry.getAllTools()) {
      if (!allowlist.has(tool.name)) {
        throw new Error(
          `Tool "${tool.name}" is not on the allow-list for non-interactive ` +
            `execution in agent "${agentName}". Only tools that do not require user ` +
            `confirmation can be used in subagents.`,
        );
      }
    }
  }

  /**
   * Checks if the agent should terminate due to exceeding configured limits.
   *
   * @returns The reason for termination, or `null` if execution can continue.
   */
  private checkTermination(
    startTime: number,
    turnCounter: number,
  ): AgentTerminateMode | null {
    const { runConfig } = this.definition;

    if (runConfig.max_turns && turnCounter >= runConfig.max_turns) {
      return AgentTerminateMode.MAX_TURNS;
    }

    const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
    if (elapsedMinutes >= runConfig.max_time_minutes) {
      return AgentTerminateMode.TIMEOUT;
    }

    return null;
  }

  /** Emits an activity event to the configured callback. */
  private emitActivity(
    type: SubagentActivityEvent['type'],
    data: Record<string, unknown>,
  ): void {
    if (this.onActivity) {
      const event: SubagentActivityEvent = {
        isSubagentActivityEvent: true,
        agentName: this.definition.name,
        type,
        data,
      };
      this.onActivity(event);
    }
  }
}
