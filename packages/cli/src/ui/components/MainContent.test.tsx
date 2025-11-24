/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { MainContent } from './MainContent.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Box, Text } from 'ink';
import type React from 'react';

// Mock dependencies
vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: () => ({
    version: '1.0.0',
  }),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    history: [
      { id: 1, role: 'user', content: 'Hello' },
      { id: 2, role: 'model', content: 'Hi there' },
    ],
    pendingHistoryItems: [],
    mainAreaWidth: 80,
    staticAreaMaxItemHeight: 20,
    availableTerminalHeight: 24,
    slashCommands: [],
    constrainHeight: false,
    isEditorDialogOpen: false,
    activePtyId: undefined,
    embeddedShellFocused: false,
    historyRemountKey: 0,
  }),
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(),
}));

vi.mock('./HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: ({ item }: { item: { content: string } }) => (
    <Box>
      <Text>HistoryItem: {item.content}</Text>
    </Box>
  ),
}));

vi.mock('./AppHeader.js', () => ({
  AppHeader: () => <Text>AppHeader</Text>,
}));

vi.mock('./ShowMoreLines.js', () => ({
  ShowMoreLines: () => <Text>ShowMoreLines</Text>,
}));

vi.mock('./shared/ScrollableList.js', () => ({
  ScrollableList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (props: { item: unknown }) => React.JSX.Element;
  }) => (
    <Box flexDirection="column">
      <Text>ScrollableList</Text>
      {data.map((item: unknown, index: number) => (
        <Box key={index}>{renderItem({ item })}</Box>
      ))}
    </Box>
  ),
  SCROLL_TO_ITEM_END: 0,
}));

import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

describe('MainContent', () => {
  beforeEach(() => {
    vi.mocked(useAlternateBuffer).mockReturnValue(false);
  });

  it('renders in normal buffer mode', () => {
    const { lastFrame } = render(<MainContent />);
    const output = lastFrame();

    expect(output).toContain('AppHeader');
    expect(output).toContain('HistoryItem: Hello');
    expect(output).toContain('HistoryItem: Hi there');
  });

  it('renders in alternate buffer mode', () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame } = render(<MainContent />);
    const output = lastFrame();

    expect(output).toContain('ScrollableList');
    expect(output).toContain('AppHeader');
    expect(output).toContain('HistoryItem: Hello');
    expect(output).toContain('HistoryItem: Hi there');
  });
});
