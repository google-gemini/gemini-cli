/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { getErrorMessage } from '../utils/errors.js';
import { reportError } from '../utils/errorReporting.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config, ConfigParameters } from '../config/config.js';
import { ToolCallRequestInfo } from './turn.js';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import { createContentGenerator } from './contentGenerator.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
  GenerateContentConfig,
  FunctionDeclaration,
  Type,
} from '@google/genai';
import { GeminiChat } from './geminiChat.js';
//import { GeminiClient } from '../core/client.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';

/**
 * Extracts the text content from a GenerateContentResponse object.
 *
 * @param response - The GenerateContentResponse object to extract text from.
 * @returns The extracted text content, or null if no text is found.
 */
function getResponseText(response: GenerateContentResponse): string | null {

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

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
  /** A list of tool names (in the tool registry) that the subagent is permitted to use. */
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
 * This is a helper function which manually replaces `${..}` placeholders with values from a dictionary.
 *
 * This function iterates through a template string, identifies placeholders in the format `${key}`,
 * and replaces them with their corresponding values retrieved from the provided `ContextState` object.
 * It ensures that all referenced keys exist in the context before performing replacements.
 *
 * @param {string} template - The template string containing placeholders like `${key}`.
 * @param {ContextState} context - The `ContextState` object from which to retrieve values for the placeholders.
 * @returns {string} The templated string with placeholders replaced by their corresponding values from the context.
 * @throws {Error} if any placeholder key is not found in the context.
 */
function templateString(template: string, context: ContextState) {
  // Regular expression to find placeholders like ${key}
  const placeholderRegex = /\$\{(\w+)\}/g;
  let match;
  const missingKeys = new Set<string>();
  const foundKeys = new Set<string>();
  let templatedString = template;

  const contextKeys = context.get_keys();

  // First pass: Identify all referenced keys and check for missing ones
  while ((match = placeholderRegex.exec(template)) !== null) {
    const key = match[1]; // The captured group is the key name

    if (!contextKeys.includes(key)) {
      missingKeys.add(key);
    } else {
      foundKeys.add(key);
    }
  }

  // If there are any missing keys, throw an error
  if (missingKeys.size > 0) {
    const missingKeysArray = Array.from(missingKeys);
    throw new Error(
      `Missing values for the following keys: ${missingKeysArray.join(', ')}`,
    );
  }

  for (const key of foundKeys) {
    const toReplace = '${' + key + '}';
    const replValue = String(context.get(key));
    while (true) {
      templatedString = templatedString.replace(toReplace, replValue);
      if (!templatedString.includes(toReplace)) break;
    }
  }

  return templatedString;
}

/**
 * Represents the scope and execution environment for a subagent.
 * This class orchestrates the subagent's lifecycle, managing its chat interactions,
 * runtime context, and the collection of its outputs.
 */
export class SubAgentScope {
  runtimeContext: Config;
  output: OutputObject = {
    terminate_reason: SubagentTerminateMode.ERROR,
    emitted_vars: {},
  };

  /**
   * Constructs a new SubAgentScope instance.
   * @param configParams - Parameters for the overall configuration.
   * @param promptConfig - Configuration for the subagent's prompt and behavior.
   * @param modelConfig - Configuration for the generative model parameters.
   * @param runConfig - Configuration for the subagent's execution environment and constraints.
   */
  constructor(
    private readonly configParams: ConfigParameters,
    private readonly promptConfig: PromptConfig,
    private readonly modelConfig: ModelConfig,
    private readonly runConfig: RunConfig,
  ) {
    this.runtimeContext = new Config(this.configParams);
  }

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
      console.error('Chat object creation failure');
      return;
    }

    const abortController = new AbortController();

    // Tools
    const toolRegistry: ToolRegistry =
      await this.runtimeContext.getToolRegistry();
    const tools_to_load: string[] = [];
    const toolsList: FunctionDeclaration[] = [];
    for (const t of this.promptConfig.tools) {
      if (typeof t === 'string') {
        tools_to_load.push(t);
      } else {
        //if (typeof t) {
        toolsList.push(t);
      }
    }

    toolsList.push(
      ...toolRegistry.getFunctionDeclarationsFiltered(tools_to_load),
    );
    toolsList.push(...this.getScopeLocalFuncDefs());

    // Prompt!
    chat.setSystemInstruction(this.buildChatSystemPrompt(
      context,
      toolsList,
    ));

    let currentMessages: Content[] = [
      { role: 'user', parts: [{ text: 'Get Started!' }] },
    ];

    const startTime = Date.now();
    try {
      while (true) {
        // If we've eclipsed our timeout window, termiante.
        const duration = Date.now() - startTime;
        const durationMin = duration / (1000 * 60);
        if (durationMin >= this.runConfig.max_time_minutes) {
          this.output.terminate_reason = SubagentTerminateMode.TIMEOUT;
          break;
        }

        const messageParams = {
          message: currentMessages[0]?.parts || [], // Ensure parts are always provided
          config: {
            abortSignal: abortController.signal,
            tools: [{ functionDeclarations: toolsList }],
          },
        };

        // Send the message to the chat object, which will manage its' own history
        const responseStream = await chat.sendMessageStream(messageParams);

        // Given that we've called streaming, let's combine all the parts of the response
        // so we can process them, properly
        const functionCalls: FunctionCall[] = [];
        let thinkingMessage = '';
        for await (const resp of responseStream) {
          if (abortController.signal.aborted) {
            console.error('Operation cancelled.');
            return;
          }
          const textPart = getResponseText(resp);
          if (textPart) {
            //process.stdout.write(textPart);
            thinkingMessage += textPart;
          }
          if (resp.functionCalls) {
            functionCalls.push(...resp.functionCalls);
          }
        }

        // If a thinking message was provided, let's add it to the history?
        if (thinkingMessage.length) {
          console.log('💭:', thinkingMessage);
          // I think chat already keeps this data in the history object, right? so we don't need to do anything?
        }

        // for any function calls given, let's linearly execute them.
        // WARNING - sometimes the model gets confused, and if ToolA provides input to ToolB
        // instead of providing that Proper input, it defaults to the wrong values!!!!
        // We might need to truncate this to 1 call per loop!!
        if (functionCalls.length > 0) {
          currentMessages = await this.processFunctionCalls(
            functionCalls,
            toolRegistry,
            abortController,
            currentMessages,
          );
        } else {
          //console.log("trying to exit..")

          // If we get here, the model has suggested there's no more tools to call.
          // This is a signal that we're done processing and can exit.
          const remainingVars = [];
          // before that happens, let's check if we emitted the needed variables
          for (const key of Object.keys(this.promptConfig.outputs)) {
            if (!(key in this.output.emitted_vars)) {
              remainingVars.push(key);
            }
          }

          if (remainingVars.length) {
            // TODO:
            // if it's found that there's variables waiting to be emitted, we should add a message to the history, which
            // directs the model to emit those variables before it is allowed to exit.
            // Below is an attempt at this process, but it is causing an error, since we're adding the part, when a function wasn't asked for
            // and the Gemini API is barfing... so let's disable it for now, and just hope the LLM figures out they need to call EmitValue?
            // we have variables that need to be emitted, let's tell the history
            //let txtMsg =
            //  'Before you can exit your work, you need to call the self.emitvalue tool for the following values:\n';
            //for (const k of remainingVars) {
            //  txtMsg += `* ${k} : ${this.promptConfig.outputs[k]}\n`;
            //}
            //if(currentMessages.length && currentMessages[0].parts)
            //  currentMessages[0]?.parts?.push({text:txtMsg})
            //chat.addHistory({ role: 'user', parts: [{text:txtMsg}] });
          } else {
            // process.stdout.write('\n'); // Ensure a final newline
            this.output.terminate_reason = SubagentTerminateMode.GOAL;
            break;
          }
        }
      }
    } catch (_error) {
      console.error('Error processing input:', _error);
      process.exit(1);
    } finally {
      //
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

    for (const fc of functionCalls) {
      const callId = fc.id ?? `${fc.name}-${Date.now()}`;
      const requestInfo: ToolCallRequestInfo = {
        callId,
        name: fc.name as string,
        args: (fc.args ?? {}) as Record<string, unknown>,
        isClientInitiated:true
      };

      let toolResponse = null;

      console.log('🔨:', callId);

      // Let's check for our scope local tools, first
      if (callId.startsWith('self.emitvalue')) {
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
          `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
        );
        continue; // process.exit(1);
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
    //HISTORY - do we inherit, or stat fresh?

    // sets up the start of the chat with env variables to work with
    // this might be too dependent on the main agent to be useful
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

    // TODO : we shoudl pin the inital history so it doesn't get 
    // culled via the compression system!  
    const start_history = [...initialHistory, ...(extraHistory ?? [])];

    // TOOLS - let's filter based on input config
    // Don't define tools during the create phase, only do it when we send the message.

    // PROMPT -
    // We intentinoally don't use a system prompt here, and instead
    // allow it to be created during the first part of the runtime loop
    // which allows it to have formatting variables based upon the context state
    // If we want some custom AgentScope system prompting, we can add this back in.
    //const systemInstruction = getCoreSystemPrompt(this.runtimeContext.getUserMemory());
    const systemInstruction = ''; 

    try {
      // Create a copy of the content generator
      const targetContentConfig: GenerateContentConfig = {
        temperature: this.modelConfig.temp,
        topP: this.modelConfig.top_p,
      };

      const contentGenConfigInst = {
        systemInstruction,
        ...targetContentConfig,
        //tools, // don't pass in tools here, they are ignored later.
      };

      console.log("GOT HERE 3")
      //const constGenerator = await geminiClient.contentGenerator;
      const contentGenerator = await createContentGenerator(
        this.runtimeContext.getContentGeneratorConfig(),
      );
      console.log("GOT HERE 4")

      // Create the geminiChat item, with these configurations.
      const gcInst = await new GeminiChat(
        this.runtimeContext,
        contentGenerator,
        this.modelConfig.model,
        contentGenConfigInst,
        start_history,
      );

      

      return gcInst;
    } catch (error) {
      
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        start_history,
        'startChat'
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
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
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
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
    const yieldResultFcn: FunctionDeclaration = {
      name: 'self.emitvalue',
      description: `* This tool emits A SINGLE return value from this execution, such that it can be collected and presented to the calling function.
* You can only emit ONE VALUE each time you call this tool. You are expected to call this tool MULTIPLE TIMES if you have MULTIPLE OUTPUTS.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          emit_variable_name: {
            description: 'This is the name of the variable to be returned..',
            type: Type.STRING,
          },
          emit_variable_value: {
            description:
              'This is the _value_ to be returned for this variable.',
            type: Type.STRING,
          },
        },
      },
    };

    return [yieldResultFcn];
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
  ) {
    // templatize any values that may have been prompted from global state
    const templated_plan = templateString(this.promptConfig.plan, context);
    let templated_goals = templateString(this.promptConfig.goals, context);

    // Add variable emission goals..
    for (const [key, value] of Object.entries(this.promptConfig.outputs)) {
      templated_goals += `\n* Use the 'self.emitvalue' tool to emit the '${key}' key, with a value described as '${value}'`;
    }

    // For some reason, when using the existing geminiChat system, it doesn't really understand the tools it has access to..
    // I would assume that the genAI.GenerateContent api would take care of that, but it seems not? So I include the tools in this prompt.
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
 * You are in charge of determininig if your goals are complete or not. If you think they are done, then be done, and don't call any more tools.
 `;

    return input;
  }
}
