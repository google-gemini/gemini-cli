/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LocalSubagentProtocol — wraps LocalAgentExecutor behind the
 * AgentProtocol interface, translating SubagentActivityEvent callbacks into
 * AgentEvents and exposing the executor result via getResult().
 *
 * Pattern mirrors LegacyAgentProtocol, but the loop body runs
 * LocalAgentExecutor instead of GeminiClient.sendMessageStream().
 */

import { randomUUID } from 'node:crypto';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { AgentSession } from '../agent/agent-session.js';
import type {
  AgentProtocol,
  AgentSend,
  AgentEvent,
  StreamEndReason,
  Unsubscribe,
  ContentPart,
} from '../agent/types.js';
import { LocalAgentExecutor } from './local-executor.js';
import {
  AgentTerminateMode,
  type LocalAgentDefinition,
  type AgentInputs,
  type OutputObject,
  type SubagentActivityEvent,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAbortLikeError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function mapTerminateMode(mode: AgentTerminateMode): StreamEndReason {
  switch (mode) {
    case AgentTerminateMode.GOAL:
      return 'completed';
    case AgentTerminateMode.TIMEOUT:
      return 'max_time';
    case AgentTerminateMode.MAX_TURNS:
      return 'max_turns';
    case AgentTerminateMode.ABORTED:
      return 'aborted';
    case AgentTerminateMode.ERROR:
    case AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL:
      return 'failed';
    default: {
      void (mode satisfies never);
      return 'failed';
    }
  }
}

// ---------------------------------------------------------------------------
// LocalSubagentProtocol
// ---------------------------------------------------------------------------

class LocalSubagentProtocol implements AgentProtocol {
  private _events: AgentEvent[] = [];
  private _subscribers = new Set<(event: AgentEvent) => void>();
  private _streamId: string = randomUUID();
  private _eventCounter = 0;
  private _agentStartEmitted = false;
  private _agentEndEmitted = false;
  private _activeStreamId: string | undefined;
  private _abortController = new AbortController();

  // Result promise wiring — re-created per stream in _beginNewStream()
  private _resultResolve!: (output: OutputObject) => void;
  private _resultReject!: (err: unknown) => void;
  private _resultPromise: Promise<OutputObject> | undefined;

  // Buffered config from send({update})
  private _bufferedConfig: Record<string, unknown> = {};

  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly context: AgentLoopContext,
    // Required for API parity across protocol constructors (local, remote, legacy)
    _messageBus: MessageBus,
    private readonly _rawActivityCallback?: (
      activity: SubagentActivityEvent,
    ) => void,
  ) {}

  // ---------------------------------------------------------------------------
  // AgentProtocol interface
  // ---------------------------------------------------------------------------

  get events(): readonly AgentEvent[] {
    return this._events;
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  async send(payload: AgentSend): Promise<{ streamId: string | null }> {
    if ('update' in payload && payload.update) {
      // Buffer config for use when message send arrives
      if (payload.update.config) {
        this._bufferedConfig = {
          ...this._bufferedConfig,
          ...payload.update.config,
        };
      }
      return { streamId: null };
    }

    if ('message' in payload && payload.message) {
      if (this._activeStreamId) {
        throw new Error(
          'LocalSubagentProtocol.send() cannot be called while a stream is active.',
        );
      }

      // Extract query text from the message ContentParts
      const queryText = payload.message.content
        .filter((p): p is ContentPart & { type: 'text' } => p.type === 'text')
        .map((p) => p.text)
        .join('');

      // Only include 'query' in params when the message text is non-empty,
      // so that callers that pass all fields via update.config are not affected.
      const params: AgentInputs = {
        ...this._bufferedConfig,
        ...(queryText.length > 0 ? { query: queryText } : {}),
      };
      this._bufferedConfig = {};

      this._beginNewStream();
      const streamId = this._streamId;

      // Schedule execution in a macrotask so send() resolves before agent_start
      setTimeout(() => {
        void this._runExecutionInBackground(params);
      }, 0);

      return { streamId };
    }

    // action and elicitations are not supported
    return { streamId: null };
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  // ---------------------------------------------------------------------------
  // Protocol-specific: result access
  // ---------------------------------------------------------------------------

  /**
   * Resolves when the executor completes, with the raw OutputObject.
   * Used by LocalSubagentInvocation to build the ToolResult.
   */
  getResult(): Promise<OutputObject> {
    if (!this._resultPromise) {
      return Promise.reject(new Error('No active or completed stream'));
    }
    return this._resultPromise;
  }

  // ---------------------------------------------------------------------------
  // Core: execution
  // ---------------------------------------------------------------------------

  private _beginNewStream(): void {
    this._streamId = randomUUID();
    this._eventCounter = 0;
    this._abortController = new AbortController();
    this._agentStartEmitted = false;
    this._agentEndEmitted = false;
    this._activeStreamId = this._streamId;
    this._resultPromise = new Promise<OutputObject>((resolve, reject) => {
      this._resultResolve = resolve;
      this._resultReject = reject;
    });
  }

  private async _runExecutionInBackground(params: AgentInputs): Promise<void> {
    this._ensureAgentStart();
    try {
      await this._runExecution(params);
    } catch (err: unknown) {
      if (this._abortController.signal.aborted || isAbortLikeError(err)) {
        this._ensureAgentEnd('aborted');
        // Abort resolves with an empty result — partial output is intentionally
        // dropped since the caller requested cancellation.
        this._resultResolve({
          result: '',
          terminate_reason: AgentTerminateMode.ABORTED,
        });
      } else {
        this._emitErrorAndAgentEnd(err);
        this._resultReject(err);
      }
    } finally {
      this._clearActiveStream();
    }
  }

  private async _runExecution(params: AgentInputs): Promise<void> {
    const signal = this._abortController.signal;

    const onActivity = (activity: SubagentActivityEvent): void => {
      // Forward raw activity to invocation-level callback (for rich SubagentProgress display)
      this._rawActivityCallback?.(activity);
      this._emit(this._translateActivity(activity));
    };

    const executor = await LocalAgentExecutor.create(
      this.definition,
      this.context,
      onActivity,
    );

    const output = await executor.run(params, signal);

    if (
      output.terminate_reason === AgentTerminateMode.ABORTED ||
      signal.aborted
    ) {
      this._finishStream('aborted');
    } else {
      this._finishStream(mapTerminateMode(output.terminate_reason));
    }

    this._resultResolve(output);
  }

  // ---------------------------------------------------------------------------
  // Activity → AgentEvent translation
  // ---------------------------------------------------------------------------

  private _translateActivity(activity: SubagentActivityEvent): AgentEvent[] {
    switch (activity.type) {
      case 'THOUGHT_CHUNK': {
        const rawText = activity.data['text'];
        const text = String(rawText ?? '');
        return [
          this._makeEvent('message', {
            role: 'agent',
            content: [{ type: 'thought', thought: text }],
          }),
        ];
      }
      case 'TOOL_CALL_START': {
        const rawCallId = activity.data['callId'];
        const callId = String(rawCallId ?? randomUUID());
        const rawName = activity.data['name'];
        const name = String(rawName ?? 'unknown');
        const rawArgs = activity.data['args'];
        const args: Record<string, unknown> =
          rawArgs !== null &&
          typeof rawArgs === 'object' &&
          !Array.isArray(rawArgs)
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              (rawArgs as Record<string, unknown>)
            : {};
        return [
          this._makeEvent('tool_request', {
            requestId: callId,
            name,
            status: 'executing',
            args,
          }),
        ];
      }
      case 'TOOL_CALL_END': {
        const rawId = activity.data['id'];
        const requestId = String(rawId ?? randomUUID());
        const rawName = activity.data['name'];
        const name = String(rawName ?? 'unknown');
        const rawOutput = activity.data['output'];
        const output = String(rawOutput ?? '');
        return [
          this._makeEvent('tool_response', {
            requestId,
            name,
            status: 'succeeded',
            content: [{ type: 'text', text: output }],
          }),
        ];
      }
      case 'ERROR': {
        const rawError = activity.data['error'];
        const errorMsg = String(rawError ?? 'Unknown error');
        return [
          this._makeEvent('error', {
            status: 'INTERNAL',
            message: errorMsg,
            fatal: false,
          }),
        ];
      }
      default: {
        void (activity.type satisfies never);
        return [];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers (mirrors LegacyAgentProtocol)
  // ---------------------------------------------------------------------------

  private _emit(events: AgentEvent[]): void {
    if (events.length === 0) return;
    const subscribers = [...this._subscribers];
    for (const event of events) {
      this._events.push(event);
      if (event.type === 'agent_end') {
        this._agentEndEmitted = true;
      }
      for (const sub of subscribers) {
        sub(event);
      }
    }
  }

  private _clearActiveStream(): void {
    this._activeStreamId = undefined;
  }

  private _ensureAgentStart(): void {
    if (!this._agentStartEmitted) {
      this._agentStartEmitted = true;
      this._emit([this._makeEvent('agent_start', {})]);
    }
  }

  private _ensureAgentEnd(reason: StreamEndReason = 'completed'): void {
    if (!this._agentEndEmitted && this._agentStartEmitted) {
      this._emit([this._makeEvent('agent_end', { reason })]);
    }
  }

  private _finishStream(reason: StreamEndReason): void {
    this._ensureAgentEnd(reason);
    this._clearActiveStream();
  }

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
      this._makeEvent('error', {
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
      id: `${this._streamId}-${this._eventCounter++}`,
      timestamp: new Date().toISOString(),
      streamId: this._streamId,
    };
  }

  private _makeEvent<T extends AgentEvent['type']>(
    type: T,
    payload: Omit<AgentEvent<T>, 'id' | 'timestamp' | 'streamId' | 'type'>,
  ): AgentEvent {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      ...this._nextEventFields(),
      type,
      ...payload,
    } as AgentEvent;
  }
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export class LocalSubagentSession extends AgentSession {
  private readonly _localProtocol: LocalSubagentProtocol;

  constructor(
    definition: LocalAgentDefinition,
    context: AgentLoopContext,
    messageBus: MessageBus,
    rawActivityCallback?: (activity: SubagentActivityEvent) => void,
  ) {
    const protocol = new LocalSubagentProtocol(
      definition,
      context,
      messageBus,
      rawActivityCallback,
    );
    super(protocol);
    this._localProtocol = protocol;
  }

  /**
   * Returns the raw executor OutputObject once execution completes.
   * Used by LocalSubagentInvocation to build the ToolResult.
   */
  getResult(): Promise<OutputObject> {
    return this._localProtocol.getResult();
  }
}
