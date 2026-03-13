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
      { type: 'error', message: 'fail', fatal: true, status: '...' },
    ]);

    // First send
    const { streamId: s1 } = await session.send({
      update: {},
    });
    const events1: AgentEvent[] = [];
    for await (const e of session.stream()) events1.push(e);
    expect(events1).toHaveLength(2); // stream_start, stream_end
    expect(events1[0].type).toBe('stream_start');
    expect(events1[1].type).toBe('stream_end');

    // Second send
    const { streamId: s2 } = await session.send({
      update: {},
    });
    expect(s1).not.toBe(s2);
    const events2: AgentEvent[] = [];
    for await (const e of session.stream()) events2.push(e);
    expect(events2).toHaveLength(3); // stream_start, error, stream_end
    expect(events2[1].type).toBe('error');

    expect(session.events).toHaveLength(5);
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
    expect(events).toHaveLength(3); // start, message, end
  });

  it('should throw when streaming non-existent streamId', async () => {
    const session = new MockAgentSession();
    await expect(async () => {
      const stream = session.stream({ streamId: 'invalid' });
      await stream.next();
    }).rejects.toThrow('Stream not found: invalid');
  });

  it('should handle abort', async () => {
    const session = new MockAgentSession();
    session.pushResponse([{ type: 'stream_start' }]); // Explicitly test we can use manual start
    const { streamId } = await session.send({
      update: {},
    });

    await session.abort({ streamId });

    const events: AgentEvent[] = [];
    for await (const e of session.stream({ streamId })) {
      events.push(e);
    }
    expect(events).toHaveLength(0);
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
    expect(second).toHaveLength(2);
    expect(second[0].id).toBe('e2');
    expect(second[1].id).toBe('e3');
  });
});
