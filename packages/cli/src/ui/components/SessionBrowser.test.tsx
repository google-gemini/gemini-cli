/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import type { Config } from '@google/gemini-cli-core';
import { SessionBrowser } from './SessionBrowser.js';
import type { SessionBrowserProps } from './SessionBrowser.js';
import type { SessionInfo } from '../../utils/sessionUtils.js';

// Collect key handlers registered via useKeypress so tests can
// simulate input without going through the full stdin pipeline.
const keypressHandlers: Array<(key: unknown) => void> = [];

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 24 }),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  // The real hook subscribes to the KeypressContext. Here we just
  // capture the handler so tests can call it directly.
  useKeypress: (
    handler: (key: unknown) => void,
    options: { isActive: boolean },
  ) => {
    if (options?.isActive) {
      keypressHandlers.push(handler);
    }
  },
}));

// Mock the component itself to bypass async loading
vi.mock('./SessionBrowser.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./SessionBrowser.js')>();
  const React = await import('react');

  const TestSessionBrowser = (
    props: SessionBrowserProps & {
      testSessions?: SessionInfo[];
      testError?: string | null;
    },
  ) => {
    const state = original.useSessionBrowserState(
      props.testSessions || [],
      false, // Not loading
      props.testError || null,
    );
    const moveSelection = original.useMoveSelection(state);
    const cycleSortOrder = original.useCycleSortOrder(state);
    original.useSessionBrowserInput(
      state,
      moveSelection,
      cycleSortOrder,
      props.onResumeSession,
      props.onDeleteSession,
      props.onExit,
    );

    return React.createElement(original.SessionBrowserView, { state });
  };

  return {
    ...original,
    SessionBrowser: TestSessionBrowser,
  };
});

// Cast SessionBrowser to a type that includes the test-only props so TypeScript doesn't complain
const TestSessionBrowser = SessionBrowser as unknown as React.FC<
  SessionBrowserProps & {
    testSessions?: SessionInfo[];
    testError?: string | null;
  }
>;

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    storage: {
      getProjectTempDir: () => '/tmp/test',
    },
    getSessionId: () => 'default-session-id',
    ...overrides,
  }) as Config;

const triggerKey = (
  partialKey: Partial<{
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    paste: boolean;
    insertable: boolean;
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
    paste: false,
    insertable: false,
    sequence: '',
    ...partialKey,
  };

  act(() => {
    handler(key);
  });
};

const createSession = (overrides: Partial<SessionInfo>): SessionInfo => ({
  id: 'session-id',
  file: 'session-id',
  fileName: 'session-id.json',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  messageCount: 1,
  displayName: 'Test Session',
  firstUserMessage: 'Test Session',
  isCurrentSession: false,
  index: 0,
  ...overrides,
});

