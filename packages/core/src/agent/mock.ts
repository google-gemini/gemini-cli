/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentEvent, AgentSend, AgentSession } from './types.js';

/**
 * A mock implementation of AgentSession for testing.
 * Allows queuing responses that will be yielded when send() is called.
 */
export class MockAgentSession implements AgentSession {
  private _events: AgentEvent[] = [];
  private _responses: Array<Array<Partial<AgentEvent> & { type: string }>> = [];
  private _streams = new Map<string, AgentEvent[]>();
  private _activeStreamIds = new Set<string>();
  private _lastStreamId?: string;
  private _nextEventId = 1;

  title?: string;
  model?: string;
  config?: Record<string, unknown>;

  constructor(initialEvents: AgentEvent[] = []) {
    this._events = [...initialEvents];
  }

  /**
   * All events that have occurred in this session so far.
   */
  get events(): AgentEvent[] {
    return this._events;
  }

  /**
   * Queues a sequence of events to be "emitted" by the agent in response to the
   * next send() call.
   */
  pushResponse(events: Array<Partial<AgentEvent> & { type: string }>) {
    // We store them as partials and normalize them when send() is called
    this._responses.push(events);
  }

  async send(payload: AgentSend): Promise<{ streamId: string }> {
    const response = this._responses.shift() ?? [];
    const streamId =
      response[0]?.streamId ?? `mock-stream-${this._streams.size + 1}`;

    const now = new Date().toISOString();

    if (!response.some((e) => e.type === 'stream_start')) {
      response.unshift({
        type: 'stream_start',
        streamId,
      });
    }

    const startIndex = response.findIndex((e) => e.type === 'stream_start');

    if ('message' in payload && payload.message) {
      response.splice(startIndex + 1, 0, {
        type: 'message',
        role: 'user',
        content: payload.message,
        _meta: payload._meta,
      } as Partial<AgentEvent>);
    } else if ('elicitations' in payload && payload.elicitations) {
      payload.elicitations.forEach((elicitation, i) => {
        response.splice(startIndex + 1 + i, 0, {
          type: 'elicitation_response',
          ...elicitation,
          _meta: payload._meta,
        } as Partial<AgentEvent>);
      });
    } else if ('update' in payload && payload.update) {
      if (payload.update.title) this.title = payload.update.title;
      if (payload.update.model) this.model = payload.update.model;
      if (payload.update.config) {
        this.config = payload.update.config;
      }
      response.splice(startIndex + 1, 0, {
        type: 'session_update',
        ...payload.update,
        _meta: payload._meta,
      } as Partial<AgentEvent>);
    } else if ('action' in payload && payload.action) {
      throw new Error(
        `Actions not supported in MockAgentSession: ${payload.action.type}`,
      );
    }

    if (!response.some((e) => e.type === 'stream_end')) {
      response.push({
        type: 'stream_end',
        reason: 'completed',
        streamId,
      });
    }

    const normalizedResponse = response.map((e) => {
      const event = {
        ...e,
        id: e.id ?? `e-${this._nextEventId++}`,
        timestamp: e.timestamp ?? now,
        streamId: e.streamId ?? streamId,
      } as AgentEvent;
      return event;
    });

    this._streams.set(streamId, normalizedResponse);
    this._activeStreamIds.add(streamId);
    this._lastStreamId = streamId;

    return { streamId };
  }

  async *stream(options?: {
    streamId?: string;
    eventId?: string;
  }): AsyncIterableIterator<AgentEvent> {
    let streamId = options?.streamId;

    if (options?.eventId) {
      const event = this._events.find((e) => e.id === options.eventId);
      if (!event) {
        throw new Error(`Event not found: ${options.eventId}`);
      }
      streamId = streamId ?? event.streamId;
    }

    streamId = streamId ?? this._lastStreamId;

    if (!streamId) {
      return;
    }

    const events = this._streams.get(streamId);
    if (!events) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    let startAt = 0;
    if (options?.eventId) {
      const idx = events.findIndex((e) => e.id === options.eventId);
      if (idx !== -1) {
        startAt = idx + 1;
      } else {
        // This should theoretically not happen if the event was found in this._events
        // but the trajectories match.
        throw new Error(
          `Event ${options.eventId} not found in stream ${streamId}`,
        );
      }
    }

    for (let i = startAt; i < events.length; i++) {
      if (!this._activeStreamIds.has(streamId)) {
        break;
      }

      const event = events[i];
      // Add to session trajectory if not already present
      if (!this._events.some((e) => e.id === event.id)) {
        this._events.push(event);
      }
      yield event;
    }
  }

  async abort(options?: { streamId?: string }): Promise<void> {
    const streamId = options?.streamId ?? this._lastStreamId;

    if (options?.streamId && !this._activeStreamIds.has(options.streamId)) {
      throw new Error(`Stream not active: ${options.streamId}`);
    }

    if (streamId) {
      this._activeStreamIds.delete(streamId);
      if (this._lastStreamId === streamId) {
        this._lastStreamId = undefined;
      }
    }
  }
}
