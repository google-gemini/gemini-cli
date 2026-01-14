/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { RewindViewer } from './RewindViewer.js';
import { waitFor } from '../../test-utils/async.js';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';

vi.mock('../utils/formatters.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../utils/formatters.js')>();
  return {
    ...original,
    formatTimeAgo: () => 'some time ago',
  };
});

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

const createConversation = (messages: MessageRecord[]): ConversationRecord => ({
  sessionId: 'test-session',
  projectHash: 'hash',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  messages,
});

describe('RewindViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it.each([
      { name: 'nothing interesting for empty conversation', messages: [] },
      {
        name: 'a single interaction',
        messages: [
          { type: 'user', content: 'Hello', id: '1', timestamp: '1' },
          { type: 'gemini', content: 'Hi there!', id: '1', timestamp: '1' },
        ],
      },
      {
        name: 'full text for selected item',
        messages: [
          {
            type: 'user',
            content: '1\n2\n3\n4\n5\n6\n7',
            id: '1',
            timestamp: '1',
          },
        ],
      },
    ])('renders $name', ({ messages }) => {
      const conversation = createConversation(messages as MessageRecord[]);
      const onExit = vi.fn();
      const onRewind = vi.fn();
      const { lastFrame } = renderWithProviders(
        <RewindViewer
          conversation={conversation}
          onExit={onExit}
          onRewind={onRewind}
        />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  it('updates selection and expansion on navigation', async () => {
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
    const { lastFrame, stdin } = renderWithProviders(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    // Initial state
    expect(lastFrame()).toMatchSnapshot('initial-state');

    // Move down to select Item 1 (older message)
    act(() => {
      stdin.write('\x1b[B');
    });

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot('after-down');
    });
  });

  describe('Navigation', () => {
    it.each([
      { name: 'down', sequence: '\x1b[B', expectedSnapshot: 'after-down' },
      { name: 'up', sequence: '\x1b[A', expectedSnapshot: 'after-up' },
    ])('handles $name navigation', async ({ sequence, expectedSnapshot }) => {
      const conversation = createConversation([
        { type: 'user', content: 'Q1', id: '1', timestamp: '1' },
        { type: 'user', content: 'Q2', id: '2', timestamp: '1' },
        { type: 'user', content: 'Q3', id: '3', timestamp: '1' },
      ]);
      const { lastFrame, stdin } = renderWithProviders(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={vi.fn()}
        />,
      );

      act(() => {
        stdin.write(sequence);
      });
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot(expectedSnapshot);
      });
    });

    it('handles cyclic navigation', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Q1', id: '1', timestamp: '1' },
        { type: 'user', content: 'Q2', id: '2', timestamp: '1' },
        { type: 'user', content: 'Q3', id: '3', timestamp: '1' },
      ]);
      const { lastFrame, stdin } = renderWithProviders(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={vi.fn()}
        />,
      );

      // Up from first -> Last
      act(() => {
        stdin.write('\x1b[A');
      });
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot('cyclic-up');
      });

      // Down from last -> First
      act(() => {
        stdin.write('\x1b[B');
      });
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot('cyclic-down');
      });
    });
  });

  describe('Interaction Selection', () => {
    it.each([
      {
        name: 'confirms on Enter',
        actionStep: async (
          stdin: { write: (data: string) => void },
          lastFrame: () => string | undefined,
        ) => {
          // Wait for confirmation dialog to be rendered and interactive
          await waitFor(() => {
            expect(lastFrame()).toContain('Confirm Rewind');
          });
          act(() => {
            stdin.write('\r');
          });
        },
      },
      {
        name: 'cancels on Escape',
        actionStep: async (
          stdin: { write: (data: string) => void },
          lastFrame: () => string | undefined,
        ) => {
          // Wait for confirmation dialog
          await waitFor(() => {
            expect(lastFrame()).toContain('Confirm Rewind');
          });
          act(() => {
            stdin.write('\x1b');
          });
          // Wait for return to main view
          await waitFor(() => {
            expect(lastFrame()).toContain('> Rewind');
          });
        },
      },
    ])('$name', async ({ actionStep }) => {
      const conversation = createConversation([
        { type: 'user', content: 'Original Prompt', id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      // Select
      act(() => {
        stdin.write('\r');
      });
      expect(lastFrame()).toMatchSnapshot('confirmation-dialog');

      // Act
      await actionStep(stdin, lastFrame);
    });
  });

  describe('Content Filtering', () => {
    it.each([
      {
        description: 'removes reference markers',
        prompt:
          'some command @file\n--- Content from referenced files ---\nContent from file:\nblah blah\n--- End of content ---',
      },
      {
        description: 'strips expanded MCP resource content',
        prompt:
          'read @server3:mcp://demo-resource hello\n' +
          '--- Content from referenced files ---\n' +
          '\nContent from @server3:mcp://demo-resource:\n' +
          'This is the content of the demo resource.\n' +
          '--- End of content ---',
      },
    ])('$description', async ({ prompt }) => {
      const conversation = createConversation([
        { type: 'user', content: prompt, id: '1', timestamp: '1' },
      ]);
      const onRewind = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <RewindViewer
          conversation={conversation}
          onExit={vi.fn()}
          onRewind={onRewind}
        />,
      );

      expect(lastFrame()).toMatchSnapshot();

      // Select
      act(() => {
        stdin.write('\r'); // Select
      });

      // Wait for confirmation dialog
      await waitFor(() => {
        expect(lastFrame()).toContain('Confirm Rewind');
      });
    });
  });

  it('updates content when conversation changes (background update)', () => {
    const messages: MessageRecord[] = [
      { type: 'user', content: 'Message 1', id: '1', timestamp: '1' },
    ];
    let conversation = createConversation(messages);
    const onExit = vi.fn();
    const onRewind = vi.fn();

    const { lastFrame, unmount } = renderWithProviders(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    expect(lastFrame()).toMatchSnapshot('initial');

    unmount();

    const newMessages: MessageRecord[] = [
      ...messages,
      { type: 'user', content: 'Message 2', id: '2', timestamp: '2' },
    ];
    conversation = createConversation(newMessages);

    const { lastFrame: lastFrame2 } = renderWithProviders(
      <RewindViewer
        conversation={conversation}
        onExit={onExit}
        onRewind={onRewind}
      />,
    );

    expect(lastFrame2()).toMatchSnapshot('after-update');
  });
});
