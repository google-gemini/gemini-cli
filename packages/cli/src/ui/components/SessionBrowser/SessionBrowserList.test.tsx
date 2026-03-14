/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { SessionList } from './SessionList.js';
import { SessionItem } from './SessionItem.js';
import { SessionTableHeader } from './SessionTableHeader.js';
import { MatchSnippetDisplay } from './MatchSnippetDisplay.js';
import type { SessionBrowserState } from '../SessionBrowser.js';
import type { SessionInfo } from '../../../utils/sessionUtils.js';

describe('SessionBrowser List Components', () => {
  const mockSession: SessionInfo = {
    id: '1',
    file: 'session-1',
    fileName: 'session-1.json',
    startTime: new Date().toISOString(),
    displayName: 'Test Session',
    firstUserMessage: 'Test Session',
    messageCount: 5,
    lastUpdated: new Date().toISOString(),
    isCurrentSession: false,
    index: 1,
  };

  const mockState = {
    totalSessions: 1,
    startIndex: 0,
    endIndex: 1,
    visibleSessions: [mockSession],
    activeIndex: 0,
    scrollOffset: 0,
    terminalWidth: 80,
    searchQuery: '',
    isSearchMode: false,
  } as SessionBrowserState;

  it('SessionTableHeader renders correctly', async () => {
    const { lastFrame, waitUntilReady } = render(
      <SessionTableHeader state={mockState} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('MatchSnippetDisplay returns null when no snippets', () => {
    const { lastFrame } = render(
      <MatchSnippetDisplay session={mockSession} textColor={(c) => c || ''} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('MatchSnippetDisplay renders correctly with snippets', async () => {
    const sessionWithSnippets = {
      ...mockSession,
      matchSnippets: [
        {
          role: 'user' as const,
          before: 'hello ',
          match: 'world',
          after: ' !',
        },
      ],
    };
    const { lastFrame, waitUntilReady } = render(
      <MatchSnippetDisplay
        session={sessionWithSnippets}
        textColor={(c) => c || ''}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionItem renders correctly', async () => {
    const { lastFrame, waitUntilReady } = render(
      <SessionItem
        session={mockSession}
        state={mockState}
        terminalWidth={80}
        formatRelativeTime={() => '10m ago'}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionList renders correctly', async () => {
    const { lastFrame, waitUntilReady } = render(
      <SessionList state={mockState} formatRelativeTime={() => '10m ago'} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
