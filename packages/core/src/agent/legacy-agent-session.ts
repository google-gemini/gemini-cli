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
import type { Part, FinishReason } from '@google/genai';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GeminiClient } from '../core/client.js';
import type { Config } from '../config/config.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { recordToolCallInteractions } from '../code_assist/telemetry.js';
import { ToolErrorType, isFatalToolError } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { EditorType } from '../utils/editor.js';
import {
  buildToolResponseData,
  contentPartsToGeminiParts,
  geminiPartsToContentParts,
} from './content-utils.js';
import { populateToolDisplay } from './tool-display-utils.js';
import {
  detectTopLevelPrincipleViolation,
  TopLevelPrincipleViolationError,
} from './top-level-principle-validator.js';
import { partToString } from '../utils/partUtils.js';
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

function isAbortLikeError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export interface LegacyAgentSessionDeps {
  config: Config;
  client?: GeminiClient;
  scheduler?: Scheduler;
  promptId?: string;
  streamId?: string;
  getPreferredEditor?: () => EditorType | undefined;
}

const schedulerMap = new WeakMap<Config, Scheduler>();

export class LegacyAgentProtocol implements AgentProtocol {
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

  constructor(deps: LegacyAgentSessionDeps) {
    this._translationState = createTranslationState(deps.streamId);
    this._nextStreamIdOverride = deps.streamId;
    this._config = deps.config;
    this._client = deps.client ?? deps.config.getGeminiClient();
    this._promptId = deps.promptId ?? deps.config.promptId ?? '';
    if (deps.scheduler) {
      this._scheduler = deps.scheduler;
    } else {
      let scheduler = schedulerMap.get(deps.config);
      if (!scheduler) {
        const sessionId = deps.config.getSessionId();
        const schedulerId = `legacy-agent-scheduler-${sessionId}`;
        scheduler = new Scheduler({
          context: deps.config,
          schedulerId,
          getPreferredEditor: deps.getPreferredEditor ?? (() => undefined),
        });
        schedulerMap.set(deps.config, scheduler);
      }
      this._scheduler = scheduler;
    }
  }

