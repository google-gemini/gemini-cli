/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Part,
  type FunctionDeclaration,
  type Content,
} from '@google/genai';
import { type Config } from '../config/config.js';
import { GeminiChat } from '../core/geminiChat.js';
import {
  Turn,
  GeminiEventType,
  type ServerGeminiStreamEvent,
  CompressionStatus,
} from '../core/turn.js';
import {
  AgentTerminateMode,
  type AgentInputs,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_TIME_MINUTES,
} from './types.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { ToolOutputMaskingService } from '../services/toolOutputMaskingService.js';
import { resolveModel } from '../config/models.js';
import { type RoutingContext } from '../routing/routingStrategy.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { SubagentTool } from './subagent-tool.js';
import { scheduleAgentTools } from './agent-scheduler.js';
import {
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
  ROOT_SCHEDULER_ID,
} from '../scheduler/types.js';
import { promptIdContext } from '../utils/promptIdContext.js';
import { logAgentStart, logAgentFinish } from '../telemetry/loggers.js';
import { AgentStartEvent, AgentFinishEvent } from '../telemetry/types.js';
import { DeadlineTimer } from '../utils/deadlineTimer.js';
import { type AgentBehavior } from './behavior.js';
import { debugLogger } from '../utils/debugLogger.js';

const TASK_COMPLETE_TOOL_NAME = 'complete_task';

export interface AgentHarnessOptions {
  config: Config;
  behavior: AgentBehavior;
  /** Is this an isolated tool registry (subagents)? If not provided, uses global. */
  isolatedTools?: boolean;
  /** Inputs for subagent templating. */
  inputs?: AgentInputs;
  /** If provided, this prompt_id will be used as a prefix. */
  parentPromptId?: string;
  /** Existing chat history to initialize with (e.g. for main agent turns). */
  history?: Content[];
}

/**
 * A unified harness for executing agents (both main CLI and subagents).
 * Consolidates ReAct loop logic, tool scheduling, and state management.
 *
 * Uses an AgentBehavior plugin to handle specific personality differences.
 */
export class AgentHarness {
  private readonly config: Config;
  private readonly behavior: AgentBehavior;
  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private readonly toolOutputMaskingService: ToolOutputMaskingService;
  private readonly toolRegistry: ToolRegistry;
  private readonly initialHistory?: Content[];

  private chat?: GeminiChat;
  private currentSequenceModel: string | null = null;
  private turnCounter = 0;

  constructor(options: AgentHarnessOptions) {
    this.config = options.config;
    this.behavior = options.behavior;
    this.initialHistory = options.history;

    this.loopDetector = new LoopDetectionService(this.config);
    this.compressionService = new ChatCompressionService();
    this.toolOutputMaskingService = new ToolOutputMaskingService();

    // Use an isolated tool registry for subagents, or the global one for the main agent.
    this.toolRegistry = options.isolatedTools
      ? new ToolRegistry(this.config, this.config.getMessageBus())
      : this.config.getToolRegistry();
  }

  /**
   * Initializes the harness, creating the underlying chat object.
   */
  async initialize(): Promise<void> {
    await this.behavior.initialize(this.toolRegistry);
    this.chat = await this.createChat();
  }

  private async createChat(): Promise<GeminiChat> {
    const systemInstruction = await this.behavior.getSystemInstruction();
    const history =
      this.initialHistory ?? (await this.behavior.getInitialHistory());
    const tools = this.prepareToolsList();

    return new GeminiChat(
      this.config,
      systemInstruction,
      [{ functionDeclarations: tools }],
      history,
    );
  }

  private prepareToolsList(): FunctionDeclaration[] {
    const modelId = this.currentSequenceModel ?? undefined;
    const baseTools = this.toolRegistry.getFunctionDeclarations(modelId);
    return this.behavior.prepareTools(baseTools);
  }

