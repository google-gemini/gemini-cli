/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { reportError } from '../utils/errorReporting.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';
import { ToolCallRequestInfo } from './turn.js';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import { createContentGenerator } from './contentGenerator.js';
import { getEnvironmentContext } from '../utils/environmentContext.js';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentConfig,
  FunctionDeclaration,
  Type,
} from '@google/genai';
import { GeminiChat } from './geminiChat.js';

/**
 * @fileoverview Defines the configuration interfaces for a subagent.
 *
 * These interfaces specify the structure for defining the subagent's prompt,
 * the model parameters, and the execution settings.
 */

/**
 * Describes the possible termination modes for a subagent.
 * This enum provides a clear indication of why a subagent's execution might have ended.
 */
export enum SubagentTerminateMode {
  /**
   * Indicates that the subagent's execution terminated due to an unrecoverable error.
   */
  ERROR = 'ERROR',
  /**
   * Indicates that the subagent's execution terminated because it exceeded the maximum allowed working time.
   */
  TIMEOUT = 'TIMEOUT',
  /**
   * Indicates that the subagent's execution successfully completed all its defined goals.
   */
  GOAL = 'GOAL',
  /**
   * Indicates that the subagent's execution terminated because it exceeded the maximum number of turns.
   */
  MAX_TURNS = 'MAX_TURNS',
}

/**
 * Represents the output structure of a subagent's execution.
 * This interface defines the data that a subagent will return upon completion,
 * including any emitted variables and the reason for its termination.
 */
export interface OutputObject {
  /**
   * A record of key-value pairs representing variables emitted by the subagent
   * during its execution. These variables can be used by the calling agent.
   */
  emitted_vars: Record<string, string>;
  /**
   * The reason for the subagent's termination, indicating whether it completed
   * successfully, timed out, or encountered an error.
   */
  terminate_reason: SubagentTerminateMode;
}

/**
 * Configures the initial prompt for the subagent.
 */
export interface PromptConfig {
  /**
   * A single system prompt string that defines the subagent's persona and instructions.
   * Note: You should use either `systemPrompt` or `initialMessages`, but not both.
   */
  systemPrompt?: string;

  /**
   * An array of user/model content pairs to seed the chat history for few-shot prompting.
   * Note: You should use either `systemPrompt` or `initialMessages`, but not both.
   */
  initialMessages?: Content[];
}

/**
 * Configures the tools available to the subagent during its execution.
 */
export interface ToolConfig {
  /**
   * A list of tool names (from the tool registry) or full function declarations
   * that the subagent is permitted to use.
   */
  tools: Array<string | FunctionDeclaration>;
}

/**
 * Configures the expected outputs for the subagent.
 */
export interface OutputConfig {
  /**
   * A record describing the variables the subagent is expected to emit.
   * The subagent will be prompted to generate these values before terminating.
   */
  outputs: Record<string, string>;
}

/**
 * Configures the generative model parameters for the subagent.
 * This interface specifies the model to be used and its associated generation settings,
 * such as temperature and top-p values, which influence the creativity and diversity of the model's output.
 */
export interface ModelConfig {
  /**
   * The name or identifier of the model to be used (e.g., 'gemini-2.5-pro').
   *
   * TODO: In the future, this needs to support 'auto' or some other string to support routing use cases.
   */
  model: string;
  /**
   * The temperature for the model's sampling process.
   */
  temp: number;
  /**
   * The top-p value for nucleus sampling.
   */
  top_p: number;
}

/**
 * Configures the execution environment and constraints for the subagent.
 * This interface defines parameters that control the subagent's runtime behavior,
 * such as maximum execution time, to prevent infinite loops or excessive resource consumption.
 *
 * TODO: Consider adding max_tokens as a form of budgeting.
 */
export interface RunConfig {
  /** The maximum execution time for the subagent in minutes. */
  max_time_minutes: number;
  /**
   * The maximum number of conversational turns (a user message + model response)
   * before the execution is terminated. Helps prevent infinite loops.
   */
  max_turns?: number;
}

/**
 * Manages the runtime context state for the subagent.
 * This class provides a mechanism to store and retrieve key-value pairs
 * that represent the dynamic state and variables accessible to the subagent
 * during its execution.
 */
