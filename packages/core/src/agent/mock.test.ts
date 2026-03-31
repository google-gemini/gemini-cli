/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { MockAgentSession } from './mock.js';
import type { AgentEvent } from './types.js';

describe('MockAgentSession', () => {
  it('should yield queued events on send and stream', async () => {
    const session = new MockAgentSession();
    const event1 = {
      type: 'message',
      role: 'agent',
      content: [{ type: 'text', text: 'hello' }],
    } as AgentEvent;

    session.pushResponse([event1]);

    const { streamId } = await session.send({
      message: [{ type: 'text', text: 'hi' }],
    });
    expect(streamId).toBeDefined();

    const streamedEvents: AgentEvent[] = [];
    for await (const event of session.stream()) {
      streamedEvents.push(event);
    }

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
    const session = new MockAgentSession();

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
    const { streamId: s1 } = await session.send({
      update: {},
    });
    const events1: AgentEvent[] = [];
    for await (const e of session.stream()) events1.push(e);
    expect(events1).toHaveLength(3); // stream_start, session_update, stream_end
    expect(events1[0].type).toBe('stream_start');
    expect(events1[1].type).toBe('session_update');
    expect(events1[2].type).toBe('stream_end');

    // Second send
    const { streamId: s2 } = await session.send({
      update: {},
    });
    expect(s1).not.toBe(s2);
    const events2: AgentEvent[] = [];
    for await (const e of session.stream()) events2.push(e);
    expect(events2).toHaveLength(4); // stream_start, session_update, error, stream_end
    expect(events2[1].type).toBe('session_update');
    expect(events2[2].type).toBe('error');

    expect(session.events).toHaveLength(7);
  });

  it('should allow streaming by streamId', async () => {
    const session = new MockAgentSession();
    session.pushResponse([{ type: 'message' }]);

    const { streamId } = await session.send({
      update: {},
    });

    const events: AgentEvent[] = [];
    for await (const e of session.stream({ streamId })) {
      events.push(e);
    }
    expect(events).toHaveLength(4); // start, update, message, end
  });

  it('should throw when streaming non-existent streamId', async () => {
    const session = new MockAgentSession();
    await expect(async () => {
      const stream = session.stream({ streamId: 'invalid' });
      await stream.next();
    }).rejects.toThrow('Stream not found: invalid');
  });

  it('should throw when streaming non-existent eventId', async () => {
    const session = new MockAgentSession();
    session.pushResponse([{ type: 'message' }]);
    await session.send({ update: {} });

    await expect(async () => {
      const stream = session.stream({ eventId: 'invalid' });
      await stream.next();
    }).rejects.toThrow('Event not found: invalid');
  });

  it('should handle abort on a waiting stream', async () => {
    const session = new MockAgentSession();
    // Use keepOpen to prevent auto stream_end
    session.pushResponse([{ type: 'message' }], { keepOpen: true });
    const { streamId } = await session.send({ update: {} });

    const stream = session.stream({ streamId });

    // Read initial events
    const e1 = await stream.next();
    expect(e1.value.type).toBe('stream_start');
    const e2 = await stream.next();
    expect(e2.value.type).toBe('session_update');
    const e3 = await stream.next();
    expect(e3.value.type).toBe('message');

    // At this point, the stream should be "waiting" for more events because it's still active
    // and hasn't seen a stream_end.
    const abortPromise = session.abort();
    const e4 = await stream.next();
    expect(e4.value.type).toBe('stream_end');
    expect((e4.value as AgentEvent<'stream_end'>).reason).toBe('aborted');

    await abortPromise;
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  it('should handle pushToStream on a waiting stream', async () => {
    const session = new MockAgentSession();
    session.pushResponse([], { keepOpen: true });
    const { streamId } = await session.send({ update: {} });

    const stream = session.stream({ streamId });
    await stream.next(); // start
    await stream.next(); // update

    // Push new event to active stream
    session.pushToStream(streamId, [{ type: 'message' }]);

    const e3 = await stream.next();
    expect(e3.value.type).toBe('message');

    await session.abort();
    const e4 = await stream.next();
    expect(e4.value.type).toBe('stream_end');
  });

  it('should handle pushToStream with close option', async () => {
    const session = new MockAgentSession();
    session.pushResponse([], { keepOpen: true });
    const { streamId } = await session.send({ update: {} });

    const stream = session.stream({ streamId });
    await stream.next(); // start
    await stream.next(); // update

    // Push new event and close
    session.pushToStream(streamId, [{ type: 'message' }], { close: true });

    const e3 = await stream.next();
    expect(e3.value.type).toBe('message');

    const e4 = await stream.next();
    expect(e4.value.type).toBe('stream_end');
    expect((e4.value as AgentEvent<'stream_end'>).reason).toBe('completed');

    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  it('should not double up on stream_end if provided manually', async () => {
    const session = new MockAgentSession();
    session.pushResponse([
      { type: 'message' },
      { type: 'stream_end', reason: 'completed' },
    ]);
    const { streamId } = await session.send({ update: {} });

    const events: AgentEvent[] = [];
    for await (const e of session.stream({ streamId })) {
      events.push(e);
    }

    const endEvents = events.filter((e) => e.type === 'stream_end');
    expect(endEvents).toHaveLength(1);
  });

  it('should stream after eventId', async () => {
    const session = new MockAgentSession();
    // Use manual IDs to test resumption
    session.pushResponse([
      { type: 'stream_start', id: 'e1' },
      { type: 'message', id: 'e2' },
      { type: 'stream_end', id: 'e3' },
    ]);

    await session.send({ update: {} });

    // Stream first event only
    const first: AgentEvent[] = [];
    for await (const e of session.stream()) {
      first.push(e);
      if (e.id === 'e1') break;
    }
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('e1');

    // Resume from e1
    const second: AgentEvent[] = [];
    for await (const e of session.stream({ eventId: 'e1' })) {
      second.push(e);
    }
    expect(second).toHaveLength(3); // update, message, end
    expect(second[0].type).toBe('session_update');
    expect(second[1].id).toBe('e2');
    expect(second[2].id).toBe('e3');
  });

  it('should handle elicitations', async () => {
    const session = new MockAgentSession();
    session.pushResponse([]);

    await session.send({
      elicitations: [
        { requestId: 'r1', action: 'accept', content: { foo: 'bar' } },
      ],
    });

    const events: AgentEvent[] = [];
    for await (const e of session.stream()) events.push(e);

    expect(events[1].type).toBe('elicitation_response');
    expect((events[1] as AgentEvent<'elicitation_response'>).requestId).toBe(
      'r1',
    );
  });

  it('should handle updates and track state', async () => {
    const session = new MockAgentSession();
    session.pushResponse([]);

    await session.send({
      update: { title: 'New Title', model: 'gpt-4', config: { x: 1 } },
    });

    expect(session.title).toBe('New Title');
    expect(session.model).toBe('gpt-4');
    expect(session.config).toEqual({ x: 1 });

    const events: AgentEvent[] = [];
    for await (const e of session.stream()) events.push(e);
    expect(events[1].type).toBe('session_update');
  });

  it('should throw on action', async () => {
    const session = new MockAgentSession();
    await expect(
      session.send({ action: { type: 'foo', data: {} } }),
    ).rejects.toThrow('Actions not supported in MockAgentSession: foo');
  });
});
