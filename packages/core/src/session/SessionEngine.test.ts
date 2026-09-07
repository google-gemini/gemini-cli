/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SessionEngine } from './SessionEngine.js';
import { EventBus } from '../events/EventBus.js';
import { PlaceholderRuntime } from '../runtime/PlaceholderRuntime.js';

describe('SessionEngine', () => {
  it('initializes with default placeholder runtime and emits session:start', () => {
    const events = new EventBus();
    let started = false;
    events.on('session:start', () => {
      started = true;
    });

    const session = new SessionEngine(undefined, events);
    session.start();

    expect(started).toBe(true);
    expect(session.getMessages()).toHaveLength(0);
    expect(session.getState()).toBe('idle');
  });

  it('handles user input and returns Zoe core is running.', async () => {
    const session = new SessionEngine();
    session.start();

    await session.send('hello');

    const messages = session.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hello');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Zoe core is running.');
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
