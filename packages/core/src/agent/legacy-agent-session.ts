/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LegacyAgentSession backed by the existing Gemini client +
 * scheduler loop, adapted to the merged AgentProtocol / AgentSession surface.
 */

import { GeminiEventType } from '../core/turn.js';
import type { Part } from '@google/genai';
import type { GeminiClient } from '../core/client.js';
import type { Config } from '../config/config.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import { recordToolCallInteractions } from '../code_assist/telemetry.js';
import { ToolErrorType, isFatalToolError } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  buildToolResponseData,
  contentPartsToGeminiParts,
  geminiPartsToContentParts,
  toolResultDisplayToContentParts,
} from './content-utils.js';
import { AgentSession } from './agent-session.js';
import {
  createTranslationState,
  mapFinishReason,
  translateEvent,
  type TranslationState,
} from './event-translator.js';
import type {
  AgentEvent,
  AgentProtocol,
  AgentSend,
  ContentPart,
  StreamEndReason,
  Unsubscribe,
} from './types.js';

export interface LegacySessionDeps {
  client: GeminiClient;
  scheduler: Scheduler;
  config: Config;
  promptId: string;
  streamId?: string;
}

class LegacyAgentProtocol implements AgentProtocol {
  private _events: AgentEvent[] = [];
  private _subscribers = new Set<(event: AgentEvent) => void>();
  private _translationState: TranslationState;
  private _agentEndEmitted = false;
  private _activeStreamId?: string;
  private _abortController = new AbortController();
  private _nextStreamIdOverride?: string;

  private readonly _client: GeminiClient;
  private readonly _scheduler: Scheduler;
  private readonly _config: Config;
  private readonly _promptId: string;

  constructor(deps: LegacySessionDeps) {
    this._translationState = createTranslationState(deps.streamId);
    this._nextStreamIdOverride = deps.streamId;
    this._client = deps.client;
    this._scheduler = deps.scheduler;
    this._config = deps.config;
    this._promptId = deps.promptId;
  }