describe('SessionBrowser component', () => {
  beforeEach(() => {
    keypressHandlers.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when no sessions exist', () => {
    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onExit = vi.fn();

    const { lastFrame } = render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onExit={onExit}
        testSessions={[]}
      />,
    );

    expect(lastFrame()).toContain('No auto-saved conversations found.');
    expect(lastFrame()).toContain('Press q to exit');
  });

  it('renders a list of sessions and marks current session as disabled', () => {
    const session1 = createSession({
      id: 'abc123',
      file: 'abc123',
      displayName: 'First conversation about cats',
      lastUpdated: '2025-01-01T10:05:00Z',
      messageCount: 2,
      index: 0,
    });
    const session2 = createSession({
      id: 'def456',
      file: 'def456',
      displayName: 'Second conversation about dogs',
      lastUpdated: '2025-01-01T11:30:00Z',
      messageCount: 5,
      isCurrentSession: true,
      index: 1,
    });

    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onExit = vi.fn();

    const { lastFrame } = render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onExit={onExit}
        testSessions={[session1, session2]}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Chat Sessions (2 total');
    expect(output).toContain('First conversation about cats');
    expect(output).toContain('Second conversation about dogs');
    expect(output).toContain('(current)');
  });

  it('enters search mode, filters sessions, and renders match snippets', async () => {
    const searchSession = createSession({
      id: 'search1',
      file: 'search1',
      displayName: 'Query is here and another query.',
      firstUserMessage: 'Query is here and another query.',
      fullContent: 'Query is here and another query.',
      messages: [
        {
          role: 'user',
          content: 'Query is here and another query.',
        },
      ],
      index: 0,
    });

    const otherSession = createSession({
      id: 'other',
      file: 'other',
      displayName: 'Nothing interesting here.',
      firstUserMessage: 'Nothing interesting here.',
      fullContent: 'Nothing interesting here.',
      messages: [
        {
          role: 'user',
          content: 'Nothing interesting here.',
        },
      ],
      index: 1,
    });

    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onExit = vi.fn();

    const { lastFrame } = render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onExit={onExit}
        testSessions={[searchSession, otherSession]}
      />,
    );

    expect(lastFrame()).toContain('Chat Sessions (2 total');

    // Enter search mode.
    triggerKey({ sequence: '/', name: '/' });

    await waitFor(() => {
      expect(lastFrame()).toContain('Search:');
    });

    // Type the query "query".
    for (const ch of ['q', 'u', 'e', 'r', 'y']) {
      triggerKey({ sequence: ch, name: ch, ctrl: false, meta: false });
    }

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Chat Sessions (1 total, filtered');
      expect(output).toContain('Query is here');
      expect(output).not.toContain('Nothing interesting here.');

      expect(output).toContain('You:');
      expect(output).toContain('query');
      expect(output).toContain('(+1 more)');
    });
  });

  it('handles keyboard navigation and resumes the selected session', () => {
    const session1 = createSession({
      id: 'one',
      file: 'one',
      displayName: 'First session',
      index: 0,
    });
    const session2 = createSession({
      id: 'two',
      file: 'two',
      displayName: 'Second session',
      index: 1,
    });

    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onExit = vi.fn();

    const { lastFrame } = render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onExit={onExit}
        testSessions={[session1, session2]}
      />,
    );

    expect(lastFrame()).toContain('Chat Sessions (2 total');

    // Move selection down.
    triggerKey({ name: 'down', sequence: '[B' });

    // Press Enter.
    triggerKey({ name: 'return', sequence: '\r' });

    expect(onResumeSession).toHaveBeenCalledTimes(1);
    const [resumedSession] = onResumeSession.mock.calls[0];
    expect(resumedSession).toEqual(session2);
  });

  it('does not allow resuming or deleting the current session', () => {
    const currentSession = createSession({
      id: 'current',
      file: 'current',
      displayName: 'Current session',
      isCurrentSession: true,
      index: 0,
    });
    const otherSession = createSession({
      id: 'other',
      file: 'other',
      displayName: 'Other session',
      isCurrentSession: false,
      index: 1,
    });

    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onDeleteSession = vi.fn();
    const onExit = vi.fn();

    render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onDeleteSession={onDeleteSession}
        onExit={onExit}
        testSessions={[currentSession, otherSession]}
      />,
    );

    // Active selection is at 0 (current session).
    triggerKey({ name: 'return', sequence: '\r' });
    expect(onResumeSession).not.toHaveBeenCalled();

    // Attempt delete.
    triggerKey({ sequence: 'x', name: 'x' });
    expect(onDeleteSession).not.toHaveBeenCalled();
  });

  it('shows an error state when loading sessions fails', () => {
    const config = createMockConfig();
    const onResumeSession = vi.fn();
    const onExit = vi.fn();

    const { lastFrame } = render(
      <TestSessionBrowser
        config={config}
        onResumeSession={onResumeSession}
        onExit={onExit}
        testError="storage failure"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Error: storage failure');
    expect(output).toContain('Press q to exit');
  });
});
