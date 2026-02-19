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
  ROOT_SCHEDULER_ID,
  type ToolCallRequestInfo,
} from '../scheduler/types.js';
import { GeminiEventType, CompressionStatus } from '../core/turn.js';
import { recordToolCallInteractions } from '../code_assist/telemetry.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { AgentTerminateMode } from './types.js';
import type { ResumedSessionData } from '../services/chatRecordingService.js';
import { convertSessionToClientHistory } from '../utils/sessionUtils.js';

/**
 * AgentSession manages the state of a conversation and orchestrates the agent
 * loop.
 */
export class AgentSession {
  private readonly client: GeminiClient;
  private readonly scheduler: Scheduler;
  private readonly compressionService: ChatCompressionService;
  private totalTurns = 0;
  private hasFailedCompressionAttempt = false;

  constructor(
    private readonly sessionId: string,
    private readonly config: AgentConfig,
    private readonly runtime: Config,
  ) {
    // For now, we reuse the GeminiClient from the global config.
    this.client = this.runtime.getGeminiClient();
    this.scheduler = new Scheduler({
      config: this.runtime,
      messageBus: this.runtime.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
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

        const { toolCalls, events } = await this.runModelTurn(
          currentInput,
          promptId,
          isContinuation ? undefined : input,
          signal,
        );

        for await (const event of events) {
          yield event;
        }

        if (signal?.aborted) {
          terminationReason = AgentTerminateMode.ABORTED;
          break;
        }

        if (toolCalls.length > 0) {
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
        yield event as AgentEvent;
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
