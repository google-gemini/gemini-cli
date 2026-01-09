/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { RewindViewer } from './RewindViewer.js';
import { RewindOutcome } from './RewindConfirmation.js';
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

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: () => ({
    getPromptCount: () => 1,
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  const partToStringRecursive = (part: unknown): string => {
    if (!part) {
      return '';
    }
    if (typeof part === 'string') {
      return part;
    }
    if (Array.isArray(part)) {
      return part.map(partToStringRecursive).join('');
    }
    if (typeof part === 'object' && part !== null && 'text' in part) {
      return (part as { text: string }).text ?? '';
    }
    return '';
  };

  return {
    ...original,
    partToString: (part: string | JSON) => partToStringRecursive(part),
  };
});

const triggerKey = (
  partialKey: Partial<{
    name: string;
    sequence: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
  }>,
) => {
  if (keypressHandlers.length === 0) {
    throw new Error('No keypress handler registered');
  }

  const key = {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    sequence: '',
    insertable:
      !partialKey.ctrl && !partialKey.meta && partialKey.sequence?.length === 1,
    ...partialKey,
  };

  act(() => {
    keypressHandlers.forEach((handler) => handler(key));
  });
};

const createConversation = (messages: MessageRecord[]): ConversationRecord => ({
  sessionId: 'test-session',
  projectHash: 'hash',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  messages,
});

