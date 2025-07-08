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
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentConfig,
  FunctionDeclaration,
  Type,
} from '@google/genai';
import { GeminiChat } from './geminiChat.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';

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
 * Configures the prompt and expected behavior of the subagent.
 * This interface defines the essential parameters that guide the subagent's
 * interaction and task execution, including its plan, goals, and available tools.
 */
export interface PromptConfig {
  /** A high-level plan or strategy for the subagent to follow. */
  plan: string;
  /** The specific goals the subagent is expected to achieve. */
  goals: string;
  /** A list of expected output objects and the variables they should emit. */
  outputs: Record<string, string>;
  /** A list of tool names (in the tool registry) or full function declarations that the subagent is permitted to use. */
  tools: Array<string | FunctionDeclaration>;
}

/**
 * Configures the generative model parameters for the subagent.
 * This interface specifies the model to be used and its associated generation settings,
 * such as temperature and top-p values, which influence the creativity and diversity of the model's output.
 */
export interface ModelConfig {
  /** The name or identifier of the model to be used. */
  model: string;
  /** The temperature for the model's sampling process. */
  temp: number;
  /** The top-p value for nucleus sampling. */
  top_p: number;
}

/**
 * Configures the execution environment and constraints for the subagent.
 * This interface defines parameters that control the subagent's runtime behavior,
 * such as maximum execution time, to prevent infinite loops or excessive resource consumption.
 */
export interface RunConfig {
  /** The maximum execution time for the subagent in minutes. */
  max_time_minutes: number;
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

  /**
   * Constructs a new SubAgentScope instance.
   * @param runtimeContext - The shared runtime configuration and services.
   * @param promptConfig - Configuration for the subagent's prompt and behavior.
   * @param modelConfig - Configuration for the generative model parameters.
   * @param runConfig - Configuration for the subagent's execution environment and constraints.
   */
  constructor(
    readonly runtimeContext: Config,
    private readonly promptConfig: PromptConfig,
    private readonly modelConfig: ModelConfig,
    private readonly runConfig: RunConfig,
  ) {}