  /**
   * Runs the agent with the given request.
   */
  async *run(
    request: Part[],
    signal: AbortSignal,
    maxTurns?: number,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    const startTime = Date.now();
    const maxTurnsLimit = maxTurns ?? DEFAULT_MAX_TURNS;
    const maxTimeMinutes = DEFAULT_MAX_TIME_MINUTES;

    debugLogger.debug(
      `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Starting unified ReAct loop. maxTurns: ${maxTurnsLimit}, maxTime: ${maxTimeMinutes}m`,
    );

    const deadlineTimer = new DeadlineTimer(
      maxTimeMinutes * 60 * 1000,
      'Agent timed out.',
    );

    // Track time spent waiting for user confirmation
    const onWaitingForConfirmation = (waiting: boolean) => {
      if (waiting) {
        deadlineTimer.pause();
      } else {
        deadlineTimer.resume();
      }
    };

    const combinedSignal = AbortSignal.any([signal, deadlineTimer.signal]);

    logAgentStart(
      this.config,
      new AgentStartEvent(this.behavior.agentId, this.behavior.name),
    );

    if (!this.chat) {
      await this.initialize();
    }

    let turn = new Turn(this.chat!, this.behavior.agentId);
    let currentRequest = await this.behavior.transformRequest(request);

    let terminateReason = AgentTerminateMode.ABORTED;

    try {
      while (this.turnCounter < maxTurnsLimit) {
        const promptId = `${this.behavior.agentId}#${this.turnCounter}`;
        const historySize = this.chat?.getHistory().length || 0;
        debugLogger.debug(
          `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Starting turn ${this.turnCounter} (promptId: ${promptId}). History size: ${historySize} messages.`,
        );

        if (combinedSignal.aborted) {
          terminateReason = deadlineTimer.signal.aborted
            ? AgentTerminateMode.TIMEOUT
            : AgentTerminateMode.ABORTED;
          if (terminateReason === AgentTerminateMode.ABORTED) {
            yield { type: GeminiEventType.UserCancelled };
          }
          break;
        }

        // 1. Hook: Before Agent
        const beforeResult =
          await this.behavior.fireBeforeAgent(currentRequest);
        if (beforeResult.stop) {
          terminateReason = AgentTerminateMode.ABORTED;
          if (beforeResult.systemMessage) {
            yield {
              type: GeminiEventType.Error,
              value: { error: { message: beforeResult.systemMessage } },
            };
          }
          break;
        }
        if (beforeResult.additionalContext) {
          currentRequest.push({
            text: `<hook_context>${beforeResult.additionalContext}</hook_context>`,
          });
        }

        // 2. Sync Environment (IDE Context etc)
        const envSync = await this.behavior.syncEnvironment(
          this.chat!.getHistory(),
        );
        if (envSync.additionalParts) {
          currentRequest.push(...envSync.additionalParts);
        }

        // 3. Compression
        const compressionResult = await this.tryCompressChat(promptId);
        if (
          compressionResult.compressionStatus === CompressionStatus.COMPRESSED
        ) {
          yield {
            type: GeminiEventType.ChatCompressed,
            value: compressionResult,
          };
        }

        await this.toolOutputMaskingService.mask(
          this.chat!.getHistory(),
          this.config,
        );

        // 4. Loop Detection
        if (await this.loopDetector.turnStarted(combinedSignal)) {
          terminateReason = AgentTerminateMode.LOOP_DETECTED;
          yield { type: GeminiEventType.LoopDetected };
          return turn;
        }

        // 5. Model Selection/Routing
        const modelToUse = await this.selectModel(
          currentRequest,
          combinedSignal,
        );
        if (!this.currentSequenceModel) {
          yield { type: GeminiEventType.ModelInfo, value: modelToUse };
          this.currentSequenceModel = modelToUse;
        }

        // 6. Update tools for this model
        this.chat!.setTools([
          { functionDeclarations: this.prepareToolsList() },
        ]);

        // 7. Run the turn
        const turnStream = promptIdContext.run(promptId, () =>
          turn.run({ model: modelToUse }, currentRequest, combinedSignal),
        );
        let hasError = false;
        let cumulativeResponse = '';

        for await (const event of turnStream) {
          yield event;
          if (event.type === GeminiEventType.Error) hasError = true;
          if (event.type === GeminiEventType.Content && event.value) {
            cumulativeResponse += event.value;
          }

          // Subagent activity reporting
          if (this.behavior.name !== 'main') {
            const displayName =
              this.behavior.definition?.displayName || this.behavior.name;

            if (event.type === GeminiEventType.Thought) {
              yield {
                type: GeminiEventType.SubagentActivity,
                value: {
                  agentName: displayName,
                  type: 'THOUGHT',
                  data: { subject: event.value.subject },
                },
              };
            }

            if (event.type === GeminiEventType.ToolCallRequest) {
              yield {
                type: GeminiEventType.SubagentActivity,
                value: {
                  agentName: displayName,
                  type: 'TOOL_CALL_START',
                  data: { name: event.value.name, args: event.value.args },
                },
              };
            }
          }
        }

        if (hasError) {
          terminateReason = AgentTerminateMode.ERROR;
          return turn;
        }

        // 8. Hook: After Agent
        const afterResult = await this.behavior.fireAfterAgent(
          currentRequest,
          cumulativeResponse,
          turn,
        );
        if (afterResult.stop) {
          terminateReason = AgentTerminateMode.GOAL;
          if (afterResult.contextCleared) {
            await this.initialize();
          }
          break;
        }
        if (afterResult.shouldContinue) {
          currentRequest = [{ text: afterResult.reason || 'Continue' }];
          this.turnCounter++;
          turn = new Turn(this.chat!, this.behavior.agentId);
          continue;
        }

        if (combinedSignal.aborted) {
          terminateReason = deadlineTimer.signal.aborted
            ? AgentTerminateMode.TIMEOUT
            : AgentTerminateMode.ABORTED;
          break;
        }

        // 9. Handle tool calls or termination
        if (turn.pendingToolCalls.length > 0) {
          const toolResults = await this.executeTools(
            turn.pendingToolCalls,
            combinedSignal,
            onWaitingForConfirmation,
          );

          debugLogger.debug(
            `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Received ${toolResults.length} tool results. Names: ${toolResults.map((tr) => tr.name).join(', ')}`,
          );

          // Yield responses so UI knows they are done
          for (const result of toolResults) {
            debugLogger.debug(
              `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Tool ${result.name} finished. Display length: ${String(result.result?.resultDisplay).length}`,
            );

            if (result.result) {
              yield {
                type: GeminiEventType.ToolCallResponse,
                value: result.result,
              };

              // Subagent activity reporting
              if (this.behavior.name !== 'main') {
                yield {
                  type: GeminiEventType.SubagentActivity,
                  value: {
                    agentName: this.behavior.name,
                    type: 'TOOL_CALL_END',
                    data: {
                      name: result.name,
                      output: result.result.resultDisplay,
                    },
                  },
                };
              }

              const tool = this.toolRegistry.getTool(result.name);
              if (tool instanceof SubagentTool) {
                yield {
                  type: GeminiEventType.SubagentActivity,
                  value: {
                    agentName: this.behavior.name,
                    type: 'TOOL_CALL_END',
                    data: {
                      name: result.name,
                      output: result.result.resultDisplay,
                    },
                  },
                };
              }
            }
          }

          const goalReached = this.behavior.isGoalReached(toolResults);
          debugLogger.debug(
            `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] isGoalReached check: ${goalReached}`,
          );

          if (goalReached) {
            terminateReason = AgentTerminateMode.GOAL;
            debugLogger.debug(
              `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Goal reached. Processing findings for ${toolResults.length} tool results.`,
            );

            // Extract results from the 'complete_task' tool call arguments
            for (const r of toolResults) {
              const completeCall = turn.pendingToolCalls.find(
                (c) => c.name === TASK_COMPLETE_TOOL_NAME,
              );

              let findingsText: string | undefined;

              if (r.name === TASK_COMPLETE_TOOL_NAME && completeCall) {
                const outputName =
                  this.behavior.definition?.outputConfig?.outputName ||
                  'result';
                const args = completeCall.args;
                const rawFindings = args[outputName] || args['result'];

                debugLogger.debug(
                  `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Extracting from complete_task args (${outputName}). Found: ${!!rawFindings}`,
                );

                if (rawFindings !== undefined) {
                  // CAPTURE RAW DATA: Don't stringify if it's an object/array,
                  // we need to preserve structure for the parent model.
                  turn.submittedOutput = rawFindings;

                  findingsText =
                    typeof rawFindings === 'object'
                      ? JSON.stringify(rawFindings, null, 2)
                      : String(rawFindings);
                }
              } else {
                const findings =
                  r.result?.data?.['result'] || r.result?.resultDisplay;
                if (findings !== undefined) {
                  findingsText = String(findings);
                  // Also capture as raw if not already set
                  if (turn.submittedOutput === undefined) {
                    turn.submittedOutput = findings;
                  }
                }
              }

              if (findingsText) {
                debugLogger.debug(
                  `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Captured findings text. Length: ${findingsText.length}`,
                );
              }
            }

            return turn;
          }

          currentRequest = toolResults.map((r) => r.part);
          this.turnCounter++;
          if (this.turnCounter >= maxTurnsLimit) {
            terminateReason = AgentTerminateMode.MAX_TURNS;
            debugLogger.debug(
              `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Reached turn limit (${maxTurnsLimit}).`,
            );
            break;
          }
          turn = new Turn(this.chat!, this.behavior.agentId);

          // Only yield TurnFinished if we are the main agent.
          // Nested subagent turns should be internal and not trigger UI flushes in the parent.
          if (this.behavior.name === 'main') {
            yield { type: GeminiEventType.TurnFinished };
          }
        } else {
          // No tool calls. Check for continuation.
          const nextParts = await this.behavior.getContinuationRequest(
            turn,
            combinedSignal,
          );
          if (nextParts) {
            currentRequest = nextParts;
            this.turnCounter++;
            if (this.turnCounter >= maxTurnsLimit) {
              terminateReason = AgentTerminateMode.MAX_TURNS;
              debugLogger.debug(
                `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Reached turn limit (${maxTurnsLimit}) during continuation.`,
              );
              break;
            }
            turn = new Turn(this.chat!, this.behavior.agentId);
            if (this.behavior.name === 'main') {
              yield { type: GeminiEventType.TurnFinished };
            }
            continue;
          }

          if (this.behavior.name !== 'main') {
            terminateReason = AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL;
          } else {
            terminateReason = AgentTerminateMode.GOAL;
          }
          break;
        }
      }

      // FINALIZATION & RECOVERY
      if (
        terminateReason !== AgentTerminateMode.GOAL &&
        terminateReason !== AgentTerminateMode.ABORTED
      ) {
        if (this.turnCounter >= maxTurnsLimit)
          terminateReason = AgentTerminateMode.MAX_TURNS;

        const recoverySuccess = yield* this.behavior.executeRecovery(
          turn,
          terminateReason,
          signal,
        );
        if (recoverySuccess) {
          terminateReason = AgentTerminateMode.GOAL;
          return turn;
        }

        if (this.behavior.name !== 'main') {
          yield {
            type: GeminiEventType.Error,
            value: {
              error: {
                message: this.behavior.getFinalFailureMessage(
                  terminateReason,
                  maxTurnsLimit,
                  maxTimeMinutes,
                ),
              },
            },
          };
        }
      }
    } finally {
      deadlineTimer.abort();
      const duration = Date.now() - startTime;
      debugLogger.debug(
        `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Finished. Outcome: ${terminateReason}, Duration: ${duration}ms, Turns: ${this.turnCounter}`,
      );
      logAgentFinish(
        this.config,
        new AgentFinishEvent(
          this.behavior.agentId,
          this.behavior.name,
          duration,
          this.turnCounter,
          terminateReason,
        ),
      );
    }

    return turn;
  }

