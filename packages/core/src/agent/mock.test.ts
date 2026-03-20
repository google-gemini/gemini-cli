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
      if (e.type === 'agent_end') {
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

    // Ordered: user message, agent_start, agent message, agent_end = 4 events
    expect(streamedEvents).toHaveLength(4);
    expect(streamedEvents[0].type).toBe('message');
    expect((streamedEvents[0] as AgentEvent<'message'>).role).toBe('user');
    expect(streamedEvents[1].type).toBe('agent_start');
    expect(streamedEvents[2].type).toBe('message');
    expect((streamedEvents[2] as AgentEvent<'message'>).role).toBe('agent');
    expect(streamedEvents[3].type).toBe('agent_end');

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
      update: { title: 't1' },
    });
    const events1 = await stream1Promise;
    expect(events1).toHaveLength(3); // session_update, agent_start, agent_end
    expect(events1[0].type).toBe('session_update');
    expect(events1[1].type).toBe('agent_start');
    expect(events1[2].type).toBe('agent_end');

    // Second send
    const stream2Promise = waitForStreamEnd(session);
    const { streamId: s2 } = await session.send({
      update: { title: 't2' },
    });
    expect(s1).not.toBe(s2);
    const events2 = await stream2Promise;
    expect(events2).toHaveLength(4); // session_update, agent_start, error, agent_end
    expect(events2[0].type).toBe('session_update');
    expect(events2[1].type).toBe('agent_start');
    expect(events2[2].type).toBe('error');
    expect(events2[3].type).toBe('agent_end');

    expect(session.events).toHaveLength(7);
  });

  it('should handle abort on a waiting stream', async () => {
    const session = new MockAgentProtocol();
    // Use keepOpen to prevent auto agent_end
    session.pushResponse([{ type: 'message' }], { keepOpen: true });

    const events: AgentEvent[] = [];
    let resolveStream: (evs: AgentEvent[]) => void;
    const streamPromise = new Promise<AgentEvent[]>((res) => {
      resolveStream = res;
    });

    session.subscribe((e) => {
      events.push(e);
      if (e.type === 'agent_end') {
        resolveStream(events);
      }
    });

    const { streamId: _streamId } = await session.send({
      update: { title: 't' },
    });

    // Initial events should have been emitted
    expect(events.map((e) => e.type)).toEqual([
      'session_update',
      'agent_start',
      'message',
    ]);

    // At this point, the stream should be "waiting" for more events because it's still active
    // and hasn't seen an agent_end.
    await session.abort();

    const finalEvents = await streamPromise;
    expect(finalEvents[3].type).toBe('agent_end');
    expect((finalEvents[3] as AgentEvent<'agent_end'>).reason).toBe('aborted');
  });

  it('should handle pushToStream on a waiting stream', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([], { keepOpen: true });

    const events: AgentEvent[] = [];
    session.subscribe((e) => events.push(e));

    const { streamId } = await session.send({ update: { title: 't' } });

    expect(events.map((e) => e.type)).toEqual([
      'session_update',
      'agent_start',
    ]);

    // Push new event to active stream
    session.pushToStream(streamId!, [{ type: 'message' }]);

    expect(events).toHaveLength(3);
    expect(events[2].type).toBe('message');

    await session.abort();
    expect(events).toHaveLength(4);
    expect(events[3].type).toBe('agent_end');
  });

  it('should handle pushToStream with close option', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([], { keepOpen: true });

    const streamPromise = waitForStreamEnd(session);
    const { streamId } = await session.send({ update: { title: 't' } });

    // Push new event and close
    session.pushToStream(streamId!, [{ type: 'message' }], { close: true });

    const events = await streamPromise;
    expect(events.map((e) => e.type)).toEqual([
      'session_update',
      'agent_start',
      'message',
      'agent_end',
    ]);
    expect((events[3] as AgentEvent<'agent_end'>).reason).toBe('completed');
  });

  it('should not double up on agent_end if provided manually', async () => {
    const session = new MockAgentProtocol();
    session.pushResponse([
      { type: 'message' },
      { type: 'agent_end', reason: 'completed' },
    ]);

    const streamPromise = waitForStreamEnd(session);
    await session.send({ update: { title: 't' } });

    const events = await streamPromise;
    const endEvents = events.filter((e) => e.type === 'agent_end');
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
    expect(events[0].type).toBe('elicitation_response');
    expect((events[0] as AgentEvent<'elicitation_response'>).requestId).toBe(
      'r1',
    );
    expect(events[1].type).toBe('agent_start');
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
    expect(events[0].type).toBe('session_update');
    expect(events[1].type).toBe('agent_start');
  });

  it('should return streamId: null if no response queued', async () => {
    const session = new MockAgentProtocol();
    const { streamId } = await session.send({ update: { title: 'foo' } });
    expect(streamId).toBeNull();
    expect(session.events).toHaveLength(1);
    expect(session.events[0].type).toBe('session_update');
    expect(session.events[0].streamId).toBeNull();
  });

  it('should throw on action', async () => {
    const session = new MockAgentProtocol();
    await expect(
      session.send({ action: { type: 'foo', data: {} } }),
    ).rejects.toThrow('Actions not supported in MockAgentProtocol: foo');
  });
});
