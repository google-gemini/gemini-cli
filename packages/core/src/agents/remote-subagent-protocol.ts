/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview RemoteSubagentProtocol — wraps A2A remote agent streaming
 * behind the AgentProtocol interface.
 *
 * Pattern mirrors LocalSubagentProtocol and LegacyAgentProtocol, but the loop
 * body drives A2AClientManager instead of LocalAgentExecutor.
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
import type { ToolResult } from '../tools/tools.js';
import {
  DEFAULT_QUERY_STRING,
  type RemoteAgentDefinition,
  type SubagentProgress,
  getRemoteAgentTargetUrl,
  getAgentCardLoadOptions,
} from './types.js';
import { A2AResultReassembler, extractIdsFromResponse } from './a2aUtils.js';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { A2AAuthProviderFactory } from './auth-provider/factory.js';
import { A2AAgentError } from './a2a-errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAbortLikeError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

// ---------------------------------------------------------------------------
// RemoteSubagentProtocol
// ---------------------------------------------------------------------------

class RemoteSubagentProtocol implements AgentProtocol {
  private _events: AgentEvent[] = [];
  private _subscribers = new Set<(event: AgentEvent) => void>();
  private _streamId: string = randomUUID();
  private _eventCounter = 0;
  private _agentStartEmitted = false;
  private _agentEndEmitted = false;
  private _activeStreamId: string | undefined;
  private _abortController = new AbortController();

  // Session state persisted across sends (mirrors RemoteAgentInvocation)
  private contextId: string | undefined;
  private taskId: string | undefined;
  private authHandler: AuthenticationHandler | undefined;

  // Agent display name (for SubagentProgress construction)
  private readonly _agentName: string;

  // Latest SubagentProgress — updated per chunk, used for error recovery
  private _latestProgress: SubagentProgress | undefined;

  // Result promise wiring
  private _resultResolve!: (result: ToolResult) => void;
  private _resultReject!: (err: unknown) => void;
  private readonly _resultPromise: Promise<ToolResult>;

  constructor(
    private readonly definition: RemoteAgentDefinition,
    private readonly context: AgentLoopContext,
    _messageBus: MessageBus,
  ) {
    this._agentName = definition.displayName ?? definition.name;
    this._resultPromise = new Promise<ToolResult>((resolve, reject) => {
      this._resultResolve = resolve;
      this._resultReject = reject;
    });

    // Restore persisted session state (mirrors static map in RemoteAgentInvocation)
    const priorState = RemoteSubagentProtocol._sessionState.get(
      definition.name,
    );
    if (priorState) {
      this.contextId = priorState.contextId;
      this.taskId = priorState.taskId;
    }
  }

  // Per-agent session state, mirrors RemoteAgentInvocation.sessionState
  private static readonly _sessionState = new Map<
    string,
    { contextId?: string; taskId?: string }
  >();

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
    if ('message' in payload && payload.message) {
      if (this._activeStreamId) {
        throw new Error(
          'RemoteSubagentProtocol.send() cannot be called while a stream is active.',
        );
      }

      const query =
        payload.message
          .filter((p): p is ContentPart & { type: 'text' } => p.type === 'text')
          .map((p) => p.text)
          .join('') || DEFAULT_QUERY_STRING;

      this._beginNewStream();
      const streamId = this._streamId;

      setTimeout(() => {
        void this._runStreamInBackground(query);
      }, 0);

      return { streamId };
    }

    // update/action/elicitations not used for remote agents
    return { streamId: null };
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  // ---------------------------------------------------------------------------
  // Protocol-specific: result access
  // ---------------------------------------------------------------------------

  getResult(): Promise<ToolResult> {
    return this._resultPromise;
  }

  getLatestProgress(): SubagentProgress | undefined {
    return this._latestProgress;
  }

  // ---------------------------------------------------------------------------
  // Core: A2A streaming
  // ---------------------------------------------------------------------------

  private _beginNewStream(): void {
    this._streamId = randomUUID();
    this._eventCounter = 0;
    this._abortController = new AbortController();
    this._agentStartEmitted = false;
    this._agentEndEmitted = false;
    this._activeStreamId = this._streamId;
  }

  private async _runStreamInBackground(query: string): Promise<void> {
    this._ensureAgentStart();
    try {
      await this._runStream(query);
    } catch (err: unknown) {
      if (this._abortController.signal.aborted || isAbortLikeError(err)) {
        this._ensureAgentEnd('aborted');
        this._resultReject(err);
      } else {
        this._emitErrorAndAgentEnd(err);
        this._resultReject(err);
      }
      this._clearActiveStream();
    } finally {
      RemoteSubagentProtocol._sessionState.set(this.definition.name, {
        contextId: this.contextId,
        taskId: this.taskId,
      });
    }
  }

