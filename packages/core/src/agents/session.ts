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
  type CompletedToolCall,
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

/** Result of a single model turn in the ReAct loop. */
export interface ModelTurnResult {
  /** The specific tool calls requested by the model. */
  toolCalls: ToolCallRequestInfo[];
  /** The unified event stream from this model turn. */
  events: AsyncIterable<AgentEvent>;
  /** Whether an infinite tool loop was detected. */
  loopDetected: boolean;
}

/** Result of executing a batch of tool calls. */
export interface ToolExecutionResult {
  /** The response parts from the tool execution to be sent back to the model. */
  nextParts: Part[];
  /** Whether execution should stop immediately (e.g. on fatal tool error). */
  stopExecution: boolean;
  /** Optional details if execution was stopped. */
  stopExecutionInfo: ToolCallResponseInfo | undefined;
}

/**
 * AgentSession manages the state of a conversation and orchestrates the agent
 * loop.
 */
export class AgentSession {
  readonly sessionId: string;
  private readonly client: GeminiClient;
  private readonly scheduler: Scheduler;
  private readonly schedulerId: string;
  private readonly compressionService: ChatCompressionService;
  private totalTurns = 0;
  private hasFailedCompressionAttempt = false;

  constructor(
    sessionId: string,
    private readonly config: AgentConfig,
    private readonly runtime: Config,
  ) {
    this.sessionId = sessionId;
    this.client = this.runtime.getGeminiClient();
    this.schedulerId = `agent-scheduler-${this.sessionId}-${Math.random().toString(36).substring(2, 9)}`;
    this.scheduler = new Scheduler({
      config: this.runtime,
      messageBus: this.runtime.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: this.schedulerId,
    });
    this.compressionService = new ChatCompressionService();

    // Ensure system instruction is set from AgentConfig
    if (this.config.systemInstruction) {
      if (this.client.isInitialized()) {
        this.client
          .getChat()
          .setSystemInstruction(this.config.systemInstruction);
      }
    }
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

    // Re-apply system instruction after resume since resume re-creates the chat
    if (this.config.systemInstruction) {
      this.client.getChat().setSystemInstruction(this.config.systemInstruction);
    }
  }

  /**
   * Executes the ReAct loop for a given user input.
   * Returns an AsyncIterable of events occurring during the session.
   */
  async *prompt(
    input: string | Part[],
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    const internalController = new AbortController();
    const combinedSignal = signal
      ? AbortSignal.any([signal, internalController.signal])
      : internalController.signal;

    yield {
      type: 'agent_start',
      value: { sessionId: this.sessionId },
    };

    let terminationReason = AgentTerminateMode.GOAL;
    let terminationMessage: string | undefined = undefined;
    let terminationError: unknown | undefined = undefined;

    try {
      const loop = this._runLoop(input, combinedSignal);
      for await (const event of loop) {
        if (event.type === GeminiEventType.LoopDetected) {
          terminationReason = AgentTerminateMode.LOOP;
          terminationMessage = 'Loop detected, stopping execution';
        }
        yield event;
      }

      if (combinedSignal.aborted) {
        terminationReason = AgentTerminateMode.ABORTED;
      } else if (
        terminationReason === AgentTerminateMode.GOAL &&
        this.config.maxTurns &&
        this.config.maxTurns !== -1 &&
        this.totalTurns >= this.config.maxTurns
      ) {
        // Only set MAX_TURNS if we haven't already hit another reason (like LOOP)
        // and we are actually at or above the turn limit.
        terminationReason = AgentTerminateMode.MAX_TURNS;
        terminationMessage = 'Maximum session turns exceeded.';
      }
    } catch (e) {
      terminationReason = AgentTerminateMode.ERROR;
      terminationMessage = e instanceof Error ? e.message : String(e);
      terminationError = e;
      throw e;
    } finally {
      internalController.abort();
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
   * Internal generator managing the turn-by-turn ReAct loop.
   */
  private async *_runLoop(
    input: string | Part[],
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    let currentInput = input;
    let isContinuation = false;
    const maxTurns = this.config.maxTurns ?? -1;

    while (maxTurns === -1 || this.totalTurns < maxTurns) {
      if (signal.aborted) return;

      this.totalTurns++;
      const promptId = `${this.sessionId}#${this.totalTurns}`;

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

      if (results.loopDetected) return;
      if (signal.aborted) return;

      if (results.toolCalls.length > 0) {
        const toolRun = this._handleToolCalls(results.toolCalls, signal);
        let toolResults: ToolExecutionResult;
        while (true) {
          const { value, done } = await toolRun.next();
          if (done) {
            toolResults = value;
            break;
          }
          yield value;
        }

        if (toolResults.stopExecution || signal.aborted) {
          if (toolResults.stopExecution && toolResults.stopExecutionInfo) {
            throw (
              toolResults.stopExecutionInfo.error ??
              new Error('Tool execution stopped')
            );
          }
          return;
        }

        if (maxTurns !== -1 && this.totalTurns >= maxTurns) {
          return;
        }

        currentInput = toolResults.nextParts;
        isContinuation = true;
      } else {
        return;
      }
    }
  }

  /**
   * Orchestrates tool execution turn and yields events.
   */
  private async *_handleToolCalls(
    toolCalls: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, ToolExecutionResult> {
    const toolRun = this.executeTools(toolCalls, signal);
    while (true) {
      const { value, done } = await toolRun.next();
      if (done) return value;
      yield value;
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
  ): Promise<ModelTurnResult> {
    const parts = Array.isArray(input) ? input : [{ text: input }];
    const toolCalls: ToolCallRequestInfo[] = [];
    let loopDetected = false;

    // Ensure client is initialized before sending message
    if (!this.client.isInitialized()) {
      await this.client.initialize();
      // Re-apply system instruction after initialization
      if (this.config.systemInstruction) {
        this.client
          .getChat()
          .setSystemInstruction(this.config.systemInstruction);
      }
    }

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
        yield event;
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
  ): AsyncGenerator<AgentEvent, ToolExecutionResult> {
    yield {
      type: 'tool_suite_start',
      value: { count: toolCalls.length },
    };

    const eventQueue: AgentEvent[] = [];
    let resolveNext: (() => void) | undefined;
    let isFinished = false;

    const onToolUpdate = this._createToolUpdateHandler(eventQueue, () =>
      resolveNext?.(),
    );

    const messageBus = this.runtime.getMessageBus();
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

      await this._recordTelemetry(completedCalls);

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
   * Creates a handler for MessageBus tool update events.
   */
  private _createToolUpdateHandler(
    eventQueue: AgentEvent[],
    onNewEvents: () => void,
  ) {
    const seenStatuses = new Map<string, CoreToolCallStatus>();

    return (message: ToolCallsUpdateMessage) => {
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
      onNewEvents();
    };
  }

  /**
   * Records tool interaction telemetry and persistence data.
   */
  private async _recordTelemetry(completedCalls: CompletedToolCall[]) {
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
}
