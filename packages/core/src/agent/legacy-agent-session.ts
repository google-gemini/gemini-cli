/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LegacyAgentSession — owns the agentic loop (send + tool
 * scheduling + multi-turn), translating all events to AgentEvents.
 */

import type { Part } from '@google/genai';
import { GeminiEventType } from '../core/turn.js';
import type { GeminiClient } from '../core/client.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { Config } from '../config/config.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { recordToolCallInteractions } from '../code_assist/telemetry.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  translateEvent,
  createTranslationState,
  type TranslationState,
} from './event-translator.js';
import type {
  AgentEvent,
  AgentSession,
  AgentSend,
  ContentPart,
} from './types.js';

export interface LegacySessionDeps {
  client: GeminiClient;
  scheduler: Scheduler;
  config: Config;
  promptId: string;
  streamId?: string;
}

// ---------------------------------------------------------------------------
// LegacyAgentSession
// ---------------------------------------------------------------------------

export class LegacyAgentSession implements AgentSession {
  private _events: AgentEvent[] = [];
  private _translationState: TranslationState;
  private _subscribers: Set<() => void> = new Set();
  private _streamDone: boolean = false;
  private _abortController: AbortController = new AbortController();

  private readonly _client: GeminiClient;
  private readonly _scheduler: Scheduler;
  private readonly _config: Config;
  private readonly _promptId: string;

  constructor(deps: LegacySessionDeps) {
    this._translationState = createTranslationState(deps.streamId);
    this._client = deps.client;
    this._scheduler = deps.scheduler;
    this._config = deps.config;
    this._promptId = deps.promptId;
  }

  // ---------------------------------------------------------------------------
  // AgentSession interface — send() owns the agentic loop
  // ---------------------------------------------------------------------------

  async send(payload: AgentSend): Promise<{ streamId: string }> {
    // AgentSend is a union — narrow to MessageSend to access .message
    const message = 'message' in payload ? payload.message : undefined;
    if (!message) {
      throw new Error('LegacyAgentSession.send() only supports message sends.');
    }

    const parts = contentPartsToGeminiParts(message);

    // Start the loop in the background — don't await
    this._runLoop(parts).catch((err) => {
      this.emitErrorAndStreamEnd(err);
    });

    return { streamId: this._translationState.streamId };
  }

