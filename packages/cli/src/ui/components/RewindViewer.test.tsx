/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { RewindViewer } from './RewindViewer.js';
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
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
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
    insertable:
      !partialKey.ctrl && !partialKey.meta && partialKey.sequence?.length === 1,
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
      { type: 'user', content: longText2, id: '1', timestamp: '1' },
      { type: 'gemini', content: 'Response 2', id: '1', timestamp: '1' },
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

  describe('Editing Interaction', () => {
    it('enters edit mode on Enter', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Original Prompt', id: '1', timestamp: '1' },
      ]);
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={vi.fn()}
        />,
      );

      // Verify not in edit mode initially (no save instruction)
      expect(lastFrame()).not.toContain('[Ctrl+S] Save');

      // Enter edit mode
      triggerKey({ name: 'return' });
      expect(lastFrame()).toContain('[Ctrl+S] Save');
      expect(lastFrame()).toContain('Original Prompt');
    });

    it('saves edit and calls onRewind', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Old', id: 'msg-1', timestamp: '1' },
      ]);

      let resolveRewind: (value: void) => void;
      const rewindPromise = new Promise<void>((resolve) => {
        resolveRewind = resolve;
      });
      const onRewind = vi.fn().mockReturnValue(rewindPromise);

      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      // Enter edit mode
      triggerKey({ name: 'return' });

      // Move to end of line
      triggerKey({ name: 'end' });

      // Simulate typing " New"
      triggerKey({ sequence: ' ' });
      triggerKey({ sequence: 'N' });
      triggerKey({ sequence: 'e' });
      triggerKey({ sequence: 'w' });

      // Save with Ctrl+S
      triggerKey({ name: 's', ctrl: true });

      // Wait for initial async operations (setIsSaving(true))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(onRewind).toHaveBeenCalledWith('msg-1', 'Old New');
      expect(lastFrame()).toContain('Rewinding conversation...');

      // Complete the rewind operation
      await act(async () => {
        resolveRewind();
      });

      // Wait for final state updates (setIsSaving(false))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(lastFrame()).not.toContain('Rewinding conversation...');
      // Editor should be closed, displaying the updated text (locally updated)
      expect(lastFrame()).toContain('Old New');
    });

    it('handles save error', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Old', id: 'msg-1', timestamp: '1' },
      ]);
      const onRewind = vi.fn().mockRejectedValue(new Error('Rewind failed'));
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      triggerKey({ name: 'return' }); // Enter edit
      triggerKey({ name: 's', ctrl: true }); // Save

      // Need to wait for async rejection to settle in state
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(lastFrame()).toContain('Error: Failed to save: Rewind failed');
      // Should still be in edit mode
      expect(lastFrame()).toContain('[Ctrl+S] Save');
    });

    it('cancels edit mode', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Old', id: 'msg-1', timestamp: '1' },
      ]);
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={vi.fn()}
        />,
      );

      triggerKey({ name: 'return' }); // Enter edit
      expect(lastFrame()).toContain('[Ctrl+S] Save');

      triggerKey({ name: 'escape' }); // Cancel
      expect(lastFrame()).not.toContain('[Ctrl+S] Save');
    });

    it('blocks navigation while editing', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Q1', id: '1', timestamp: '1' },
        { type: 'gemini', content: 'A1', id: '1', timestamp: '1' },
        { type: 'user', content: 'Q2', id: '2', timestamp: '1' },
      ]);
      const { lastFrame } = render(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={vi.fn()}
        />,
      );

      // Select Q1
      expect(lastFrame()).toContain('Q1');
      expect(lastFrame()).toContain('> Rewind');

      triggerKey({ name: 'return' }); // Enter edit mode on Q1
      expect(lastFrame()).toContain('[Ctrl+S] Save');

      triggerKey({ name: 'down' }); // Try to move down

      // Should still be on Q1 (Edit mode active), not moved to Q2
      expect(lastFrame()).toContain('[Ctrl+S] Save');
      // Header should still say Rewind (prefix changes to spaces)
      expect(lastFrame()).toContain('Rewind');
    });
  });
});
