/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { MockAgentProtocol } from './mock.js';
import type { AgentEvent, AgentProtocol } from './types.js';

const waitForStreamEnd = (session: AgentProtocol): Promise<AgentEvent[]> =>
  new Promise((resolve) => {
    const events: AgentEvent[] = [];
    const unsubscribe = session.subscribe((e) => {
      events.push(e);
      if (e.type === 'stream_end') {
        unsubscribe();
        resolve(events);
      }
    });
  });

describe('MockAgentProtocol', () => {
  it('should emit queued events on send and subscribe', async () => {
    const session = new MockAgentProtocol();
    const event1 = {
      type: 'message',
      role: 'agent',
      content: [{ type: 'text', text: 'hello' }],
    } as AgentEvent;

    session.pushResponse([event1]);

    const streamPromise = waitForStreamEnd(session);

    const { streamId } = await session.send({
      message: [{ type: 'text', text: 'hi' }],
    });
    expect(streamId).toBeDefined();

    const streamedEvents = await streamPromise;

    // Auto stream_start, auto user message, agent message, auto stream_end = 4 events
    expect(streamedEvents).toHaveLength(4);
    expect(streamedEvents[0].type).toBe('stream_start');
    expect(streamedEvents[1].type).toBe('message');
    expect((streamedEvents[1] as AgentEvent<'message'>).role).toBe('user');
    expect(streamedEvents[2].type).toBe('message');
    expect((streamedEvents[2] as AgentEvent<'message'>).role).toBe('agent');
    expect(streamedEvents[3].type).toBe('stream_end');

    expect(session.events).toHaveLength(4);
    expect(session.events).toEqual(streamedEvents);
  });

  it('should handle multiple responses', async () => {
    const session = new MockAgentProtocol();

    // Test with empty payload (no message injected)
    session.pushResponse([]);
    session.pushResponse([
      {
        type: 'error',
        message: 'fail',
        fatal: true,
        status: 'RESOURCE_EXHAUSTED',
      },
    ]);

    // First send
    const stream1Promise = waitForStreamEnd(session);
    const { streamId: s1 } = await session.send({
      update: {},
    });
    const events1 = await stream1Promise;
    expect(events1).toHaveLength(3); // stream_start, session_update, stream_end
    expect(events1[0].type).toBe('stream_start');
    expect(events1[1].type).toBe('session_update');
    expect(events1[2].type).toBe('stream_end');

    // Second send
    const stream2Promise = waitForStreamEnd(session);
    const { streamId: s2 } = await session.send({
      update: {},
    });
    expect(s1).not.toBe(s2);
    const events2 = await stream2Promise;
    expect(events2).toHaveLength(4); // stream_start, session_update, error, stream_end
    expect(events2[1].type).toBe('session_update');
    expect(events2[2].type).toBe('error');

    expect(session.events).toHaveLength(7);
  });

  it('should handle abort on a waiting stream', async () => {
    const session = new MockAgentProtocol();
    // Use keepOpen to prevent auto stream_end
    session.pushResponse([{ type: 'message' }], { keepOpen: true });

    const events: AgentEvent[] = [];
    let resolveStream: (evs: AgentEvent[]) => void;
    const streamPromise = new Promise<AgentEvent[]>((res) => {
      resolveStream = res;
    });

    session.subscribe((e) => {
      events.push(e);
      if (e.type === 'stream_end') {
        resolveStream(events);
      }
    });

    const { streamId: _streamId } = await session.send({ update: {} });

    // Initial events should have been emitted
    expect(events.map((e) => e.type)).toEqual([
      'stream_start',
      'session_update',
      'message',
    ]);

    // At this point, the stream should be "waiting" for more events because it's still active
    // and hasn't seen a stream_end.
    await session.abort();

    const finalEvents = await streamPromise;
    expect(finalEvents[3].type).toBe('stream_end');
    expect((finalEvents[3] as AgentEvent<'stream_end'>).reason).toBe('aborted');
  });

  it('should handle pushToStream on a waiting stream', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([], { keepOpen: true });

    const events: AgentEvent[] = [];
    session.subscribe((e) => events.push(e));

    const { streamId } = await session.send({ update: {} });

    expect(events.map((e) => e.type)).toEqual([
      'stream_start',
      'session_update',
    ]);

    // Push new event to active stream
    session.pushToStream(streamId, [{ type: 'message' }]);

    expect(events).toHaveLength(3);
    expect(events[2].type).toBe('message');

    await session.abort();
    expect(events).toHaveLength(4);
    expect(events[3].type).toBe('stream_end');
  });

  it('should handle pushToStream with close option', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([], { keepOpen: true });

    const streamPromise = waitForStreamEnd(session);
    const { streamId } = await session.send({ update: {} });

    // Push new event and close
    session.pushToStream(streamId, [{ type: 'message' }], { close: true });

    const events = await streamPromise;
    expect(events.map((e) => e.type)).toEqual([
      'stream_start',
      'session_update',
      'message',
      'stream_end',
    ]);
    expect((events[3] as AgentEvent<'stream_end'>).reason).toBe('completed');
  });

  it('should not double up on stream_end if provided manually', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([
      { type: 'message' },
      { type: 'stream_end', reason: 'completed' },
    ]);

    const streamPromise = waitForStreamEnd(session);
    await session.send({ update: {} });

    const events = await streamPromise;
    const endEvents = events.filter((e) => e.type === 'stream_end');
    expect(endEvents).toHaveLength(1);
  });

  it('should handle elicitations', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([]);

    const streamPromise = waitForStreamEnd(session);
    await session.send({
      elicitations: [
        { requestId: 'r1', action: 'accept', content: { foo: 'bar' } },
      ],
    });

    const events = await streamPromise;
    expect(events[1].type).toBe('elicitation_response');
    expect((events[1] as AgentEvent<'elicitation_response'>).requestId).toBe(
      'r1',
    );
  });

  it('should handle updates and track state', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([]);

    const streamPromise = waitForStreamEnd(session);
    await session.send({
      update: { title: 'New Title', model: 'gpt-4', config: { x: 1 } },
    });

    expect(session.title).toBe('New Title');
    expect(session.model).toBe('gpt-4');
    expect(session.config).toEqual({ x: 1 });

    const events = await streamPromise;
    expect(events[1].type).toBe('session_update');
  });

  it('should throw on action', async () => {
    const session = new MockAgentProtocol();
    await expect(
      session.send({ action: { type: 'foo', data: {} } }),
    ).rejects.toThrow('Actions not supported in MockAgentProtocol: foo');
  });
});
