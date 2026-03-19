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
    let resolve: (() => void) | undefined;
    let next = new Promise<void>((res) => {
      resolve = res;
    });

    const eventQueue: AgentEvent[] = [];
    const earlyEvents: AgentEvent[] = [];
    let streamId: string | null | undefined;
    let done = false;
    let started = false;

    const handleEvent = (event: AgentEvent) => {
      if (event.type === 'agent_start') {
        started = true;
      }

      if (started) {
        eventQueue.push(event);
      }

      if (event.type === 'agent_end') {
        done = true;
      }

      const currentResolve = resolve;
      next = new Promise<void>((r) => {
        resolve = r;
      });
      currentResolve?.();
    };

    const unsubscribe = this._protocol.subscribe((event) => {
      if (done) return;

      if (streamId === undefined) {
        earlyEvents.push(event);
        return;
      }

      if (streamId === null || event.streamId !== streamId) return;

      handleEvent(event);
    });

    try {
      const result = await this._protocol.send(payload);
      streamId = result.streamId;

      if (streamId === null) {
        done = true;
        const currentResolve = resolve;
        currentResolve?.();
        return;
      }

      // Process events that arrived while we were waiting for the streamId
      for (const event of earlyEvents) {
        if (event.streamId === streamId) {
          handleEvent(event);
        }
      }

      while (true) {
        // Yield what we have.
        while (started && eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }

        if (done) break;

        // Wait for next event.
        await next;
      }
    } finally {
      unsubscribe();
    }
  }
}
