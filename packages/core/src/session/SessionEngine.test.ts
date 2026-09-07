/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SessionEngine } from './SessionEngine.js';
import { EventBus } from '../events/EventBus.js';

describe('SessionEngine', () => {
  it('initializes with default placeholder provider and emits session:start', () => {
    const events = new EventBus();
    let started = false;
    events.on('session:start', () => {
      started = true;
    });

    const session = new SessionEngine({ eventBus: events });
    session.start();

    expect(started).toBe(true);
    expect(session.getMessages()).toHaveLength(0);
    expect(session.getState()).toBe('idle');
    expect(session.getProvider().name).toBe('placeholder');
  });

  it('handles user input, streams tokens, and returns Zoe core is running.', async () => {
    const events = new EventBus();
    const chunks: string[] = [];
    const statuses: string[] = [];

    events.on('runtime:stream', (data) => {
      chunks.push(data.chunk);
    });
    events.on('runtime:status', (data) => {
      if (data.message) {
        statuses.push(data.message);
      }
    });

    const session = new SessionEngine({ eventBus: events });
    session.start();

    await session.send('hello');

    const messages = session.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hello');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Zoe core is running.');
    expect(chunks.join('')).toBe('Zoe core is running.');
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toContain('Thinking with placeholder');
  });

  it('clears message history', async () => {
    const session = new SessionEngine();
    session.start();
    await session.send('test');
    expect(session.getMessages()).toHaveLength(2);

    session.clearHistory();
    expect(session.getMessages()).toHaveLength(0);
  });
});
