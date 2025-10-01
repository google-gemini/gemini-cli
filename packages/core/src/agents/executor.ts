/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import type {
  Content,
  Part,
  FunctionCall,
  GenerateContentConfig,
  FunctionDeclaration,
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

/** A callback function to report on agent activity. */
export type ActivityCallback = (activity: SubagentActivityEvent) => void;

/**
 * Executes an agent loop based on an {@link AgentDefinition}.
 *
 * This executor uses a simplified two-phase approach:
 * 1.  **Work Phase:** The agent runs in a loop, calling tools until it has
 * gathered all necessary information to fulfill its goal.
 * 2.  **Extraction Phase:** A final prompt is sent to the model to summarize
 * the work and extract the final result in the desired format.
 */
export class AgentExecutor {
  readonly definition: AgentDefinition;

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
  static async create(
    definition: AgentDefinition,
    runtimeContext: Config,
    onActivity?: ActivityCallback,
  ): Promise<AgentExecutor> {
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
    definition: AgentDefinition,
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
      let terminateReason = AgentTerminateMode.GOAL;

      // Phase 1: Work Phase
      // The agent works in a loop until it stops calling tools.
      let currentMessages: Content[] = [
        { role: 'user', parts: [{ text: 'Get Started!' }] },
      ];

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
          currentMessages,
          tools,
          signal,
          promptId,
        );

        if (signal.aborted) {
          terminateReason = AgentTerminateMode.ABORTED;
          break;
        }

        // If the model stops calling tools, the work phase is complete.
        if (functionCalls.length === 0) {
          break;
        }

        currentMessages = await this.processFunctionCalls(
          functionCalls,
          signal,
          promptId,
        );
      }

      // If the work phase was terminated early, skip extraction and return.
      if (terminateReason !== AgentTerminateMode.GOAL) {
        return {
          result: 'Agent execution was terminated before completion.',
          terminate_reason: terminateReason,
        };
      }

      // Phase 2: Extraction Phase
      // A final message is sent to summarize findings and produce the output.
      const extractionMessage = this.buildExtractionMessage();
      const extractionMessages: Content[] = [
        { role: 'user', parts: [{ text: extractionMessage }] },
      ];

      const extractionPromptId = `${this.runtimeContext.getSessionId()}#${this.agentId}#extraction`;

      // TODO: Consider if we should keep tools to avoid cache reset.
      const { textResponse } = await this.callModel(
        chat,
        extractionMessages,
        [], // No tools are available in the extraction phase.
        signal,
        extractionPromptId,
      );

      return {
        result: textResponse || 'No response generated',
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
    messages: Content[],
    tools: FunctionDeclaration[],
    signal: AbortSignal,
    promptId: string,
  ): Promise<{ functionCalls: FunctionCall[]; textResponse: string }> {
    const messageParams = {
      message: messages[0]?.parts || [],
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

    const startHistory = [...(promptConfig.initialMessages ?? [])];

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
   * @returns A new `Content` object to be added to the chat history.
   */
  private async processFunctionCalls(
    functionCalls: FunctionCall[],
    signal: AbortSignal,
    promptId: string,
  ): Promise<Content[]> {
    const allowedToolNames = new Set(this.toolRegistry.getAllToolNames());

    // Filter out any tool calls that are not in the agent's allowed list.
    const validatedFunctionCalls = functionCalls.filter((call) => {
      if (!allowedToolNames.has(call.name as string)) {
        console.warn(
          `[AgentExecutor] Agent '${this.definition.name}' attempted to call ` +
            `unauthorized tool '${call.name}'. This call has been blocked.`,
        );
        return false;
      }
      return true;
    });

    const toolPromises = validatedFunctionCalls.map(async (functionCall) => {
      const callId = functionCall.id ?? `${functionCall.name}-${Date.now()}`;
      const args = functionCall.args ?? {};

      this.emitActivity('TOOL_CALL_START', {
        name: functionCall.name,
        args,
      });

      const requestInfo: ToolCallRequestInfo = {
        callId,
        name: functionCall.name as string,
        args: args as Record<string, unknown>,
        isClientInitiated: true,
        prompt_id: promptId,
      };

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

      return toolResponse;
    });

    const toolResponses = await Promise.all(toolPromises);
    const toolResponseParts: Part[] = toolResponses
      .flatMap((response) => response.responseParts)
      .filter((part): part is Part => part !== undefined);

    // If all authorized tool calls failed, provide a generic error message
    // to the model so it can try a different approach.
    if (functionCalls.length > 0 && toolResponseParts.length === 0) {
      toolResponseParts.push({
        text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
      });
    }

    return [{ role: 'user', parts: toolResponseParts }];
  }

  /**
   * Prepares the list of tool function declarations to be sent to the model.
   */
  private prepareToolsList(): FunctionDeclaration[] {
    const toolsList: FunctionDeclaration[] = [];
    const { toolConfig } = this.definition;

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

    return toolsList;
  }

  /** Builds the system prompt from the agent definition and inputs. */
  private async buildSystemPrompt(inputs: AgentInputs): Promise<string> {
    const { promptConfig, outputConfig } = this.definition;
    if (!promptConfig.systemPrompt) {
      return '';
    }

    // Inject user inputs into the prompt template.
    let finalPrompt = templateString(promptConfig.systemPrompt, inputs);

    // Append environment context (CWD and folder structure).
    const dirContext = await getDirectoryContextString(this.runtimeContext);
    finalPrompt += `\n\n# Environment Context\n${dirContext}`;

    // Append completion criteria to guide the model's output.
    if (outputConfig?.completion_criteria) {
      finalPrompt += '\n\nEnsure you complete the following:\n';
      for (const criteria of outputConfig.completion_criteria) {
        finalPrompt += `- ${criteria}\n`;
      }
    }

    // Append standard rules for non-interactive execution.
    finalPrompt += `
Important Rules:
* You are running in a non-interactive mode. You CANNOT ask the user for input or clarification.
* Work systematically using available tools to complete your task.
* Always use absolute paths for file operations. Construct them using the provided "Environment Context".
* When you have completed your analysis and are ready to produce the final answer, stop calling tools.`;

    return finalPrompt;
  }

  /** Builds the final message for the extraction phase. */
  private buildExtractionMessage(): string {
    const { outputConfig } = this.definition;

    if (outputConfig?.description) {
      let message = `Based on your work so far, provide: ${outputConfig.description}`;

      if (outputConfig.completion_criteria?.length) {
        message += `\n\nBe sure you have addressed:\n`;
        for (const criteria of outputConfig.completion_criteria) {
          message += `- ${criteria}\n`;
        }
      }
      return message;
    }

    // Fallback to a generic extraction message if no description is provided.
    return 'Based on your work so far, provide a comprehensive summary of your analysis and findings. Do not perform any more function calls.';
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