  /**
   * Runs the subagent in a non-interactive mode.
   * This method orchestrates the subagent's execution loop, including prompt templating,
   * tool execution, and termination conditions. It manages the chat history, handles
   * tool calls, and determines when the subagent's goals are met or if a timeout occurs.
   * @param {ContextState} context - The current context state containing variables for prompt templating.
   * @returns {Promise<void>} A promise that resolves when the subagent has completed its execution.
   */
  async runNonInteractive(context: ContextState): Promise<void> {
    const chat = await this.createChatObject();

    if (!chat) {
      this.output.terminate_reason = SubagentTerminateMode.ERROR;
      return;
    }

    const abortController = new AbortController();
    const toolRegistry: ToolRegistry =
      await this.runtimeContext.getToolRegistry();

    // Prepare the list of tools available to the subagent.
    const toolsToLoad: string[] = [];
    const toolsList: FunctionDeclaration[] = [];
    for (const toolName of this.promptConfig.tools) {
      if (typeof toolName === 'string') {
        toolsToLoad.push(toolName);
      } else {
        toolsList.push(toolName);
      }
    }

    toolsList.push(
      ...toolRegistry.getFunctionDeclarationsFiltered(toolsToLoad),
    );
    toolsList.push(...this.getScopeLocalFuncDefs());

    chat.setSystemInstruction(this.buildChatSystemPrompt(context, toolsList));

    let currentMessages: Content[] = [
      { role: 'user', parts: [{ text: 'Get Started!' }] },
    ];

    const startTime = Date.now();
    try {
      while (true) {
        // Check for timeout.
        const duration = Date.now() - startTime;
        const durationMin = duration / (1000 * 60);
        if (durationMin >= this.runConfig.max_time_minutes) {
          this.output.terminate_reason = SubagentTerminateMode.TIMEOUT;
          break;
        }

        const messageParams = {
          message: currentMessages[0]?.parts || [],
          config: {
            abortSignal: abortController.signal,
            tools: [{ functionDeclarations: toolsList }],
          },
        };

        // Send the message to the GeminiChat object, which will manage its own history
        const responseStream = await chat.sendMessageStream(messageParams);

        // Combine all chunks in stream for proper processing.
        const functionCalls: FunctionCall[] = [];
        for await (const resp of responseStream) {
          if (abortController.signal.aborted) {
            console.error('Operation cancelled.');
            return;
          }

          const calls = resp.functionCalls;
          if (calls) {
            functionCalls.push(...calls);
          }
        }

        if (functionCalls.length > 0) {
          currentMessages = await this.processFunctionCalls(
            functionCalls,
            toolRegistry,
            abortController,
            currentMessages,
          );
        } else {
          // The model has stopped calling tools, which signals completion.
          // Verify that all expected output variables have been emitted.
          const remainingVars = Object.keys(this.promptConfig.outputs).filter(
            (key) => !(key in this.output.emitted_vars),
          );

          if (remainingVars.length === 0) {
            this.output.terminate_reason = SubagentTerminateMode.GOAL;
            break;
          }

          // If variables are missing, the loop continues, relying on the
          // system prompt to guide the model to call self.emitvalue.
          console.debug(
            'Variables appear to be missing. Relying on model to call EmitValue.',
          );
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
   * @param {Content[]} currentMessages - The current list of messages in the chat history, which will be updated with tool responses.
   * @returns {Promise<Content[]>} A promise that resolves to an array of `Content` parts representing the tool responses,
   *          which are then used to update the chat history.
   */
  private async processFunctionCalls(
    functionCalls: FunctionCall[],
    toolRegistry: ToolRegistry,
    abortController: AbortController,
    currentMessages: Content[],
  ) {
    const toolResponseParts: Part[] = [];

    for (const functionCall of functionCalls) {
      const callId = functionCall.id ?? `${functionCall.name}-${Date.now()}`;
      const requestInfo: ToolCallRequestInfo = {
        callId,
        name: functionCall.name as string,
        args: (functionCall.args ?? {}) as Record<string, unknown>,
        isClientInitiated: true,
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
        // Continue to the next tool call instead of halting execution.
        continue;
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
        text: 'All tool calls failed. Please analyze the errors, review the plan, and try an alternative approach.',
      });
    }
    currentMessages = [{ role: 'user', parts: toolResponseParts }];
    return currentMessages;
  }

  /**
   * Creates an instance of `GeminiChat` unique for the subagent's purposes.
   * It initializes the chat with environment variables and configures the content generator.
   * @param {Content[]} [extraHistory] - Optional additional chat history to include.
   * @returns {Promise<GeminiChat | undefined>} A promise that resolves to a `GeminiChat` instance, or undefined if creation fails.
   */
  private async createChatObject(extraHistory?: Content[]) {
    const envParts = await this.getEnvironment();
    const initialHistory: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
    ];

    const start_history = [...initialHistory, ...(extraHistory ?? [])];

    // The system instruction is set dynamically within the run loop to allow
    // for context-based templating.
    const systemInstruction = '';

    try {
      const targetContentConfig: GenerateContentConfig = {
        temperature: this.modelConfig.temp,
        topP: this.modelConfig.top_p,
      };

      const generationConfig = {
        systemInstruction,
        ...targetContentConfig,
      };

      const contentGenerator = await createContentGenerator(
        this.runtimeContext.getContentGeneratorConfig(),
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
   * Retrieves environment-related information to be included in the chat context.
   * This includes the current working directory, date, operating system, and folder structure.
   * Optionally, it can also include the full file context if enabled.
   * @returns A promise that resolves to an array of `Part` objects containing environment information.
   */
  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.runtimeContext.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.runtimeContext.getFileService(),
    });
    const context = `
  Okay, just setting up the context for our chat.
  Today is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.runtimeContext.getToolRegistry();

    // Add full file context if the flag is set
    if (this.runtimeContext.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- Full File Context ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        }
      } catch (error) {
        // This error is logged but doesn't halt the process, as full context is optional.
        console.error('Error reading full file context:', error);
        initialParts.push({
          text: '\n--- Error reading full file context ---',
        });
      }
    }

    return initialParts;
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
   * Builds the system prompt for the chat, incorporating the subagent's plan, goals, and available tools.
   * This prompt is intentionally different from the main agent's prompt to allow for scoped work with specific tools or personas.
   * @param {ContextState} context - The current context state containing variables for prompt templating.
   * @param {FunctionDeclaration[]} toolsList - An array of `FunctionDeclaration` objects representing the tools available to the subagent.
   * @returns {string} The complete system prompt for the chat.
   */
  private buildChatSystemPrompt(
    context: ContextState,
    toolsList: FunctionDeclaration[],
  ): string {
    const templated_plan = templateString(this.promptConfig.plan, context);
    let templated_goals = templateString(this.promptConfig.goals, context);

    // Add variable emission goals..
    for (const [key, value] of Object.entries(this.promptConfig.outputs)) {
      templated_goals += `\n* Use the 'self.emitvalue' tool to emit the '${key}' key, with a value described as '${value}'`;
    }

    const input = `You are an expert AI that takes on all sorts of roles to accomplish tasks for the user. You will continue to iterate, and call tools until the goals are complete. 

Here are the tools you have access to, for this session, to solve the goals:
<TOOLS>
${JSON.stringify(toolsList)}
</TOOLS>
    
Below is your plan or persona for this session:
<THE_PLAN>
${templated_plan}
</THE_PLAN>

 Here are your goals for this session. Use the tools available to attempt to achieve these goals:
 <GOALS>
 ${templated_goals}
 </GOALS>
 
 Important things:
 * You are running in non-interactive mode. You cannot ask the user for input.
 * You must determine if your goals are complete. Once you believe all goals have been met, do not call any more tools.
 `;

    return input;
  }
}