  get events(): AgentEvent[] {
    return this._events;
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  async send(payload: AgentSend): Promise<{ streamId: string }> {
    const message = 'message' in payload ? payload.message : undefined;
    if (!message) {
      throw new Error(
        'LegacyAgentSession.send() only supports message sends for the moment.',
      );
    }

    if (this._activeStreamId) {
      // TODO: Interactive may eventually allow selected in-stream sends such as
      // updates or elicitation responses. Keep rejecting all concurrent sends
      // here until we define those correlation semantics.
      throw new Error(
        'LegacyAgentSession.send() cannot be called while a stream is active.',
      );
    }

    this._beginNewStream();
    const streamId = this._translationState.streamId;
    const parts = contentPartsToGeminiParts(message);
    const userMessage = this._makeInternalEvent('message', {
      role: 'user',
      content: message,
      ...(payload._meta ? { _meta: payload._meta } : {}),
    });

    this._emit([userMessage]);

    void Promise.resolve().then(async () => {
      this._ensureAgentStart();
      try {
        await this._runLoop(parts);
      } catch (err: unknown) {
        this._emitErrorAndAgentEnd(err);
        this._markStreamDone();
      }
    });

    return { streamId };
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  private async _runLoop(initialParts: Part[]): Promise<void> {
    let currentParts: Part[] = initialParts;
    let turnCount = 0;
    const maxTurns = this._config.getMaxSessionTurns();

    while (true) {
      turnCount++;
      if (maxTurns >= 0 && turnCount > maxTurns) {
        this._emit([
          this._makeInternalEvent('agent_end', {
            reason: 'max_turns',
            data: {
              code: 'MAX_TURNS_EXCEEDED',
              maxTurns,
              turnCount: turnCount - 1,
            },
          }),
        ]);
        this._markStreamDone();
        return;
      }

      const toolCallRequests: ToolCallRequestInfo[] = [];
      const responseStream = this._client.sendMessageStream(
        currentParts,
        this._abortController.signal,
        this._promptId,
      );

      for await (const event of responseStream) {
        if (this._abortController.signal.aborted) {
          this._ensureAgentEnd('aborted');
          this._markStreamDone();
          return;
        }

        if (event.type === GeminiEventType.ToolCallRequest) {
          toolCallRequests.push(event.value);
        }

        this._emit(translateEvent(event, this._translationState));

        if (event.type === GeminiEventType.Error) {
          this._ensureAgentEnd('failed');
          this._markStreamDone();
          return;
        }

        if (
          event.type === GeminiEventType.InvalidStream ||
          event.type === GeminiEventType.ContextWindowWillOverflow
        ) {
          this._ensureAgentEnd('failed');
          this._markStreamDone();
          return;
        }

        if (event.type === GeminiEventType.Finished) {
          if (toolCallRequests.length === 0) {
            this._ensureAgentEnd(mapFinishReason(event.value.reason));
            this._markStreamDone();
            return;
          }
          continue;
        }

        if (
          event.type === GeminiEventType.AgentExecutionStopped ||
          event.type === GeminiEventType.UserCancelled ||
          event.type === GeminiEventType.MaxSessionTurns
        ) {
          this._markStreamDone();
          return;
        }
      }

      if (toolCallRequests.length === 0) {
        this._ensureAgentEnd('completed');
        this._markStreamDone();
        return;
      }

      const completedToolCalls = await this._scheduler.schedule(
        toolCallRequests,
        this._abortController.signal,
      );

      const toolResponseParts: Part[] = [];
      for (const tc of completedToolCalls) {
        const response = tc.response;
        const request = tc.request;
        const content: ContentPart[] = response.error
          ? [{ type: 'text', text: response.error.message }]
          : geminiPartsToContentParts(response.responseParts);
        const displayContent = toolResultDisplayToContentParts(
          response.resultDisplay,
        );
        const data = buildToolResponseData(response);

        this._emit([
          this._makeInternalEvent('tool_response', {
            requestId: request.callId,
            name: request.name,
            content,
            isError: response.error !== undefined,
            ...(displayContent ? { displayContent } : {}),
            ...(data ? { data } : {}),
          }),
        ]);

        if (response.responseParts) {
          toolResponseParts.push(...response.responseParts);
        }
      }

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

      const stopTool = completedToolCalls.find(
        (tc) =>
          tc.response.errorType === ToolErrorType.STOP_EXECUTION &&
          tc.response.error !== undefined,
      );
      if (stopTool) {
        this._ensureAgentEnd('completed');
        this._markStreamDone();
        return;
      }

      const fatalTool = completedToolCalls.find((tc) =>
        isFatalToolError(tc.response.errorType),
      );
      if (fatalTool) {
        this._ensureAgentEnd('failed');
        this._markStreamDone();
        return;
      }

      currentParts = toolResponseParts;
    }
  }

  private _emit(events: AgentEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const subscribers = [...this._subscribers];
    for (const event of events) {
      if (!this._events.some((existing) => existing.id === event.id)) {
        this._events.push(event);
      }
      if (event.type === 'agent_end') {
        this._agentEndEmitted = true;
      }
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    }
  }

  private _markStreamDone(): void {
    this._activeStreamId = undefined;
  }

  private _beginNewStream(): void {
    this._translationState = createTranslationState(this._nextStreamIdOverride);
    this._nextStreamIdOverride = undefined;
    this._abortController = new AbortController();
    this._agentEndEmitted = false;
    this._activeStreamId = this._translationState.streamId;
  }

  private _ensureAgentStart(): void {
    if (!this._translationState.streamStartEmitted) {
      this._translationState.streamStartEmitted = true;
      this._emit([this._makeInternalEvent('agent_start', {})]);
    }
  }

  private _ensureAgentEnd(reason: StreamEndReason = 'completed'): void {
    if (!this._agentEndEmitted && this._translationState.streamStartEmitted) {
      this._agentEndEmitted = true;
      this._emit([
        this._makeInternalEvent('agent_end', {
          reason,
        }),
      ]);
    }
  }

  /**
   * Preserve error identity fields in _meta so downstream consumers can
   * reconstruct fatal CLI errors.
   */
  private _emitErrorAndAgentEnd(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);

    this._ensureAgentStart();

    const meta: Record<string, unknown> = {};
    if (err instanceof Error) {
      meta['errorName'] = err.constructor.name;
      if ('exitCode' in err && typeof err.exitCode === 'number') {
        meta['exitCode'] = err.exitCode;
      }
      if ('code' in err) {
        meta['code'] = err.code;
      }
    }

    this._emit([
      this._makeInternalEvent('error', {
        status: 'INTERNAL',
        message,
        fatal: true,
        ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
      }),
    ]);

    this._ensureAgentEnd('failed');
  }

  private _makeInternalEvent<T extends AgentEvent['type']>(
    type: T,
    payload: Omit<
      Partial<AgentEvent<T>>,
      'id' | 'timestamp' | 'streamId' | 'type'
    >,
  ): AgentEvent<T> {
    const id = `${this._translationState.streamId}-${this._translationState.eventCounter++}`;
    return {
      ...payload,
      id,
      timestamp: new Date().toISOString(),
      streamId: this._translationState.streamId,
      type,
    };
  }
}

export class LegacyAgentSession extends AgentSession {
  constructor(deps: LegacySessionDeps) {
    super(new LegacyAgentProtocol(deps));
  }
}
