/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part } from '@google/genai';
import { type Config } from '../config/config.js';
import { type GeminiClient } from '../core/client.js';
import { type AgentEvent, type AgentConfig } from './types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import {
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
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
import {
  MessageBusType,
  type ToolCallsUpdateMessage,
} from '../confirmation-bus/types.js';

/**
 * AgentSession manages the state of a conversation and orchestrates the agent
 * loop.
 */
export class AgentSession {
  private readonly client: GeminiClient;
  private readonly scheduler: Scheduler;
  private readonly schedulerId: string;
  private readonly compressionService: ChatCompressionService;
  private totalTurns = 0;
  private hasFailedCompressionAttempt = false;

  constructor(
    private readonly sessionId: string,
    private readonly config: AgentConfig,
    private readonly runtime: Config,
  ) {
    this.client = this.runtime.getGeminiClient();
    this.schedulerId = `agent-scheduler-${this.sessionId}-${Math.random().toString(36).substring(2, 9)}`;
    this.scheduler = new Scheduler({
      config: this.runtime,
      messageBus: this.runtime.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: this.schedulerId,
    });
    this.compressionService = new ChatCompressionService();
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

    try {
      while (maxTurns === -1 || this.totalTurns < maxTurns) {
        if (signal?.aborted) {
          terminationReason = AgentTerminateMode.ABORTED;
          break;
        }

        this.totalTurns++;
        const promptId = `${this.sessionId}#${this.totalTurns}`;

        // Compression check (from LocalAgentExecutor / useGeminiStream patterns)
        if (this.config.capabilities?.compression) {
          await this.tryCompressChat(promptId);
        }

        const results = await this.runModelTurn(
          currentInput,
          promptId,
          isContinuation ? undefined : input,
          signal,
        );

        for await (const event of results.events) {
          yield event;
        }

        if (results.loopDetected) {
          terminationReason = AgentTerminateMode.LOOP;
          terminationMessage = 'Loop detected, stopping execution';
          break;
        }

        if (signal?.aborted) {
          terminationReason = AgentTerminateMode.ABORTED;
          break;
        }

        if (results.toolCalls.length > 0) {
          const toolRun = this.executeTools(results.toolCalls, signal);
          let resultsTools;
          while (true) {
            const { value, done } = await toolRun.next();
            if (done) {
              resultsTools = value;
              break;
            }
            yield value;
          }

          if (resultsTools.stopExecution || (signal && signal.aborted)) {
            if (signal && signal.aborted) {
              terminationReason = AgentTerminateMode.ABORTED;
            } else if (resultsTools.stopExecutionInfo) {
              terminationReason = AgentTerminateMode.ERROR;
              terminationMessage =
                resultsTools.stopExecutionInfo.error?.message;
              terminationError = resultsTools.stopExecutionInfo.error;
            }
            break;
          }

          // Check if we hit the turn limit
          if (maxTurns !== -1 && this.totalTurns >= maxTurns) {
            terminationReason = AgentTerminateMode.MAX_TURNS;
            terminationMessage = 'Maximum session turns exceeded.';
            break;
          }

          currentInput = resultsTools.nextParts;
          isContinuation = true;
        } else {
          // No more tool calls, turn is complete.
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
  ): Promise<{
    toolCalls: ToolCallRequestInfo[];
    events: AsyncIterable<AgentEvent>;
    loopDetected: boolean;
  }> {
    const parts = Array.isArray(input) ? input : [{ text: input }];
    const toolCalls: ToolCallRequestInfo[] = [];
    let loopDetected = false;

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
        } else if (event.type === GeminiEventType.LoopDetected) {
          loopDetected = true;
        }
        yield event as AgentEvent;
      }
    };

    const events = eventGenerator();

    return {
      toolCalls,
      events,
      get loopDetected() {
        return loopDetected;
      },
    };
  }

  /**
   * Executes a batch of tool calls via the Scheduler.
   */
  private async *executeTools(
    toolCalls: ToolCallRequestInfo[],
    signal?: AbortSignal,
  ): AsyncGenerator<
    AgentEvent,
    {
      nextParts: Part[];
      stopExecution: boolean;
      stopExecutionInfo: ToolCallResponseInfo | undefined;
    }
  > {
    yield {
      type: 'tool_suite_start',
      value: { count: toolCalls.length },
    };

    const eventQueue: AgentEvent[] = [];
    let resolveNext: (() => void) | undefined;
    let isFinished = false;

    // Track seen status transitions to avoid duplicate events
    const seenStatuses = new Map<string, CoreToolCallStatus>();

    const messageBus = this.runtime.getMessageBus();
    const onToolUpdate = (message: ToolCallsUpdateMessage) => {
      if (message.schedulerId !== this.schedulerId) return;

      for (const call of message.toolCalls) {
        const prevStatus = seenStatuses.get(call.request.callId);
        if (prevStatus === call.status) continue;

        if (call.status === CoreToolCallStatus.Executing) {
          eventQueue.push({ type: 'tool_call_start', value: call.request });
        } else if (
          call.status === CoreToolCallStatus.Success ||
          call.status === CoreToolCallStatus.Error ||
          call.status === CoreToolCallStatus.Cancelled
        ) {
          eventQueue.push({
            type: 'tool_call_finish',
            value: call.response,
          });
        }
        seenStatuses.set(call.request.callId, call.status);
      }
      resolveNext?.();
    };

    messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, onToolUpdate);

    const schedulePromise = this.scheduler.schedule(
      toolCalls,
      signal ?? new AbortController().signal,
    );

    try {
      while (!isFinished || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          const event = eventQueue.shift();
          if (event) yield event;
        } else {
          const waitNext = new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
          await Promise.race([
            waitNext,
            schedulePromise.then(() => {
              isFinished = true;
              resolveNext?.();
            }),
          ]);
        }
      }

      const completedCalls = await schedulePromise;

      yield {
        type: 'tool_suite_finish',
        value: { responses: completedCalls.map((c) => c.response) },
      };

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

      return {
        nextParts,
        stopExecution: !!stopExecutionInfo,
        stopExecutionInfo,
      };
    } finally {
      messageBus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, onToolUpdate);
    }
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