  /**
   * Returns an async iterator that replays existing events, then live-follows
   * new events as they arrive.
   */
  async *stream(options?: {
    streamId?: string;
    eventId?: string;
  }): AsyncIterableIterator<AgentEvent> {
    let startIndex = 0;

    if (options?.eventId) {
      const idx = this._events.findIndex((e) => e.id === options.eventId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    // Replay existing events
    for (let i = startIndex; i < this._events.length; i++) {
      const event = this._events[i];
      if (event) yield event;
    }

    if (this._streamDone) return;

    // Live-follow new events
    let replayedUpTo = this._events.length;
    while (!this._streamDone) {
      await new Promise<void>((resolve) => {
        if (this._events.length > replayedUpTo || this._streamDone) {
          resolve();
          return;
        }
        const handler = (): void => {
          this._subscribers.delete(handler);
          resolve();
        };
        this._subscribers.add(handler);
      });

      while (replayedUpTo < this._events.length) {
        const event = this._events[replayedUpTo];
        if (event) yield event;
        replayedUpTo++;
      }
    }
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  get events(): AgentEvent[] {
    return this._events;
  }

  // ---------------------------------------------------------------------------
  // Core: agentic loop
  // ---------------------------------------------------------------------------

  private async _runLoop(initialParts: Part[]): Promise<void> {
    let currentParts: Part[] = initialParts;
    let turnCount = 0;
    const maxTurns = this._config.getMaxSessionTurns();

    try {
      while (true) {
        turnCount++;
        if (maxTurns >= 0 && turnCount > maxTurns) {
          this.ensureStreamStart();
          this.appendAndNotify([
            this.makeInternalEvent('stream_end', {
              streamId: this._translationState.streamId,
              reason: 'max_turns',
            }),
          ]);
          this._streamDone = true;
          return;
        }

        const toolCallRequests: ToolCallRequestInfo[] = [];

        const responseStream = this._client.sendMessageStream(
          currentParts,
          this._abortController.signal,
          this._promptId,
        );

        // Process the stream — translate events and collect tool requests
        for await (const event of responseStream) {
          if (this._abortController.signal.aborted) {
            this.ensureStreamStart();
            this.appendAndNotify([
              this.makeInternalEvent('stream_end', {
                streamId: this._translationState.streamId,
                reason: 'aborted',
              }),
            ]);
            this._streamDone = true;
            return;
          }

          // Collect tool call requests BEFORE translating so we can
          // decide whether to suppress the Finished event's stream_end.
          if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }

          // Translate to AgentEvents
          const agentEvents = translateEvent(event, this._translationState);

          // Finished events don't mean the session is done — if there are
          // pending tool calls, more turns are coming. Suppress stream_end
          // from the Finished event in that case (keep usage events).
          if (
            event.type === GeminiEventType.Finished &&
            toolCallRequests.length > 0
          ) {
            const filtered = agentEvents.filter((e) => e.type !== 'stream_end');
            this.appendAndNotify(filtered);
          } else {
            this.appendAndNotify(agentEvents);
          }

          // Error events → abort the loop (translator already emitted error AgentEvent)
          if (event.type === GeminiEventType.Error) {
            this.ensureStreamEnd();
            this._streamDone = true;
            return;
          }

          // Terminal events — translator already emitted stream_end
          if (
            event.type === GeminiEventType.AgentExecutionStopped ||
            event.type === GeminiEventType.LoopDetected ||
            event.type === GeminiEventType.AgentExecutionBlocked
          ) {
            this._streamDone = true;
            return;
          }
        }

        if (toolCallRequests.length === 0) {
          // No tool calls — done. Ensure stream_end.
          this.ensureStreamEnd();
          this._streamDone = true;
          return;
        }

        // Schedule tool calls
        const completedToolCalls = await this._scheduler.schedule(
          toolCallRequests,
          this._abortController.signal,
        );

        // Emit tool_response AgentEvents for each completed tool call
        const toolResponseParts: Part[] = [];
        for (const tc of completedToolCalls) {
          const response = tc.response;
          const request = tc.request;

          this.appendAndNotify([
            this.makeInternalEvent('tool_response', {
              requestId: request.callId,
              name: request.name,
              content: mapCompletedToolResponseParts(response.responseParts),
              isError: response.error !== undefined,
              ...(response.resultDisplay !== undefined
                ? {
                    displayContent: [
                      {
                        type: 'text',
                        text:
                          typeof response.resultDisplay === 'string'
                            ? response.resultDisplay
                            : JSON.stringify(response.resultDisplay),
                      },
                    ],
                  }
                : {}),
              ...(response.data || response.errorType
                ? {
                    data: {
                      ...(response.data || {}),
                      ...(response.errorType
                        ? { errorType: response.errorType }
                        : {}),
                    },
                  }
                : {}),
            }),
          ]);

          if (response.responseParts) {
            toolResponseParts.push(...response.responseParts);
          }
        }

        // Record tool calls in chat history
        try {
          const currentModel =
            this._client.getCurrentSequenceModel() ?? this._config.getModel();
          this._client
            .getChat()
            .recordCompletedToolCalls(currentModel, completedToolCalls);

          await recordToolCallInteractions(this._config, completedToolCalls);
        } catch (error) {
          debugLogger.error(
            `Error recording completed tool call information: ${error}`,
          );
        }

        // Check if a tool requested stop execution
        const stopTool = completedToolCalls.find(
          (tc) => tc.response.errorType === ToolErrorType.STOP_EXECUTION,
        );
        if (stopTool) {
          this.ensureStreamEnd();
          this._streamDone = true;
          return;
        }

        // Check for fatal tool errors (e.g. NO_SPACE_LEFT)
        const fatalTool = completedToolCalls.find(
          (tc) => tc.response.errorType === ToolErrorType.NO_SPACE_LEFT,
        );
        if (fatalTool) {
          const msg = fatalTool.response.error?.message ?? 'Fatal tool error';
          this.appendAndNotify([
            this.makeInternalEvent('error', {
              status: 'INTERNAL',
              message: `Fatal tool error (${fatalTool.request.name}): ${msg}`,
              fatal: true,
            }),
          ]);
          this.ensureStreamEnd();
          this._streamDone = true;
          return;
        }

        // Feed tool results back for next turn
        currentParts = toolResponseParts;
      }
    } catch (err) {
      this.emitErrorAndStreamEnd(err);
      this._streamDone = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private appendAndNotify(events: AgentEvent[]): void {
    for (const event of events) {
      this._events.push(event);
    }
    if (events.length > 0) {
      this.notifySubscribers();
    }
  }

  private notifySubscribers(): void {
    for (const handler of this._subscribers) {
      handler();
    }
  }

  private ensureStreamStart(): void {
    if (!this._translationState.streamStartEmitted) {
      const startEvent = this.makeInternalEvent('stream_start', {
        streamId: this._translationState.streamId,
      });
      this._events.push(startEvent);
      this._translationState.streamStartEmitted = true;
      this.notifySubscribers();
    }
  }

  private ensureStreamEnd(): void {
    const hasStreamEnd = this._events.some((e) => e.type === 'stream_end');
    if (!hasStreamEnd && this._translationState.streamStartEmitted) {
      const endEvent = this.makeInternalEvent('stream_end', {
        streamId: this._translationState.streamId,
        reason: 'completed',
      });
      this._events.push(endEvent);
      this.notifySubscribers();
    }
  }

  private emitErrorAndStreamEnd(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);

    this.ensureStreamStart();

    const errorEvent = this.makeInternalEvent('error', {
      status: 'INTERNAL' as const,
      message,
      fatal: true,
    });
    this._events.push(errorEvent);

    const hasStreamEnd = this._events.some((e) => e.type === 'stream_end');
    if (!hasStreamEnd) {
      const endEvent = this.makeInternalEvent('stream_end', {
        streamId: this._translationState.streamId,
        reason: 'failed',
      });
      this._events.push(endEvent);
    }

    this.notifySubscribers();
  }

  private makeInternalEvent(
    type: AgentEvent['type'],
    payload: Partial<AgentEvent>,
  ): AgentEvent {
    const id = `${this._translationState.streamId}-${this._translationState.eventCounter++}`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructing AgentEvent from common fields + payload
    return {
      ...payload,
      id,
      timestamp: new Date().toISOString(),
      streamId: this._translationState.streamId,
      type,
    } as AgentEvent;
  }
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Convert AgentEvent ContentPart[] → @google/genai Part[] */
function contentPartsToGeminiParts(parts: ContentPart[]): Part[] {
  return parts.map((cp) => {
    switch (cp.type) {
      case 'text':
        return { text: cp.text };
      case 'thought':
        return { text: cp.thought };
      case 'media':
        return {
          inlineData: {
            data: cp.data ?? '',
            mimeType: cp.mimeType ?? 'application/octet-stream',
          },
        };
      case 'reference':
        return { text: cp.text };
      default:
        return { text: JSON.stringify(cp) };
    }
  });
}

/** Convert @google/genai Part[] → AgentEvent ContentPart[] */
function mapCompletedToolResponseParts(parts: Part[]): ContentPart[] {
  const result: ContentPart[] = [];
  for (const part of parts) {
    if (part.text !== undefined) {
      result.push({ type: 'text', text: part.text });
    } else if (part.inlineData) {
      result.push({
        type: 'media',
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      });
    }
  }
  return result;
}