  private async _runStream(query: string): Promise<void> {
    const clientManager = this.context.config.getA2AClientManager();
    if (!clientManager) {
      throw new Error(
        `RemoteSubagentProtocol: A2AClientManager not available for '${this.definition.name}'.`,
      );
    }

    const authHandler = await this._getAuthHandler();
    if (!clientManager.getClient(this.definition.name)) {
      await clientManager.loadAgent(
        this.definition.name,
        getAgentCardLoadOptions(this.definition),
        authHandler,
      );
    }

    const reassembler = new A2AResultReassembler();
    let prevText = '';

    const stream = clientManager.sendMessageStream(
      this.definition.name,
      query,
      {
        contextId: this.contextId,
        taskId: this.taskId,
        signal: this._abortController.signal,
      },
    );

    for await (const chunk of stream) {
      if (this._abortController.signal.aborted) {
        this._finishStream('aborted');
        this._resultReject(new Error('Operation aborted'));
        this._clearActiveStream();
        return;
      }

      reassembler.update(chunk);

      const {
        contextId: newContextId,
        taskId: newTaskId,
        clearTaskId,
      } = extractIdsFromResponse(chunk);
      if (newContextId) this.contextId = newContextId;
      this.taskId = clearTaskId ? undefined : (newTaskId ?? this.taskId);

      // Update latest progress snapshot (for invocation's error recovery)
      this._latestProgress = {
        isSubagentProgress: true,
        agentName: this._agentName,
        state: 'running',
        recentActivity: reassembler.toActivityItems(),
        result: reassembler.toString(),
      };

      // Emit delta as a message event
      const currentText = reassembler.toString();
      const delta = currentText.slice(prevText.length);
      if (delta) {
        this._emit([
          this._makeEvent('message', {
            role: 'agent',
            content: [{ type: 'text', text: currentText }],
          }),
        ]);
        prevText = currentText;
      }
    }

    const finalOutput = reassembler.toString();
    debugLogger.debug(
      `[RemoteSubagentProtocol] ${this.definition.name} finished, output length: ${finalOutput.length}`,
    );

    const finalProgress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: this._agentName,
      state: 'completed',
      result: finalOutput,
      recentActivity: reassembler.toActivityItems(),
    };
    this._latestProgress = finalProgress;

    this._finishStream('completed');

    this._resultResolve({
      llmContent: [{ text: finalOutput }],
      returnDisplay: finalProgress,
    });
  }

  private async _getAuthHandler(): Promise<AuthenticationHandler | undefined> {
    if (this.authHandler) return this.authHandler;
    if (!this.definition.auth) return undefined;

    const targetUrl = getRemoteAgentTargetUrl(this.definition);
    const provider = await A2AAuthProviderFactory.create({
      authConfig: this.definition.auth,
      agentName: this.definition.name,
      targetUrl,
      agentCardUrl: this.definition.agentCardUrl,
    });
    if (!provider) {
      throw new Error(
        `Failed to create auth provider for agent '${this.definition.name}'`,
      );
    }
    this.authHandler = provider;
    return this.authHandler;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
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

  private _finishStream(
    reason: StreamEndReason,
    data?: Record<string, unknown>,
  ): void {
    if (data && !this._agentEndEmitted) {
      this._emit([this._makeEvent('agent_end', { reason, data })]);
      this._agentEndEmitted = true;
    } else {
      this._ensureAgentEnd(reason);
    }
    this._clearActiveStream();
  }

  private _emitErrorAndAgentEnd(err: unknown): void {
    const message = this._formatError(err);
    this._ensureAgentStart();

    const meta: Record<string, unknown> = {};
    if (err instanceof Error) {
      meta['errorName'] = err.constructor.name;
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

  private _formatError(error: unknown): string {
    if (error instanceof A2AAgentError) {
      return error.userMessage;
    }
    return `Error calling remote agent: ${error instanceof Error ? error.message : String(error)}`;
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

export class RemoteSubagentSession extends AgentSession {
  private readonly _remoteProtocol: RemoteSubagentProtocol;

  constructor(
    definition: RemoteAgentDefinition,
    context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    const protocol = new RemoteSubagentProtocol(
      definition,
      context,
      messageBus,
    );
    super(protocol);
    this._remoteProtocol = protocol;
  }

  /**
   * Returns the ToolResult once the remote agent stream completes.
   * Used by RemoteAgentInvocation to return the result.
   */
  getResult(): Promise<ToolResult> {
    return this._remoteProtocol.getResult();
  }

  /**
   * Returns the most recent SubagentProgress snapshot, updated per streaming
   * chunk. Useful for constructing error progress when getResult() rejects.
   */
  getLatestProgress(): SubagentProgress | undefined {
    return this._remoteProtocol.getLatestProgress();
  }

  /**
   * Convenience: start execution with a query string.
   * Equivalent to send({message: [{type:'text', text: query}]}).
   */
  async startWithQuery(query: string): Promise<{ streamId: string | null }> {
    return this.send({ message: [{ type: 'text', text: query }] });
  }
}
