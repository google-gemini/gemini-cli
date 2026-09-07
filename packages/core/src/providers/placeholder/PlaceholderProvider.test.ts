/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PlaceholderProvider } from './PlaceholderProvider.js';
import type { ModelEvent } from '../ModelProvider.js';

describe('PlaceholderProvider', () => {
  it('is always available', async () => {
    const provider = new PlaceholderProvider();
    expect(await provider.isAvailable()).toBe(true);
    expect(provider.name).toBe('placeholder');
  });

  it('yields chunk and complete events', async () => {
    const provider = new PlaceholderProvider();
    const events: ModelEvent[] = [];

    for await (const event of provider.chat({ messages: [{ role: 'user', content: 'test' }] })) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'chunk', text: 'Zoe core is running.' });
    expect(events[1]).toEqual({ type: 'complete', fullText: 'Zoe core is running.' });
  });
});
