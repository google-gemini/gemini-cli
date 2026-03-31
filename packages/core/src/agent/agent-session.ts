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

  get events(): readonly AgentEvent[] {
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
    let agentActivityStarted = false;

    const queueVisibleEvent = (event: AgentEvent): void => {
      if (trackedStreamId && event.streamId !== trackedStreamId) {
        return;
      }

      if (!agentActivityStarted) {
        if (event.type !== 'agent_start') {
          return;
        }
        trackedStreamId = event.streamId;
        agentActivityStarted = true;
      }

      if (!trackedStreamId) {
        return;
      }

      eventQueue.push(event);
      if (event.type === 'agent_end' && event.streamId === trackedStreamId) {
        done = true;
      }
    };

    // 1. Subscribe early to avoid missing any events that occur during replay setup
    const unsubscribe = this._protocol.subscribe((event) => {
      if (done) return;

      if (!started) {
        earlyEvents.push(event);
        return;
      }

      queueVisibleEvent(event);

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
        if (index === -1) {
          throw new Error(`Unknown eventId: ${options.eventId}`);
        }

        const resumeEvent = currentEvents[index];
        trackedStreamId = resumeEvent.streamId;
        const firstAgentStartIndex = currentEvents.findIndex(
          (event) =>
            event.type === 'agent_start' && event.streamId === trackedStreamId,
        );

        if (resumeEvent.type === 'agent_end') {
          replayStartIndex = index + 1;
          agentActivityStarted = true;
          done = true;
        } else if (
          firstAgentStartIndex !== -1 &&
          firstAgentStartIndex <= index
        ) {
          replayStartIndex = index + 1;
          agentActivityStarted = true;
        } else if (firstAgentStartIndex !== -1) {
          // A pre-agent_start cursor can be resumed once the corresponding
          // agent activity is already present in history. Because stream()
          // yields only agent_start -> agent_end, replay begins at agent_start
          // rather than at the original pre-start event.
          replayStartIndex = firstAgentStartIndex;
        } else {
          // Consumers can only resume by eventId once the corresponding stream
          // has entered the agent_start -> agent_end lifecycle in history.
          // Without a recorded agent_start, this wrapper cannot distinguish
          // "agent activity may start later" from "this send was acknowledged
          // without agent activity" without risking an infinite wait.
          throw new Error(
            `Cannot resume from eventId ${options.eventId} before agent_start for stream ${trackedStreamId}`,
          );
        }
      } else if (options.streamId) {
        const index = currentEvents.findIndex(
          (e) => e.type === 'agent_start' && e.streamId === options.streamId,
        );
        if (index !== -1) {
          replayStartIndex = index;
        }
      } else {
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
            trackedStreamId = start.streamId;
            replayStartIndex = currentEvents.findIndex(
              (e) => e.id === start.id,
            );
            break;
          }
        }
      }

      if (replayStartIndex !== -1) {
        for (let i = replayStartIndex; i < currentEvents.length; i++) {
          const event = currentEvents[i];
          queueVisibleEvent(event);
          if (done) break;
        }
      }
      started = true;

      // Process events that arrived while we were replaying
      for (const event of earlyEvents) {
        if (done) break;
        queueVisibleEvent(event);
      }

      while (true) {
        if (eventQueue.length > 0) {
          const eventsToYield = eventQueue;
          eventQueue = [];
          for (const event of eventsToYield) {
            yield event;
          }
          continue;
        }

        if (done) break;
        await next;
      }
    } finally {
      unsubscribe();
    }
  }
}
