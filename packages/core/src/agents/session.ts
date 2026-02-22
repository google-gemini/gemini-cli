/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part, Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { type Config } from '../config/config.js';
import { type GeminiClient } from '../core/client.js';
import { type AgentEvent, type AgentConfig } from './types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import {
  ROOT_SCHEDULER_ID,
  type ToolCallRequestInfo,
  type CompletedToolCall,
  CoreToolCallStatus,
} from '../scheduler/types.js';
import { GeminiEventType, CompressionStatus } from '../core/turn.js';
import { recordToolCallInteractions } from '../code_assist/telemetry.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { AgentTerminateMode } from './types.js';
import type { ResumedSessionData } from '../services/chatRecordingService.js';
import { convertSessionToClientHistory } from '../utils/sessionUtils.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';

const TASK_COMPLETE_TOOL_NAME = 'complete_task';

/**
 * AgentSession manages the state of a conversation and orchestrates the agent
 * loop.
 */
export class AgentSession {
  private readonly client: GeminiClient;
  private readonly scheduler: Scheduler;
  private readonly toolRegistry: ToolRegistry;
  private readonly compressionService: ChatCompressionService;
  private totalTurns = 0;
  private hasFailedCompressionAttempt = false;

  constructor(
    private readonly sessionId: string,
    private readonly config: AgentConfig,
    private readonly runtime: Config,
  ) {
    // Initialize a scoped tool registry
    this.toolRegistry = new ToolRegistry(
      this.runtime,
      this.runtime.getMessageBus(),
    );
    this.setupToolRegistry();

    // For now, we reuse the GeminiClient from the global config.
    this.client = this.runtime.getGeminiClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    this.scheduler = new Scheduler({
      config: this.runtime,
      messageBus: this.runtime.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    } as any);
    this.compressionService = new ChatCompressionService();
  }

  private setupToolRegistry(): void {
    const parentRegistry = this.runtime.getToolRegistry();
    if (this.config.toolConfig) {
      for (const toolRef of this.config.toolConfig.tools) {
        if (typeof toolRef === 'string') {
          const tool = parentRegistry.getTool(toolRef);
          if (tool) {
            this.toolRegistry.registerTool(tool);
          }
        } else if (
          typeof toolRef === 'object' &&
          'name' in toolRef &&
          'build' in toolRef
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          this.toolRegistry.registerTool(
            toolRef as unknown as AnyDeclarativeTool,
          );
        }
      }
    } else {
      // If no tools specified, use all active tools from parent
      for (const tool of parentRegistry.getAllTools()) {
        this.toolRegistry.registerTool(tool);
      }
    }
  }

  private getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations = this.toolRegistry.getFunctionDeclarations();