export class ContextState {
  private state: Record<string, unknown> = {};

  /**
   * Retrieves a value from the context state.
   *
   * @param key - The key of the value to retrieve.
   * @returns The value associated with the key, or undefined if the key is not found.
   */
  get(key: string): unknown {
    return this.state[key];
  }

  /**
   * Sets a value in the context state.
   *
   * @param key - The key to set the value under.
   * @param value - The value to set.
   */
  set(key: string, value: unknown): void {
    this.state[key] = value;
  }

  /**
   * Retrieves all keys in the context state.
   *
   * @returns An array of all keys in the context state.
   */
  get_keys(): string[] {
    return Object.keys(this.state);
  }
}

/**
 * Replaces `${...}` placeholders in a template string with values from a context.
 *
 * This function identifies all placeholders in the format `${key}`, validates that
 * each key exists in the provided `ContextState`, and then performs the substitution.
 *
 * @param template The template string containing placeholders.
 * @param context The `ContextState` object providing placeholder values.
 * @returns The populated string with all placeholders replaced.
 * @throws {Error} if any placeholder key is not found in the context.
 */
function templateString(template: string, context: ContextState): string {
  const placeholderRegex = /\$\{(\w+)\}/g;

  // First, find all unique keys required by the template.
  const requiredKeys = new Set(
    Array.from(template.matchAll(placeholderRegex), (match) => match[1]),
  );

  // Check if all required keys exist in the context.
  const contextKeys = new Set(context.get_keys());
  const missingKeys = Array.from(requiredKeys).filter(
    (key) => !contextKeys.has(key),
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing context values for the following keys: ${missingKeys.join(
        ', ',
      )}`,
    );
  }

  // Perform the replacement using a replacer function.
  return template.replace(placeholderRegex, (_match, key) =>
    String(context.get(key)),
  );
}

/**
 * Represents the scope and execution environment for a subagent.
 * This class orchestrates the subagent's lifecycle, managing its chat interactions,
 * runtime context, and the collection of its outputs.
 */
export class SubAgentScope {
  output: OutputObject = {
    terminate_reason: SubagentTerminateMode.ERROR,
    emitted_vars: {},
  };
  private readonly subagentId: string;

  /**
   * Constructs a new SubAgentScope instance.
   * @param name - The name for the subagent, used for logging and identification.
   * @param runtimeContext - The shared runtime configuration and services.
   * @param promptConfig - Configuration for the subagent's prompt and behavior.
   * @param modelConfig - Configuration for the generative model parameters.
   * @param runConfig - Configuration for the subagent's execution environment.
   * @param toolConfig - Optional configuration for tools available to the subagent.
   * @param outputConfig - Optional configuration for the subagent's expected outputs.
   */
  private constructor(
    readonly name: string,
    readonly runtimeContext: Config,
    private readonly promptConfig: PromptConfig,
    private readonly modelConfig: ModelConfig,
    private readonly runConfig: RunConfig,
    private readonly toolConfig?: ToolConfig,
    private readonly outputConfig?: OutputConfig,
  ) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    this.subagentId = `${this.name}-${randomPart}`;
  }

  /**
   * Creates and validates a new SubAgentScope instance.
   * This factory method ensures that all tools provided in the prompt configuration
   * are valid for non-interactive use before creating the subagent instance.
   * @param {string} name - The name of the subagent.
   * @param {Config} runtimeContext - The shared runtime configuration and services.
   * @param {PromptConfig} promptConfig - Configuration for the subagent's prompt and behavior.
   * @param {ModelConfig} modelConfig - Configuration for the generative model parameters.
   * @param {RunConfig} runConfig - Configuration for the subagent's execution environment.
   * @param {ToolConfig} [toolConfig] - Optional configuration for tools.
   * @param {OutputConfig} [outputConfig] - Optional configuration for expected outputs.
   * @returns {Promise<SubAgentScope>} A promise that resolves to a valid SubAgentScope instance.
   * @throws {Error} If any tool requires user confirmation.
   */
  static async create(
    name: string,
    runtimeContext: Config,
    promptConfig: PromptConfig,
    modelConfig: ModelConfig,
    runConfig: RunConfig,
    toolConfig?: ToolConfig,
    outputConfig?: OutputConfig,
  ): Promise<SubAgentScope> {
    if (toolConfig) {
      const toolRegistry: ToolRegistry = await runtimeContext.getToolRegistry();
      const toolsToLoad: string[] = [];
      for (const tool of toolConfig.tools) {
        if (typeof tool === 'string') {
          toolsToLoad.push(tool);
        }
      }

      for (const toolName of toolsToLoad) {
        const tool = toolRegistry.getTool(toolName);
        if (tool) {
          const requiredParams = tool.schema.parameters?.required ?? [];
          if (requiredParams.length > 0) {
            // This check is imperfect. A tool might require parameters but still
            // be interactive (e.g., `delete_file(path)`). However, we cannot
            // build a generic invocation without knowing what dummy parameters
            // to provide. Crashing here because `build({})` fails is worse
            // than allowing a potential hang later if an interactive tool is
            // used. This is a best-effort check.
            console.warn(
              `Cannot check tool "${toolName}" for interactivity because it requires parameters. Assuming it is safe for non-interactive use.`,
            );
            continue;
          }

          const invocation = tool.build({});
          const confirmationDetails = await invocation.shouldConfirmExecute(
            new AbortController().signal,
          );
          if (confirmationDetails) {
            throw new Error(
              `Tool "${toolName}" requires user confirmation and cannot be used in a non-interactive subagent.`,
            );
          }
        }
      }
    }

    return new SubAgentScope(
      name,
      runtimeContext,
      promptConfig,
      modelConfig,
      runConfig,
      toolConfig,
      outputConfig,
    );
  }

  /**
   * Runs the subagent in a non-interactive mode.
   * This method orchestrates the subagent's execution loop, including prompt templating,
   * tool execution, and termination conditions.
   * @param {ContextState} context - The current context state containing variables for prompt templating.
   * @returns {Promise<void>} A promise that resolves when the subagent has completed its execution.
   */
  async runNonInteractive(context: ContextState): Promise<void> {
    const chat = await this.createChatObject(context);

    if (!chat) {
      this.output.terminate_reason = SubagentTerminateMode.ERROR;
      return;
    }

    const abortController = new AbortController();
    const toolRegistry: ToolRegistry =
      await this.runtimeContext.getToolRegistry();

    // Prepare the list of tools available to the subagent.
    const toolsList: FunctionDeclaration[] = [];
    if (this.toolConfig) {
      const toolsToLoad: string[] = [];
      for (const tool of this.toolConfig.tools) {
        if (typeof tool === 'string') {
          toolsToLoad.push(tool);
        } else {
          toolsList.push(tool);
        }
      }
      toolsList.push(
        ...toolRegistry.getFunctionDeclarationsFiltered(toolsToLoad),
      );
    }
    // Add local scope functions if outputs are expected.
    if (this.outputConfig && this.outputConfig.outputs) {
      toolsList.push(...this.getScopeLocalFuncDefs());
    }

    let currentMessages: Content[] = [
      { role: 'user', parts: [{ text: 'Get Started!' }] },
    ];

    const startTime = Date.now();
    let turnCounter = 0;
    try {
      while (true) {
        // Check termination conditions.
        if (
          this.runConfig.max_turns &&
          turnCounter >= this.runConfig.max_turns
        ) {
          this.output.terminate_reason = SubagentTerminateMode.MAX_TURNS;
          break;
        }
        let durationMin = (Date.now() - startTime) / (1000 * 60);
        if (durationMin >= this.runConfig.max_time_minutes) {
          this.output.terminate_reason = SubagentTerminateMode.TIMEOUT;
          break;
        }

        const promptId = `${this.runtimeContext.getSessionId()}#${this.subagentId}#${turnCounter++}`;
        const messageParams = {
          message: currentMessages[0]?.parts || [],
          config: {
            abortSignal: abortController.signal,
            tools: [{ functionDeclarations: toolsList }],
          },
        };

        const responseStream = await chat.sendMessageStream(
          messageParams,
          promptId,
        );

        const functionCalls: FunctionCall[] = [];
        for await (const resp of responseStream) {
          if (abortController.signal.aborted) return;
          if (resp.functionCalls) functionCalls.push(...resp.functionCalls);
        }

        durationMin = (Date.now() - startTime) / (1000 * 60);
        if (durationMin >= this.runConfig.max_time_minutes) {
          this.output.terminate_reason = SubagentTerminateMode.TIMEOUT;
          break;
        }

        if (functionCalls.length > 0) {
          currentMessages = await this.processFunctionCalls(
            functionCalls,
            toolRegistry,
            abortController,
            promptId,
          );
        } else {
          // Model stopped calling tools. Check if goal is met.
          if (
            !this.outputConfig ||
            Object.keys(this.outputConfig.outputs).length === 0
          ) {
            this.output.terminate_reason = SubagentTerminateMode.GOAL;
            break;
          }

          const remainingVars = Object.keys(this.outputConfig.outputs).filter(
            (key) => !(key in this.output.emitted_vars),
          );

          if (remainingVars.length === 0) {
            this.output.terminate_reason = SubagentTerminateMode.GOAL;
            break;
          }

          const nudgeMessage = `You have stopped calling tools but have not emitted the following required variables: ${remainingVars.join(
            ', ',
          )}. Please use the 'self.emitvalue' tool to emit them now, or continue working if necessary.`;

          console.debug(nudgeMessage);

          currentMessages = [
            {
              role: 'user',
              parts: [{ text: nudgeMessage }],
            },
          ];
        }
      }
    } catch (error) {
      console.error('Error during subagent execution:', error);
      this.output.terminate_reason = SubagentTerminateMode.ERROR;
      throw error;
    }
  }

  /**
   * Processes a list of function calls, executing each one and collecting their responses.
   * This method iterates through the provided function calls, executes them using the
   * `executeToolCall` function (or handles `self.emitvalue` internally), and aggregates
   * their results. It also manages error reporting for failed tool executions.
   * @param {FunctionCall[]} functionCalls - An array of `FunctionCall` objects to process.
   * @param {ToolRegistry} toolRegistry - The tool registry to look up and execute tools.
   * @param {AbortController} abortController - An `AbortController` to signal cancellation of tool executions.
   * @returns {Promise<Content[]>} A promise that resolves to an array of `Content` parts representing the tool responses,
   *          which are then used to update the chat history.
   */
  private async processFunctionCalls(
    functionCalls: FunctionCall[],
    toolRegistry: ToolRegistry,
    abortController: AbortController,
    promptId: string,
  ): Promise<Content[]> {
    const toolResponseParts: Part[] = [];

    for (const functionCall of functionCalls) {
      const callId = functionCall.id ?? `${functionCall.name}-${Date.now()}`;
      const requestInfo: ToolCallRequestInfo = {
        callId,
        name: functionCall.name as string,
        args: (functionCall.args ?? {}) as Record<string, unknown>,
        isClientInitiated: true,
        prompt_id: promptId,
      };

      let toolResponse;

      // Handle scope-local tools first.
      if (functionCall.name === 'self.emitvalue') {
        const valName = String(requestInfo.args['emit_variable_name']);
        const valVal = String(requestInfo.args['emit_variable_value']);
        this.output.emitted_vars[valName] = valVal;

        toolResponse = {
          callId,
          responseParts: `Emitted variable ${valName} successfully`,
          resultDisplay: `Emitted variable ${valName} successfully`,
          error: undefined,
        };
      } else {
        toolResponse = await executeToolCall(
          this.runtimeContext,
          requestInfo,
          toolRegistry,
          abortController.signal,
        );
      }

      if (toolResponse.error) {
        console.error(
          `Error executing tool ${functionCall.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
        );
      }

      if (toolResponse.responseParts) {
        const parts = Array.isArray(toolResponse.responseParts)
          ? toolResponse.responseParts
          : [toolResponse.responseParts];
        for (const part of parts) {
          if (typeof part === 'string') {
            toolResponseParts.push({ text: part });
          } else if (part) {
            toolResponseParts.push(part);
          }
        }
      }
    }
    // If all tool calls failed, inform the model so it can re-evaluate.
    if (functionCalls.length > 0 && toolResponseParts.length === 0) {
      toolResponseParts.push({
        text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
      });
    }

    return [{ role: 'user', parts: toolResponseParts }];
  }

  private async createChatObject(context: ContextState) {
    if (!this.promptConfig.systemPrompt && !this.promptConfig.initialMessages) {
      throw new Error(
        'PromptConfig must have either `systemPrompt` or `initialMessages` defined.',
      );
    }
    if (this.promptConfig.systemPrompt && this.promptConfig.initialMessages) {
      throw new Error(
        'PromptConfig cannot have both `systemPrompt` and `initialMessages` defined.',
      );
    }

    const envParts = await getEnvironmentContext(this.runtimeContext);
    const envHistory: Content[] = [
      { role: 'user', parts: envParts },
      { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
    ];

    const start_history = [
      ...envHistory,
      ...(this.promptConfig.initialMessages ?? []),
    ];

    const systemInstruction = this.promptConfig.systemPrompt
      ? this.buildChatSystemPrompt(context)
      : undefined;

    try {
      const generationConfig: GenerateContentConfig & {
        systemInstruction?: string | Content;
      } = {
        temperature: this.modelConfig.temp,
        topP: this.modelConfig.top_p,
      };

      if (systemInstruction) {
        generationConfig.systemInstruction = systemInstruction;
      }

      const contentGenerator = await createContentGenerator(
        this.runtimeContext.getContentGeneratorConfig(),
        this.runtimeContext,
        this.runtimeContext.getSessionId(),
      );

      this.runtimeContext.setModel(this.modelConfig.model);

      return new GeminiChat(
        this.runtimeContext,
        contentGenerator,
        generationConfig,
        start_history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        start_history,
        'startChat',
      );
      // The calling function will handle the undefined return.
      return undefined;
    }
  }

  /**
   * Returns an array of FunctionDeclaration objects for tools that are local to the subagent's scope.
   * Currently, this includes the `self.emitvalue` tool for emitting variables.
   * @returns An array of `FunctionDeclaration` objects.
   */
  private getScopeLocalFuncDefs() {
    const emitValueTool: FunctionDeclaration = {
      name: 'self.emitvalue',
      description: `* This tool emits A SINGLE return value from this execution, such that it can be collected and presented to the calling function.
        * You can only emit ONE VALUE each time you call this tool. You are expected to call this tool MULTIPLE TIMES if you have MULTIPLE OUTPUTS.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          emit_variable_name: {
            description: 'This is the name of the variable to be returned.',
            type: Type.STRING,
          },
          emit_variable_value: {
            description:
              'This is the _value_ to be returned for this variable.',
            type: Type.STRING,
          },
        },
        required: ['emit_variable_name', 'emit_variable_value'],
      },
    };

    return [emitValueTool];
  }

  /**
   * Builds the system prompt for the chat based on the provided configurations.
   * It templates the base system prompt and appends instructions for emitting
   * variables if an `OutputConfig` is provided.
   * @param {ContextState} context - The context for templating.
   * @returns {string} The complete system prompt.
   */
  private buildChatSystemPrompt(context: ContextState): string {
    if (!this.promptConfig.systemPrompt) {
      // This should ideally be caught in createChatObject, but serves as a safeguard.
      return '';
    }

    let finalPrompt = templateString(this.promptConfig.systemPrompt, context);

    // Add instructions for emitting variables if needed.
    if (this.outputConfig && this.outputConfig.outputs) {
      let outputInstructions =
        '\n\nAfter you have achieved all other goals, you MUST emit the required output variables. For each expected output, make one final call to the `self.emitvalue` tool.';

      for (const [key, value] of Object.entries(this.outputConfig.outputs)) {
        outputInstructions += `\n* Use 'self.emitvalue' to emit the '${key}' key, with a value described as: '${value}'`;
      }
      finalPrompt += outputInstructions;
    }

    // Add general non-interactive instructions.
    finalPrompt += `

Important Rules:
 * You are running in a non-interactive mode. You CANNOT ask the user for input or clarification. You must proceed with the information you have.
 * Once you believe all goals have been met and all required outputs have been emitted, stop calling tools.`;

    return finalPrompt;
  }
}