describe('RewindViewer', () => {
  beforeEach(() => {
    keypressHandlers.length = 0;
    vi.clearAllMocks();
  });

  it('renders nothing interesting for empty conversation', () => {
    const conversation = createConversation([]);
    const onExit = vi.fn();
    const onRewind = vi.fn();
    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );
    expect(lastFrame()).toContain('> Rewind');
  });

  it('renders a single interaction', () => {
    const conversation = createConversation([
      { type: 'user', content: 'Hello', id: '1', timestamp: '1' },
      { type: 'gemini', content: 'Hi there!', id: '1', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const onRewind = vi.fn();

    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );
    expect(lastFrame()).toContain('Hello');
    // We only show user messages now, and no labels like 'User:' or 'Gemini:'
    expect(lastFrame()).not.toContain('Gemini:');
    expect(lastFrame()).not.toContain('Hi there!');
  });

  it('shows full text for selected item', () => {
    const longText = '1\n2\n3\n4\n5\n6\n7';
    const conversation = createConversation([
      { type: 'user', content: longText, id: '1', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const onRewind = vi.fn();
    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
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
      { type: 'user', content: longText2, id: '2', timestamp: '1' },
      { type: 'gemini', content: 'Response 2', id: '2', timestamp: '1' },
    ]);
    const onExit = vi.fn();
    const onRewind = vi.fn();
    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    // Initial state: Item 2 (newest) is at top and selected (expanded)
    // Item 1 (oldest) is below and unselected (truncated)

    expect(lastFrame()).toContain('Line 7'); // Item 2 fully shown

    // Check for Item 1 being truncated.
    expect(lastFrame()).not.toContain('Line G');

    // Move down to select Item 1 (older message)
    triggerKey({ name: 'down' });

    // New state: Item 2 unselected (truncated), Item 1 selected (expanded)
    expect(lastFrame()).not.toContain('Line 7');
    expect(lastFrame()).toContain('Line G');
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
    const onRewind = vi.fn();
    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    // Should show 1 of 4 -> Now just checks title
    expect(lastFrame()).toContain('> Rewind');
    expect(lastFrame()).toContain('Q1');
    expect(lastFrame()).toContain('Q3');
    // Q4 might be visible depending on window size (3 items per page),
    // but let's focus on header and selection.

    // Scroll down
    triggerKey({ name: 'down' });
    // expect(lastFrame()).toContain('Rewind Viewer (2 of 4)');

    // Scroll to end
    triggerKey({ name: 'down' });
    triggerKey({ name: 'down' });
    // expect(lastFrame()).toContain('Rewind Viewer (4 of 4)');

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
    const onRewind = vi.fn();
    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    // Initial state: 1 of 3
    expect(lastFrame()).toContain('> Rewind');

    // Up from first -> Last (3 of 3)
    triggerKey({ name: 'up' });
    // expect(lastFrame()).toContain('Rewind Viewer (3 of 3)');
    expect(lastFrame()).toContain('Q3'); // Ensure Q3 is visible (selected)

    // Down from last -> First (1 of 3)
    triggerKey({ name: 'down' });
    // expect(lastFrame()).toContain('Rewind Viewer (1 of 3)');
    expect(lastFrame()).toContain('Q1'); // Ensure Q1 is visible (selected)
  });

  it('starts at the beginning (oldest message) currently', () => {
    // Create 5 interactions (User+Gemini pairs)
    const msgs = [];
    for (let i = 1; i <= 5; i++) {
      msgs.push({ type: 'user', content: `Q${i}`, id: '1', timestamp: '1' });
      msgs.push({ type: 'gemini', content: `A${i}`, id: '1', timestamp: '1' });
    }
    const conversation = createConversation(msgs as MessageRecord[]);
    const onExit = vi.fn();
    const onRewind = vi.fn();

    const { lastFrame } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    // Currently, it defaults to index 0 (1 of 5)
    expect(lastFrame()).toContain('> Rewind');
    expect(lastFrame()).toContain('Q1');
    // Q5 is at the end. With sufficient terminal height, it should be visible.
    // The previous test assumed a small page size.
    // expect(lastFrame()).not.toContain('Q5');
    expect(lastFrame()).toContain('Q5');
  });

  describe('Interaction Selection', () => {
    it('shows confirmation dialog on Enter and handles selection', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Original Prompt', id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      // Verify initial state
      expect(lastFrame()).toContain('Original Prompt');

      // Press Enter to select
      triggerKey({ name: 'return' });

      // Should show confirmation
      expect(lastFrame()).toContain('Confirm Rewind');
      expect(lastFrame()).toContain(
        'Rewind conversation and revert code changes',
      );

      // Press Enter again to confirm (first option selected by default)
      triggerKey({ name: 'return' });

      expect(onRewind).toHaveBeenCalledWith(
        '1',
        'Original Prompt',
        RewindOutcome.RewindAndRevert,
      );
    });

    it('can cancel from confirmation dialog', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Original Prompt', id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      // Enter to open confirmation
      triggerKey({ name: 'return' });
      expect(lastFrame()).toContain('Confirm Rewind');

      // Escape to cancel
      triggerKey({ name: 'escape' });

      // Should return to list view
      expect(lastFrame()).not.toContain('Confirm Rewind');
      expect(lastFrame()).toContain('Original Prompt');
      expect(onRewind).not.toHaveBeenCalled();
    });
  });

  describe('Content Filtering', () => {
    it('preserves content but removes markers from display', () => {
      const userPrompt =
        'some command @file\n--- Content from referenced files ---\nContent from file:\nblah blah\n--- End of content ---';

      const conversation = createConversation([
        { type: 'user', content: userPrompt, id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      expect(lastFrame()).toContain('some command @file');
      expect(lastFrame()).not.toContain(
        '--- Content from referenced files ---',
      );
      expect(lastFrame()).not.toContain('blah blah');
    });

    it('passes cleaned text to onRewind callback', () => {
      const userPrompt =
        'some command @file\n--- Content from referenced files ---\nContent from file:\nblah blah\n--- End of content ---';

      const conversation = createConversation([
        { type: 'user', content: userPrompt, id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      expect(lastFrame()).toContain('some command @file');

      // Select and confirm
      triggerKey({ name: 'return' }); // Select
      triggerKey({ name: 'return' }); // Confirm

      expect(onRewind).toHaveBeenCalledWith(
        '1',
        'some command @file', // Should be stripped
        RewindOutcome.RewindAndRevert,
      );
    });

    it('strips expanded MCP resource content', () => {
      const userPrompt =
        'read @server3:mcp://demo-resource hello\n' +
        '--- Content from referenced files ---\n' +
        '\nContent from @server3:mcp://demo-resource:\n' +
        'This is the content of the demo resource.\n' +
        '--- End of content ---';

      const conversation = createConversation([
        { type: 'user', content: userPrompt, id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      expect(lastFrame()).toContain('read @server3:mcp://demo-resource hello');
      expect(lastFrame()).not.toContain(
        'This is the content of the demo resource',
      );
    });
  });

  it('updates content when conversation changes (background update)', () => {
    // 1. Initial state
    const messages: MessageRecord[] = [
      { type: 'user', content: 'Message 1', id: '1', timestamp: '1' },
    ];
    let conversation = createConversation(messages);
    const onExit = vi.fn();
    const onRewind = vi.fn();

    const { lastFrame, unmount } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    expect(lastFrame()).toContain('Message 1');

    // 2. User closes (unmount)
    unmount();

    // 3. Background update (add message)
    const newMessages: MessageRecord[] = [
      ...messages,
      { type: 'user', content: 'Message 2', id: '2', timestamp: '2' },
    ];
    conversation = createConversation(newMessages);

    // 4. Open again (render with new conversation)
    const { lastFrame: lastFrame2 } = render(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    expect(lastFrame2()).toContain('Message 1');
    expect(lastFrame2()).toContain('Message 2');
  });
});