    // Add complete_task tool if outputConfig is provided
    if (this.config.outputConfig) {
      const jsonSchema = zodToJsonSchema(this.config.outputConfig.schema);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
      const { $schema, definitions, ...schema } = jsonSchema as any;

      const completeTool: FunctionDeclaration = {
        name: TASK_COMPLETE_TOOL_NAME,
        description:
          this.config.outputConfig.description ||
          'Call this tool to submit your final answer and complete the task.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            [this.config.outputConfig.outputName]: schema as Schema,
          },
          required: [this.config.outputConfig.outputName],
        },
      };
      declarations.push(completeTool);
    }

    return declarations;
  }

  /**
   * Resumes the agent session from persistent storage data.
   * Hydrates the internal language model client with the previously saved trajectory.
   *
   * @param resumedSessionData The raw payload of a previously saved session.
   */
  async resume(resumedSessionData: ResumedSessionData): Promise<void> {
    const clientHistory = convertSessionToClientHistory(
      resumedSessionData.conversation.messages,
    );
    await this.client.resumeChat(clientHistory, resumedSessionData);
  }

  /**
   * Executes the ReAct loop for a given user input.
   * Returns an AsyncIterable of events occurring during the session.
   */
  async *prompt(
    input: string | Part[],
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    yield {
      type: 'agent_start',
      value: { sessionId: this.sessionId },
    };

    let currentInput = input;
    let isContinuation = false;
    const maxTurns = this.config.maxTurns ?? -1;

    let terminationReason = AgentTerminateMode.GOAL;
    let terminationMessage: string | undefined = undefined;
    let terminationError: unknown | undefined = undefined;
    let finalResult: unknown | undefined = undefined;

    try {
      while (maxTurns === -1 || this.totalTurns < maxTurns) {
        if (signal?.aborted) {
          terminationReason = AgentTerminateMode.ABORTED;
          break;
        }

        this.totalTurns++;
        const promptId = `${this.sessionId}#${this.totalTurns}`;

        // Update tools on the client so sendMessageStream sees them
        await this.client.setTools(this.config.model);

        // Compression check (from LocalAgentExecutor / useGeminiStream patterns)
        if (this.config.capabilities?.compression) {
          await this.tryCompressChat(promptId);
        }

        const { toolCalls, events } = await this.runModelTurn(
          currentInput,
          promptId,
          isContinuation ? undefined : input,
          combinedSignal,
        );


        for await (const event of events) {
          yield event;
        }

        if (signal?.aborted) {
          terminationReason = AgentTerminateMode.ABORTED;
          break;
        }

        if (toolCalls.length > 0) {
          // Check for complete_task call
          const completeTaskCall = toolCalls.find(
            (tc) => tc.name === TASK_COMPLETE_TOOL_NAME,
          );
          if (completeTaskCall && this.config.outputConfig) {
            const outputName = this.config.outputConfig.outputName;
            const result = completeTaskCall.args[outputName];

            // Validate result
            const validation = this.config.outputConfig.schema.safeParse(result);
            if (validation.success) {
              finalResult = validation.data;
              yield {
                type: 'goal_completed',
                value: { result: finalResult },
              };

              // Manually create a success response for complete_task to satisfy history
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
              const response = {
                status: CoreToolCallStatus.Success,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
                tool: undefined as unknown as AnyDeclarativeTool as any,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
                invocation: undefined as unknown as AnyToolInvocation as any,
                response: {
                  callId: completeTaskCall.callId,
                  responseParts: [
                    {
                      functionResponse: {
                        id: completeTaskCall.callId,
                        name: TASK_COMPLETE_TOOL_NAME,
                        response: { result: 'Task completed successfully.' },
                      },
                    },
                  ],
                  resultDisplay: 'Task completed successfully.',
                  error: undefined,
                  errorType: undefined,
                  contentLength: 0,
                },
                durationMs: 0,
                schedulerId: ROOT_SCHEDULER_ID,
              } as unknown as CompletedToolCall;

              // Add to history so model knows it finished
              await this.client.addHistory({
                role: 'user',
                parts: response.response.responseParts,
              });

              terminationReason = AgentTerminateMode.GOAL;
              break;
            } else {
              // Yield error and continue (model needs to fix output)
              const errorMsg = `Output validation failed: ${JSON.stringify(validation.error.flatten())}`;
              const errorParts: Part[] = [
                {
                  functionResponse: {
                    id: completeTaskCall.callId,
                    name: TASK_COMPLETE_TOOL_NAME,
                    response: { error: errorMsg },
                  },
                },
              ];
              await this.client.addHistory({
                role: 'user',
                parts: errorParts,
              });
              currentInput = errorParts;
              isContinuation = true;
              continue;
            }
          }

          const results = await this.executeTools(toolCalls, signal);
          for await (const event of results.events) {
            yield event;
          }

          if (results.stopExecution || signal?.aborted) {
            if (signal?.aborted) {
              terminationReason = AgentTerminateMode.ABORTED;
            } else if (results.stopExecutionInfo) {
              terminationReason = AgentTerminateMode.ERROR;
              terminationMessage = results.stopExecutionInfo.error?.message;
              terminationError = results.stopExecutionInfo.error;
            }
            break;
          }

          // Check if we hit the turn limit
          if (maxTurns !== -1 && this.totalTurns >= maxTurns) {
            terminationReason = AgentTerminateMode.MAX_TURNS;
            terminationMessage = 'Maximum session turns exceeded.';
            break;
          }

          currentInput = results.nextParts;
          isContinuation = true;
        } else {
          // No more tool calls, turn is complete.
          // If we completed naturally but were at the limit, it's still a GOAL
          terminationReason = AgentTerminateMode.GOAL;
          break;
        }
      }
    } finally {
      yield {
        type: 'agent_finish',
        value: {
          sessionId: this.sessionId,
          totalTurns: this.totalTurns,
          reason: terminationReason,
          message: terminationMessage,
          error: terminationError,
        },
      };
    }
  }

  /**
   * Calls the model and yields the event stream.
   * Collects tool call requests for the next phase.
   */
  private async runModelTurn(
    input: string | Part[],
    promptId: string,
    displayContent?: string | Part[],
    signal?: AbortSignal,
  ) {
    const parts = Array.isArray(input) ? input : [{ text: input }];
    const toolCalls: ToolCallRequestInfo[] = [];

    const stream = this.client.sendMessageStream(
      parts,
      signal ?? new AbortController().signal,
      promptId,
      undefined, // maxTurns (client handles its own)
      false, // isInvalidStreamRetry
      displayContent,
    );

    const eventGenerator = async function* (): AsyncIterable<AgentEvent> {
      for await (const event of stream) {
        if (event.type === GeminiEventType.ToolCallRequest) {
          toolCalls.push(event.value);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        yield event as unknown as AgentEvent;
      }
    };

    return {
      toolCalls,
      events: eventGenerator(),
    };
  }

  /**
   * Executes a batch of tool calls via the Scheduler.
   */
  private async executeTools(
    toolCalls: ToolCallRequestInfo[],
    signal?: AbortSignal,
  ) {
    const events: AgentEvent[] = [];
    events.push({
      type: 'tool_suite_start',
      value: { count: toolCalls.length },
    });

    // We need to use our scoped tool registry.
    // However, the current Scheduler doesn't take a ToolRegistry in its constructor.
    // It uses the global registry from Config.
    // To implement scoping correctly without changing Scheduler, we might need a ScopedConfig.
    // For now, let's assume we can pass it or that we'll refactor Scheduler later.
    // As a workaround, we'll manually execute tools or rely on the global registry if scoping is not yet strictly enforced.
    // TODO: Support scoped ToolRegistry in Scheduler.

    const completedCalls = await this.scheduler.schedule(
      toolCalls,
      signal ?? new AbortController().signal,
    );

    events.push({
      type: 'tool_suite_finish',
      value: { responses: completedCalls.map((c) => c.response) },
    });

    // Record tool call info for persistence/telemetry
    try {
      const currentModel =
        this.client.getCurrentSequenceModel() ?? this.runtime.getModel();
      this.client
        .getChat()
        .recordCompletedToolCalls(currentModel, completedCalls);
      await recordToolCallInteractions(this.runtime, completedCalls);
    } catch (e) {
      debugLogger.warn(`Error recording tool call information: ${e}`);
    }

    const nextParts = completedCalls.flatMap((c) => c.response.responseParts);
    const stopExecutionInfo = completedCalls.find(
      (c) => c.response.errorType === ToolErrorType.STOP_EXECUTION,
    )?.response;

    const eventGenerator = async function* () {
      for (const event of events) {
        yield event;
      }
    };

    return {
      nextParts,
      stopExecution: !!stopExecutionInfo,
      stopExecutionInfo,
      events: eventGenerator(),
    };
  }

  /**
   * Attempts to compress the chat history if thresholds are exceeded.
   */
  private async tryCompressChat(promptId: string): Promise<void> {
    const chat = this.client.getChat();
    const model = this.config.model ?? this.runtime.getModel();

    const { newHistory, info } = await this.compressionService.compress(
      chat,
      promptId,
      false,
      model,
      this.runtime,
      this.hasFailedCompressionAttempt,
    );

    if (
      info.compressionStatus ===
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
    ) {
      this.hasFailedCompressionAttempt = true;
    } else if (info.compressionStatus === CompressionStatus.COMPRESSED) {
      if (newHistory) {
        chat.setHistory(newHistory);
        this.hasFailedCompressionAttempt = false;
      }
    }
  }

  /**
   * Returns the current message history for this session.
   */
  getHistory() {
    return this.client.getHistory();
  }

  /**
   * Returns the current session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }
}
