/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AgentSession } from './agent-session.js';
import { MockAgentProtocol } from './mock.js';
import type { AgentEvent, AgentSend } from './types.js';

function makeMessageSend(
  text: string,
  displayContent?: string,
): Extract<AgentSend, { message: unknown }> {
  return {
    message: {
      content: [{ type: 'text', text }],
      ...(displayContent ? { displayContent } : {}),
    },
  };
}

describe('AgentSession', () => {
  it('should passthrough simple methods', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    protocol.pushResponse([{ type: 'message' }]);
    await session.send({ update: { title: 't' } });
    // update, agent_start, message, agent_end = 4 events
    expect(session.events).toHaveLength(4);

    let emitted = false;
    session.subscribe(() => {
      emitted = true;
    });
    protocol.pushResponse([]);
    await session.send({ update: { title: 't' } });
    expect(emitted).toBe(true);

    protocol.pushResponse([], { keepOpen: true });
    await session.send({ update: { title: 't' } });
    await session.abort();
    expect(
      session.events.some(
        (e) => e.type === 'agent_end' && e.reason === 'aborted',
      ),
    ).toBe(true);
  });

  it('should yield events via sendStream', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    protocol.pushResponse([
      {
        type: 'message',
        role: 'agent',
        content: [{ type: 'text', text: 'hello' }],
      },
    ]);

    const events: AgentEvent[] = [];
    for await (const event of session.sendStream({
      ...makeMessageSend('hi'),
    })) {
      events.push(event);
    }

    // agent_start, agent message, agent_end = 3 events (user message skipped)
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('agent_start');
    expect(events[1].type).toBe('message');
    expect((events[1] as AgentEvent<'message'>).role).toBe('agent');
    expect(events[2].type).toBe('agent_end');
  });

  it('should filter events by streamId in sendStream', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    protocol.pushResponse([{ type: 'message' }]);

    const events: AgentEvent[] = [];
    const stream = session.sendStream({ update: { title: 'foo' } });

    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toHaveLength(3); // agent_start, message, agent_end (update skipped)
    const streamId = events[0].streamId;
    expect(streamId).not.toBeNull();
    expect(events.every((e) => e.streamId === streamId)).toBe(true);
  });

  it('should handle events arriving before send() resolves', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    protocol.pushResponse([{ type: 'message' }]);

    const events: AgentEvent[] = [];
    for await (const event of session.sendStream({
      update: { title: 'foo' },
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(3); // agent_start, message, agent_end (update skipped)
    expect(events[0].type).toBe('agent_start');
    expect(events[1].type).toBe('message');
    expect(events[2].type).toBe('agent_end');
  });

  it('should return immediately from sendStream if streamId is null', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    // No response queued, so send() returns streamId: null
    const events: AgentEvent[] = [];
    for await (const event of session.sendStream({
      update: { title: 'foo' },
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
    expect(protocol.events).toHaveLength(1);
    expect(protocol.events[0].type).toBe('session_update');
    expect(protocol.events[0].streamId).toEqual(expect.any(String));
  });

  it('should skip events that occur before agent_start', async () => {
    const protocol = new MockAgentProtocol();
    const session = new AgentSession(protocol);

    // Custom emission to ensure events happen before agent_start
    protocol.pushResponse([
      {
        type: 'message',
        role: 'agent',
        content: [{ type: 'text', text: 'hello' }],
      },
    ]);

    // We can't easily inject events before agent_start with MockAgentProtocol.pushResponse
    // because it emits them all together.
    // But we know session_update is emitted first.

    const events: AgentEvent[] = [];
    for await (const event of session.sendStream({
      ...makeMessageSend('hi'),
    })) {
      events.push(event);
    }

    // The session_update (from the 'hi' message) should be skipped.
    expect(events.some((e) => e.type === 'session_update')).toBe(false);
    expect(events[0].type).toBe('agent_start');
  });

  describe('stream()', () => {
    it('should replay events after eventId', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      // Create some events
      protocol.pushResponse([{ type: 'message' }]);
      await session.send({ update: { title: 't1' } });
      // Wait for events to be emitted
      await new Promise((resolve) => setTimeout(resolve, 10));

      const allEvents = session.events;
      expect(allEvents.length).toBeGreaterThan(2);
      const eventId = allEvents[1].id;

      const streamedEvents: AgentEvent[] = [];
      for await (const event of session.stream({ eventId })) {
        streamedEvents.push(event);
      }

      expect(streamedEvents).toEqual(allEvents.slice(2));
    });

    it('should complete immediately when resuming from agent_end', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([{ type: 'message' }]);
      const { streamId } = await session.send({
        ...makeMessageSend('request'),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const endEvent = session.events.findLast(
        (event): event is AgentEvent<'agent_end'> =>
          event.type === 'agent_end' && event.streamId === streamId,
      );
      expect(endEvent).toBeDefined();

      const iterator = session
        .stream({ eventId: endEvent!.id })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({
        value: undefined,
        done: true,
      });
    });

    it('should throw for an unknown eventId', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      const iterator = session
        .stream({ eventId: 'missing-event' })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(
        'Unknown eventId: missing-event',
      );
    });

    it('should throw when resuming from an event before agent_start on a stream with no agent activity', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      const { streamId } = await session.send({ update: { title: 'draft' } });
      expect(streamId).toBeNull();

      const updateEvent = session.events.find(
        (event): event is AgentEvent<'session_update'> =>
          event.type === 'session_update',
      );
      expect(updateEvent).toBeDefined();

      const iterator = session
        .stream({ eventId: updateEvent!.id })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(
        `Cannot resume from eventId ${updateEvent!.id} before agent_start for stream ${updateEvent!.streamId}`,
      );
    });

    it('should replay from agent_start when resuming from a pre-agent_start event after activity is in history', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([
        {
          type: 'message',
          role: 'agent',
          content: [{ type: 'text', text: 'hello' }],
        },
      ]);
      await session.send({
        ...makeMessageSend('request'),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const userMessage = session.events.find(
        (event): event is AgentEvent<'message'> =>
          event.type === 'message' && event.role === 'user',
      );
      expect(userMessage).toBeDefined();

      const streamedEvents: AgentEvent[] = [];
      for await (const event of session.stream({ eventId: userMessage!.id })) {
        streamedEvents.push(event);
      }

      expect(streamedEvents.map((event) => event.type)).toEqual([
        'agent_start',
        'message',
        'agent_end',
      ]);
      expect(streamedEvents[0]?.streamId).toBe(userMessage!.streamId);
    });

    it('should throw when resuming from a pre-agent_start event before activity is in history', async () => {
      const protocol = new MockAgentProtocol([
        {
          id: 'e-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          streamId: 'stream-1',
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: 'request' }],
        },
      ]);
      const session = new AgentSession(protocol);

      const iterator = session
        .stream({ eventId: 'e-1' })
        [Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(
        'Cannot resume from eventId e-1 before agent_start for stream stream-1',
      );
    });

    it('should resume from an in-stream event within the same stream only', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([
        {
          type: 'message',
          role: 'agent',
          content: [{ type: 'text', text: 'first answer 1' }],
        },
        {
          type: 'message',
          role: 'agent',
          content: [{ type: 'text', text: 'first answer 2' }],
        },
      ]);
      const { streamId: streamId1 } = await session.send({
        ...makeMessageSend('first request'),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      protocol.pushResponse([
        {
          type: 'message',
          role: 'agent',
          content: [{ type: 'text', text: 'second answer' }],
        },
      ]);
      await session.send({
        ...makeMessageSend('second request'),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const resumeEvent = session.events.find(
        (event): event is AgentEvent<'message'> =>
          event.type === 'message' &&
          event.streamId === streamId1 &&
          event.role === 'agent' &&
          event.content[0]?.type === 'text' &&
          event.content[0].text === 'first answer 1',
      );
      expect(resumeEvent).toBeDefined();

      const streamedEvents: AgentEvent[] = [];
      for await (const event of session.stream({ eventId: resumeEvent!.id })) {
        streamedEvents.push(event);
      }

      expect(
        streamedEvents.every((event) => event.streamId === streamId1),
      ).toBe(true);
      expect(streamedEvents.map((event) => event.type)).toEqual([
        'message',
        'agent_end',
      ]);
      const resumedMessage = streamedEvents[0] as AgentEvent<'message'>;
      expect(resumedMessage.content).toEqual([
        { type: 'text', text: 'first answer 2' },
      ]);
    });

    it('should replay events for streamId starting with agent_start', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([{ type: 'message' }]);
      const { streamId } = await session.send({ update: { title: 't1' } });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const allEvents = session.events;
      const startEventIndex = allEvents.findIndex(
        (e) => e.type === 'agent_start' && e.streamId === streamId,
      );
      expect(startEventIndex).toBeGreaterThan(-1);

      const streamedEvents: AgentEvent[] = [];
      for await (const event of session.stream({ streamId: streamId! })) {
        streamedEvents.push(event);
      }

      expect(streamedEvents).toEqual(allEvents.slice(startEventIndex));
    });

    it('should continue listening for active stream after replay', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      // Start a stream but keep it open
      protocol.pushResponse([{ type: 'message' }], { keepOpen: true });
      const { streamId } = await session.send({ update: { title: 't1' } });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const streamedEvents: AgentEvent[] = [];
      const streamPromise = (async () => {
        for await (const event of session.stream({ streamId: streamId! })) {
          streamedEvents.push(event);
        }
      })();

      // Push more to the stream
      await new Promise((resolve) => setTimeout(resolve, 20));
      protocol.pushToStream(streamId!, [{ type: 'message' }], { close: true });

      await streamPromise;

      const allEvents = session.events;
      const startEventIndex = allEvents.findIndex(
        (e) => e.type === 'agent_start' && e.streamId === streamId,
      );
      expect(streamedEvents).toEqual(allEvents.slice(startEventIndex));
      expect(streamedEvents.at(-1)?.type).toBe('agent_end');
    });

    it('should not drop agent_end that arrives while replay events are being yielded', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([{ type: 'message' }], { keepOpen: true });
      const { streamId } = await session.send({ update: { title: 't1' } });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const iterator = session
        .stream({ streamId: streamId! })
        [Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.value?.type).toBe('agent_start');

      protocol.pushToStream(streamId!, [], { close: true });

      const second = await iterator.next();
      expect(second.value?.type).toBe('message');

      const third = await iterator.next();
      expect(third.value?.type).toBe('agent_end');

      const fourth = await iterator.next();
      expect(fourth.done).toBe(true);
    });

    it('should follow an active stream if no options provided', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      protocol.pushResponse([{ type: 'message' }], { keepOpen: true });
      const { streamId } = await session.send({ update: { title: 't1' } });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const streamedEvents: AgentEvent[] = [];
      const streamPromise = (async () => {
        for await (const event of session.stream()) {
          streamedEvents.push(event);
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 20));
      protocol.pushToStream(streamId!, [{ type: 'message' }], { close: true });
      await streamPromise;

      expect(streamedEvents.length).toBeGreaterThan(0);
      expect(streamedEvents.at(-1)?.type).toBe('agent_end');
    });

    it('should ONLY yield events for specific streamId even if newer streams exist', async () => {
      const protocol = new MockAgentProtocol();
      const session = new AgentSession(protocol);

      // Stream 1
      protocol.pushResponse([{ type: 'message' }]);
      const { streamId: streamId1 } = await session.send({
        update: { title: 's1' },
      });

      // Stream 2
      protocol.pushResponse([{ type: 'message' }]);
      const { streamId: streamId2 } = await session.send({
        update: { title: 's2' },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const streamedEvents: AgentEvent[] = [];
      for await (const event of session.stream({ streamId: streamId1! })) {
        streamedEvents.push(event);
      }

      expect(streamedEvents.every((e) => e.streamId === streamId1)).toBe(true);
      expect(streamedEvents.some((e) => e.type === 'agent_end')).toBe(true);
      expect(streamedEvents.some((e) => e.streamId === streamId2)).toBe(false);
    });
  });
});
