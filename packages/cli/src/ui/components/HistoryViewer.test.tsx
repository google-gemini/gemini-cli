/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { HistoryViewer } from './HistoryViewer.js';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';

// Collect key handlers
const keypressHandlers: Array<(key: unknown) => void> = [];

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 40 }),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: (
    handler: (key: unknown) => void,
    options: { isActive: boolean },
  ) => {
    if (options?.isActive) {
      keypressHandlers.push(handler);
    }
  },
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    partToString: (part: string | JSON) =>
      typeof part === 'string' ? part : JSON.stringify(part),
  };
});

const triggerKey = (
  partialKey: Partial<{
    name: string;
    sequence: string;
  }>,
) => {
  const handler = keypressHandlers[keypressHandlers.length - 1];
  if (!handler) {
    throw new Error('No keypress handler registered');
  }

  const key = {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    sequence: '',
    ...partialKey,
  };

  act(() => {
    handler(key);
  });
};

const createConversation = (messages: MessageRecord[]): ConversationRecord => ({
  sessionId: 'test-session',
  projectHash: 'hash',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  messages,
});

describe('HistoryViewer', () => {
  beforeEach(() => {
    keypressHandlers.length = 0;
    vi.clearAllMocks();
  });

  it('renders nothing interesting for empty conversation', () => {
    const conversation = createConversation([]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );
    expect(lastFrame()).toContain('History Viewer (0 of 0)');
  });

  it('renders a single interaction', () => {
    const conversation = createConversation([
      { type: 'user', content: 'Hello', id: '1', timestamp: '1' },
      { type: 'gemini', content: 'Hi there!', id: '1', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );
    expect(lastFrame()).toContain('User:');
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('Gemini:');
    expect(lastFrame()).toContain('Hi there!');
  });

  it('shows full text for selected item', () => {
    const longText = '1\n2\n3\n4\n5\n6\n7';
    const conversation = createConversation([
      { type: 'user', content: longText, id: '1', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );
    // Selected item should NOT be truncated
    expect(lastFrame()).toContain('1');
    expect(lastFrame()).toContain('5');
    expect(lastFrame()).toContain('7');
    expect(lastFrame()).not.toContain('... (2 more lines)');
  });

  it('updates selection and expansion on navigation', () => {
    const longText1 = 'Line A\nLine B\nLine C\nLine D\nLine E\nLine F\nLine G';
    const longText2 = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7';
    const conversation = createConversation([
      { type: 'user', content: longText1, id: '1', timestamp: '1' },
      { type: 'gemini', content: 'Response 1', id: '1', timestamp: '1' },
      { type: 'user', content: longText2, id: '1', timestamp: '1' },
      { type: 'gemini', content: 'Response 2', id: '1', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );

    // Initial state: Item 1 selected (expanded), Item 2 unselected (truncated)
    expect(lastFrame()).toContain('Line G'); // Item 1 fully shown

    // Check for Item 2 being truncated.
    expect(lastFrame()).not.toContain('Line 7');

    // Move down to select Item 2
    triggerKey({ name: 'down' });

    // New state: Item 1 unselected (truncated), Item 2 selected (expanded)
    expect(lastFrame()).not.toContain('Line G');
    expect(lastFrame()).toContain('Line 7');
  });

  it('handles scrolling and header updates', () => {
    // Create 4 interactions
    const msgs = [];
    for (let i = 1; i <= 4; i++) {
      msgs.push({ type: 'user', content: `Q${i}`, id: '1', timestamp: '1' });
      msgs.push({ type: 'gemini', content: `A${i}`, id: '1', timestamp: '1' });
    }
    const conversation = createConversation(msgs as MessageRecord[]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );

    // Should show 1 of 4
    expect(lastFrame()).toContain('History Viewer (1 of 4)');
    expect(lastFrame()).toContain('Q1');
    expect(lastFrame()).toContain('Q3');
    // Q4 might be visible depending on window size (3 items per page),
    // but let's focus on header and selection.

    // Scroll down
    triggerKey({ name: 'down' });
    expect(lastFrame()).toContain('History Viewer (2 of 4)');

    // Scroll to end
    triggerKey({ name: 'down' });
    triggerKey({ name: 'down' });
    expect(lastFrame()).toContain('History Viewer (4 of 4)');

    // Verify Q4 is visible and selected
    expect(lastFrame()).toContain('Q4');
  });

  it('handles cyclic navigation', () => {
    // Create 3 interactions
    const msgs = [];
    for (let i = 1; i <= 3; i++) {
      msgs.push({ type: 'user', content: `Q${i}`, id: '1', timestamp: '1' });
      msgs.push({ type: 'gemini', content: `A${i}`, id: '1', timestamp: '1' });
    }
    const conversation = createConversation(msgs as MessageRecord[]);
    const onExit = vi.fn();
    const { lastFrame } = render(
      <HistoryViewer conversation={conversation} onExit={onExit} />,
    );

    // Initial state: 1 of 3
    expect(lastFrame()).toContain('History Viewer (1 of 3)');

    // Up from first -> Last (3 of 3)
    triggerKey({ name: 'up' });
    expect(lastFrame()).toContain('History Viewer (3 of 3)');
    expect(lastFrame()).toContain('Q3'); // Ensure Q3 is visible (selected)

    // Down from last -> First (1 of 3)
    triggerKey({ name: 'down' });
    expect(lastFrame()).toContain('History Viewer (1 of 3)');
    expect(lastFrame()).toContain('Q1'); // Ensure Q1 is visible (selected)
  });
});