  get events(): readonly AgentEvent[] {
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
    const parts = contentPartsToGeminiParts(message.content);
    const userMessage = this._makeUserMessageEvent(
      message.content,
      message.displayContent,
      payload._meta,
    );

    this._emit([userMessage]);

    this._scheduleRunLoop(parts, message.displayContent);

    return { streamId };
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  private _scheduleRunLoop(
    initialParts: Part[],
    displayContent?: string,
  ): void {
    // Use a macrotask so send() resolves with the streamId before agent_start
    // is emitted and consumers can attach to the stream without racing startup.
    setTimeout(() => {
      void this._runLoopInBackground(initialParts, displayContent);
    }, 0);
  }

  private async _runLoopInBackground(
    initialParts: Part[],
    displayContent?: string,
  ): Promise<void> {
    this._ensureAgentStart();
    try {
      await this._runLoop(initialParts, displayContent);
    } catch (err: unknown) {
      if (err instanceof TopLevelPrincipleViolationError) {
        if (!this._config.isInteractive()) {
          // eslint-disable-next-line no-console
          console.error(
            `\n======================================================================\n` +
              `[FATAL ERROR] Top-level Principle Violation detected in non-interactive (-p) mode!\n` +
              `The agent attempted to deny a user-provided fact or assumption, which is strictly prohibited by MEMORY.md.\n` +
              `Error details: ${err.message}\n` +
              `======================================================================\n`,
          );
          this._ensureAgentEnd('failed');
          process.exit(1);
        } else {
          this._emitErrorAndAgentEnd(err);
        }
      } else if (
        this._abortController.signal.aborted ||
        isAbortLikeError(err)
      ) {
        this._ensureAgentEnd('aborted');
      } else {
        this._emitErrorAndAgentEnd(err);
      }
    } finally {
      this._clearActiveStream();
    }
  }

  private async _runLoop(
    initialParts: Part[],
    initialDisplayContent?: string,
  ): Promise<void> {
    let currentParts: Part[] = initialParts;
    let currentDisplayContent = initialDisplayContent;
    let turnCount = 0;
    const maxTurns = this._config.getMaxSessionTurns();
    let isAfterToolResponse = false;

    while (true) {
      turnCount++;
      if (maxTurns >= 0 && turnCount > maxTurns) {
        this._finishStream('max_turns', {
          code: 'MAX_TURNS_EXCEEDED',
          maxTurns,
          turnCount: turnCount - 1,
        });
        return;
      }

      let toolCallRequests: ToolCallRequestInfo[] = [];
      let finishedReason: FinishReason | undefined = undefined;
      let hasVisibleText = false;
      let responseText = '';

      // --- 【最上位原則・自動リトライ制御】 ---
      let attempt = 0;
      const maxAttempts = 3;
      let violated = false;

      while (attempt < maxAttempts) {
        attempt++;
        violated = false;
        responseText = '';
        toolCallRequests = [];
        finishedReason = undefined;
        hasVisibleText = false;

        let partsForAttempt = currentParts;
        if (attempt > 1) {
          partsForAttempt = [
            {
              text: `[SYSTEM COMMAND - DO NOT IGNORE] Your previous response was detected as a violation of the Top-level Principle in MEMORY.md.
You MUST treat all facts, settings, model names, and statements provided by the user as absolute 100% correct facts.
Under NO circumstances are you allowed to doubt them, state they do not exist, or claim they are wrong.
Rewrite your response completely to accept the user's premise as absolute truth and avoid any negative reasoning.`,
            },
            ...currentParts,
          ];
        }

        const responseStream = this._client.sendMessageStream(
          partsForAttempt,
          this._abortController.signal,
          this._promptId,
          undefined,
          currentDisplayContent,
        );

        for await (const event of responseStream) {
          if (this._abortController.signal.aborted) {
            this._finishStream('aborted');
            return;
          }

          if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
          }

          if (event.type === GeminiEventType.Content) {
            if (typeof event.value === 'string' && event.value.trim() !== '') {
              hasVisibleText = true;
              responseText += event.value;
            }
          }

          this._emit(translateEvent(event, this._translationState));

          switch (event.type) {
            case GeminiEventType.Error:
            case GeminiEventType.InvalidStream:
            case GeminiEventType.ContextWindowWillOverflow:
              this._finishStream('failed');
              return;
            case GeminiEventType.Finished:
              finishedReason = event.value.reason;
              break;
            case GeminiEventType.AgentExecutionStopped:
            case GeminiEventType.UserCancelled:
            case GeminiEventType.MaxSessionTurns:
              this._clearActiveStream();
              return;
            default:
              break;
          }
        }

        if (this._abortController.signal.aborted) {
          this._finishStream('aborted');
          return;
        }

        // Validate the response against the Top-level Principle only if enabled.
        const guardEnabled = process.env['GEMINI_TOP_LEVEL_GUARD'] !== 'false';
        if (
          guardEnabled &&
          toolCallRequests.length === 0 &&
          responseText.trim().length > 0
        ) {
          const userQuery =
            initialDisplayContent ||
            initialParts.map((part) => partToString(part)).join('\n');

          let traceLogPath: string | undefined;
          try {
            const targetDir = this._config.storage.getProjectTempDir();
            const sessionId = this._config.getSessionId();
            const traceDir = path.join(targetDir, 'context_trace', sessionId);
            fs.mkdirSync(traceDir, { recursive: true });
            traceLogPath = path.join(traceDir, 'trace.log');
          } catch {
            // fail-safe
          }

          const isViolation = await detectTopLevelPrincipleViolation(
            this._client,
            userQuery,
            responseText,
            this._abortController.signal,
            this._promptId,
            traceLogPath,
          );

          if (isViolation) {
            if (!this._config.isInteractive()) {
              throw new TopLevelPrincipleViolationError(
                `Top-level Principle Violation: Doubting user facts/settings is forbidden.\nUser Query: ${userQuery}\nAgent Output: ${responseText}`,
              );
            }

            // eslint-disable-next-line no-console
            console.warn(
              `\n[WARNING] Top-level Principle Violation detected (Attempt ${attempt}/${maxAttempts}). Rewriting response...\n`,
            );
            violated = true;
            continue;
          }
        }

        break;
      }

      if (violated && attempt >= maxAttempts) {
        throw new TopLevelPrincipleViolationError(
          `Top-level Principle Violation: Failed to generate a response complying with the Top-level Principle after ${maxAttempts} attempts.\nResponse: ${responseText}`,
        );
      }

      currentDisplayContent = undefined;

      if (toolCallRequests.length === 0) {
        if (isAfterToolResponse && !hasVisibleText) {
          const nudgeMessage =
            '[System: You successfully executed a tool but returned an empty response. Please analyze the tool output and explain your progress or final answer.]';

          currentParts = [{ text: nudgeMessage }];
          isAfterToolResponse = false;
          continue;
        }

        if (finishedReason !== undefined) {
          this._finishStream(mapFinishReason(finishedReason));
        } else {
          this._finishStream('completed');
        }
        return;
      }

      const completedToolCalls = await this._scheduler.schedule(
        toolCallRequests,
        this._abortController.signal,
      );

      if (this._abortController.signal.aborted) {
        this._finishStream('aborted');
        return;
      }

      const toolResponseParts: Part[] = [];
      for (const tc of completedToolCalls) {
        const response = tc.response;
        const request = tc.request;
        const content: ContentPart[] = response.error
          ? [{ type: 'text', text: response.error.message }]
          : geminiPartsToContentParts(response.responseParts);
        const display = populateToolDisplay({
          name: request.name,
          invocation: 'invocation' in tc ? tc.invocation : undefined,
          resultDisplay: response.resultDisplay,
          displayName: 'tool' in tc ? tc.tool?.displayName : undefined,
          display: response.display,
        });
        const data = buildToolResponseData(response);

        this._emit([
          this._makeToolResponseEvent({
            requestId: request.callId,
            name: request.name,
            content,
            isError: response.error !== undefined,
            ...(display ? { display } : {}),
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
        this._finishStream('completed');
        return;
      }

      const fatalTool = completedToolCalls.find((tc) =>
        isFatalToolError(tc.response.errorType),
      );
      if (fatalTool) {
        this._finishStream('failed');
        return;
      }

      currentParts = toolResponseParts;
      isAfterToolResponse = completedToolCalls.length > 0;
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

  private _clearActiveStream(): void {
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
      this._emit([this._makeAgentStartEvent()]);
    }
  }

  private _ensureAgentEnd(reason: StreamEndReason = 'completed'): void {
    if (!this._agentEndEmitted && this._translationState.streamStartEmitted) {
      this._agentEndEmitted = true;
      this._emit([this._makeAgentEndEvent(reason)]);
    }
  }

  private _finishStream(
    reason: StreamEndReason,
    data?: Record<string, unknown>,
  ): void {
    if (data && !this._agentEndEmitted) {
      this._emit([this._makeAgentEndEvent(reason, data)]);
    } else {
      this._ensureAgentEnd(reason);
    }
    this._clearActiveStream();
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
      meta['stack'] = err.stack;
      if ('exitCode' in err && typeof err.exitCode === 'number') {
        meta['exitCode'] = err.exitCode;
      }
      if ('code' in err) {
        meta['code'] = err.code;
      }
      if ('status' in err) {
        meta['status'] = err.status;
      }
    }

    this._emit([
      this._makeErrorEvent({
        status: 'INTERNAL',
        message,
        fatal: true,
        ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
      }),
    ]);

    this._ensureAgentEnd('failed');
  }

  private _nextEventFields() {
    return {
      id: `${this._translationState.streamId}-${this._translationState.eventCounter++}`,
      timestamp: new Date().toISOString(),
      streamId: this._translationState.streamId,
    };
  }

  private _makeUserMessageEvent(
    content: ContentPart[],
    displayContent?: string,
    meta?: Record<string, unknown>,
  ): AgentEvent<'message'> {
    const eventContent: ContentPart[] = displayContent
      ? [{ type: 'text', text: displayContent }]
      : content;
    const event = {
      ...this._nextEventFields(),
      type: 'message',
      role: 'user',
      content: eventContent,
      ...(meta ? { _meta: meta } : {}),
    } satisfies AgentEvent<'message'>;
    return event;
  }

  private _makeToolResponseEvent(
    payload: Omit<
      AgentEvent<'tool_response'>,
      'id' | 'timestamp' | 'streamId' | 'type'
    >,
  ): AgentEvent<'tool_response'> {
    const event = {
      ...this._nextEventFields(),
      type: 'tool_response',
      ...payload,
    } satisfies AgentEvent<'tool_response'>;
    return event;
  }

  private _makeAgentStartEvent(): AgentEvent<'agent_start'> {
    const event = {
      ...this._nextEventFields(),
      type: 'agent_start',
    } satisfies AgentEvent<'agent_start'>;
    return event;
  }

  private _makeAgentEndEvent(
    reason: StreamEndReason,
    data?: Record<string, unknown>,
  ): AgentEvent<'agent_end'> {
    const event = {
      ...this._nextEventFields(),
      type: 'agent_end',
      reason,
      ...(data ? { data } : {}),
    } satisfies AgentEvent<'agent_end'>;
    return event;
  }

  private _makeErrorEvent(
    payload: Omit<
      AgentEvent<'error'>,
      'id' | 'timestamp' | 'streamId' | 'type'
    >,
  ): AgentEvent<'error'> {
    const event = {
      ...this._nextEventFields(),
      type: 'error',
      ...payload,
    } satisfies AgentEvent<'error'>;
    return event;
  }
}

export class LegacyAgentSession extends AgentSession {
  constructor(deps: LegacyAgentSessionDeps) {
    super(new LegacyAgentProtocol(deps));
  }
}
