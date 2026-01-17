/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { MainContent } from './MainContent.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Box, Text } from 'ink';
import type React from 'react';
import type { HistoryItem } from '../types.js';

// Mock dependencies
vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: () => ({
    version: '1.0.0',
  }),
}));

let mockHistory: Array<Partial<HistoryItem>> = [];
const mockSettings = {
  merged: {
    output: {
      verbosity: 'info',
    },
  },
};

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    history: mockHistory,
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

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: () => mockSettings,
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(),
}));

vi.mock('./HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: ({
    item,
    availableTerminalHeight,
  }: {
    item: { text?: string; content?: string };
    availableTerminalHeight?: number;
  }) => (
    <Box>
      <Text>
        HistoryItem: {item.text || item.content} (height:{' '}
        {availableTerminalHeight === undefined
          ? 'undefined'
          : availableTerminalHeight}
        )
      </Text>
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
    mockHistory = [
      { id: 1, type: 'user', text: 'Hello' },
      { id: 2, type: 'gemini', text: 'Hi there' },
    ];
    mockSettings.merged.output.verbosity = 'info';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders in normal buffer mode', async () => {
    const { lastFrame } = render(<MainContent />);
    await waitFor(() => expect(lastFrame()).toContain('AppHeader'));
    const output = lastFrame();

    expect(output).toContain('HistoryItem: Hello (height: 20)');
    expect(output).toContain('HistoryItem: Hi there (height: 20)');
  });

  it('renders in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame } = render(<MainContent />);
    await waitFor(() => expect(lastFrame()).toContain('ScrollableList'));
    const output = lastFrame();

    expect(output).toContain('AppHeader');
    expect(output).toContain('HistoryItem: Hello (height: undefined)');
    expect(output).toContain('HistoryItem: Hi there (height: undefined)');
  });

  it('does not constrain height in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame } = render(<MainContent />);
    await waitFor(() => expect(lastFrame()).toContain('HistoryItem: Hello'));
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('filters out verbose items when verbosity is info', async () => {
    mockHistory = [
      { id: 1, type: 'user', text: 'Visible User Message' },
      { id: 2, type: 'verbose', text: 'Hidden Verbose Log' },
    ];
    mockSettings.merged.output.verbosity = 'info';

    const { lastFrame } = render(<MainContent />);
    await waitFor(() => expect(lastFrame()).toContain('AppHeader'));
    const output = lastFrame();

    expect(output).toContain('HistoryItem: Visible User Message');
    expect(output).not.toContain('HistoryItem: Hidden Verbose Log');
  });

  it('shows verbose items when verbosity is verbose', async () => {
    mockHistory = [
      { id: 1, type: 'user', text: 'Visible User Message' },
      { id: 2, type: 'verbose', text: 'Visible Verbose Log' },
    ];
    mockSettings.merged.output.verbosity = 'verbose';

    const { lastFrame } = render(<MainContent />);
    await waitFor(() => expect(lastFrame()).toContain('AppHeader'));
    const output = lastFrame();

    expect(output).toContain('HistoryItem: Visible User Message');
    expect(output).toContain('HistoryItem: Visible Verbose Log');
  });
});