  private async tryCompressChat(promptId: string) {
    const model =
      this.currentSequenceModel ?? resolveModel(this.config.getActiveModel());
    const { info } = await this.compressionService.compress(
      this.chat!,
      promptId,
      false,
      model,
      this.config,
      false,
    );
    return info;
  }

  private async selectModel(
    request: Part[],
    signal: AbortSignal,
  ): Promise<string> {
    if (this.currentSequenceModel) return this.currentSequenceModel;
    const routingContext: RoutingContext = {
      history: this.chat!.getHistory(true),
      request,
      signal,
      requestedModel: this.config.getModel(),
    };
    const decision = await this.config
      .getModelRouterService()
      .route(routingContext);
    return decision.model;
  }

  private async executeTools(
    calls: ToolCallRequestInfo[],
    signal: AbortSignal,
    onWaitingForConfirmation?: (waiting: boolean) => void,
  ): Promise<
    Array<{ name: string; part: Part; result: ToolCallResponseInfo }>
  > {
    const taskCompleteCalls = calls.filter(
      (c) => c.name === TASK_COMPLETE_TOOL_NAME,
    );
    const otherCalls = calls.filter((c) => c.name !== TASK_COMPLETE_TOOL_NAME);

    debugLogger.debug(
      `[AgentHarness] [${this.behavior.name}:${this.behavior.agentId}] Executing ${calls.length} tool calls (${otherCalls.length} scheduled)`,
    );

    let completedCalls: Array<{
      request: ToolCallRequestInfo;
      response: ToolCallResponseInfo;
    }> = [];

    if (otherCalls.length > 0) {
      const schedulerId =
        this.behavior.name === 'main'
          ? ROOT_SCHEDULER_ID
          : this.behavior.agentId;

      completedCalls = await scheduleAgentTools(this.config, otherCalls, {
        schedulerId,
        toolRegistry: this.toolRegistry,
        signal,
        onWaitingForConfirmation,
      });
    }

    const results = completedCalls.map((call) => ({
      name: call.request.name,
      part: call.response.responseParts[0],
      result: call.response,
    }));

    for (const call of taskCompleteCalls) {
      const response: ToolCallResponseInfo = {
        callId: call.callId,
        responseParts: [
          {
            functionResponse: {
              name: TASK_COMPLETE_TOOL_NAME,
              response: { result: 'Task completed locally' },
              id: call.callId,
            },
          },
        ],
        resultDisplay: 'Task completed locally',
        error: undefined,
        errorType: undefined,
        contentLength: 'Task completed locally'.length,
      };
      results.push({
        name: TASK_COMPLETE_TOOL_NAME,
        part: response.responseParts[0],
        result: response,
      });
    }

    return results;
  }
}
