/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentProtocol,
  AgentSend,
  AgentEvent,
  Unsubscribe,
} from './types.js';

/**
 * AgentSession is a wrapper around AgentProtocol that provides a more
 * convenient API for consuming agent activity as an AsyncIterable.
 */
export class AgentSession implements AgentProtocol {
  private _protocol: AgentProtocol;

  constructor(protocol: AgentProtocol) {
    this._protocol = protocol;
  }

  async send(payload: AgentSend): Promise<{ streamId: string | null }> {
    return this._protocol.send(payload);
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    return this._protocol.subscribe(callback);
  }

  async abort(): Promise<void> {
    return this._protocol.abort();
  }

  get events(): AgentEvent[] {
    return this._protocol.events;
  }

  /**
   * Sends a payload to the agent and returns an AsyncIterable that yields
   * events for the resulting stream.
   *
   * @param payload The payload to send to the agent.
   */
  async *sendStream(payload: AgentSend): AsyncIterable<AgentEvent> {
    const result = await this._protocol.send(payload);
    const streamId = result.streamId;

    if (streamId === null) {
      return;
    }

    yield* this.stream({ streamId });
  }

  /**
   * Returns an AsyncIterable that yields events from the agent session,
   * optionally replaying events from history or reattaching to an existing stream.
   *
   * @param options Options for replaying or reattaching to the event stream.
   */
  async *stream(
    options: {
      eventId?: string;
      streamId?: string;
    } = {},
  ): AsyncIterable<AgentEvent> {
    let resolve: (() => void) | undefined;
    let next = new Promise<void>((res) => {
      resolve = res;
    });

    let eventQueue: AgentEvent[] = [];
    const earlyEvents: AgentEvent[] = [];
    let done = false;
    let trackedStreamId = options.streamId;
    let started = false;

    // 1. Subscribe early to avoid missing any events that occur during replay setup
    const unsubscribe = this._protocol.subscribe((event) => {
      if (done) return;

      if (!started) {
        earlyEvents.push(event);
        return;
      }

      if (trackedStreamId && event.streamId !== trackedStreamId) return;

      // If we don't have a tracked stream yet, the first agent_start we see becomes it.
      if (!trackedStreamId && event.type === 'agent_start') {
        trackedStreamId = event.streamId ?? undefined;
      }

      // If we still don't have a tracked stream and we aren't replaying everything (eventId), ignore.
      if (!trackedStreamId && !options.eventId) return;

      eventQueue.push(event);
      if (
        event.type === 'agent_end' &&
        event.streamId === (trackedStreamId ?? null)
      ) {
        done = true;
      }

      const currentResolve = resolve;
      next = new Promise<void>((r) => {
        resolve = r;
      });
      currentResolve?.();
    });

    try {
      const currentEvents = this._protocol.events;
      let replayStartIndex = -1;

      if (options.eventId) {
        const index = currentEvents.findIndex((e) => e.id === options.eventId);
        if (index !== -1) {
          replayStartIndex = index + 1;
        }
      } else if (options.streamId) {
        const index = currentEvents.findIndex(
          (e) => e.type === 'agent_start' && e.streamId === options.streamId,
        );
        if (index !== -1) {
          replayStartIndex = index;
        }
      }

      if (replayStartIndex !== -1) {
        for (let i = replayStartIndex; i < currentEvents.length; i++) {
          const event = currentEvents[i];
          if (options.streamId && event.streamId !== options.streamId) continue;

          eventQueue.push(event);
          if (event.type === 'agent_start' && !trackedStreamId) {
            trackedStreamId = event.streamId ?? undefined;
          }
          if (
            event.type === 'agent_end' &&
            event.streamId === (trackedStreamId ?? null)
          ) {
            done = true;
            break;
          }
        }
      }

      if (!done && !trackedStreamId) {
        // Find active stream in history
        const activeStarts = currentEvents.filter(
          (e) => e.type === 'agent_start',
        );
        for (let i = activeStarts.length - 1; i >= 0; i--) {
          const start = activeStarts[i];
          if (
            !currentEvents.some(
              (e) => e.type === 'agent_end' && e.streamId === start.streamId,
            )
          ) {
            trackedStreamId = start.streamId ?? undefined;
            break;
          }
        }
      }

      // If we replayed to the end and no stream is active, and we were specifically
      // replaying from an eventId (or we've already finished the stream we were looking for), we are done.
      if (!done && !trackedStreamId && options.eventId) {
        done = true;
      }

      started = true;

      // Process events that arrived while we were replaying
      for (const event of earlyEvents) {
        if (done) break;
        if (trackedStreamId && event.streamId !== trackedStreamId) continue;
        if (!trackedStreamId && event.type === 'agent_start') {
          trackedStreamId = event.streamId ?? undefined;
        }
        if (!trackedStreamId && !options.eventId) continue;

        eventQueue.push(event);
        if (
          event.type === 'agent_end' &&
          event.streamId === (trackedStreamId ?? null)
        ) {
          done = true;
        }
      }

      while (true) {
        if (eventQueue.length > 0) {
          const eventsToYield = eventQueue;
          eventQueue = [];
          for (const event of eventsToYield) {
            yield event;
          }
        }

        if (done) break;
        await next;
      }
    } finally {
      unsubscribe();
    }
  }
}
