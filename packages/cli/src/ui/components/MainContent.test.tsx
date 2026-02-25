/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { MainContent } from './MainContent.js';
import { getToolGroupBorderAppearance } from '../utils/borderStyles.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Box, Text } from 'ink';
import { act, useState, type JSX } from 'react';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import {
  UIStateContext,
  useUIState,
  type UIState,
} from '../contexts/UIStateContext.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { type IndividualToolCallDisplay } from '../types.js';

// Mock dependencies
vi.mock('../contexts/SettingsContext.js', async () => {
  const actual = await vi.importActual('../contexts/SettingsContext.js');
  return {
    ...actual,
    useSettings: () => ({
      merged: {
        ui: {
          inlineThinkingMode: 'off',
        },
      },
    }),
  };
});

vi.mock('../contexts/AppContext.js', async () => {
  const actual = await vi.importActual('../contexts/AppContext.js');
  return {
    ...actual,
    useAppContext: () => ({
      version: '1.0.0',
    }),
  };
});

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(),
}));

vi.mock('./AppHeader.js', () => ({
  AppHeader: ({ showDetails = true }: { showDetails?: boolean }) => (
    <Text>{showDetails ? 'AppHeader(full)' : 'AppHeader(minimal)'}</Text>
  ),
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
    renderItem: (props: { item: unknown }) => JSX.Element;
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

import { theme } from '../semantic-colors.js';
import { type BackgroundShell } from '../hooks/shellReducer.js';

describe('getToolGroupBorderAppearance', () => {
  const mockBackgroundShells = new Map<number, BackgroundShell>();
  const activeShellPtyId = 123;

  it('returns default empty values for non-tool_group items', () => {
    const item = { type: 'user' as const, text: 'Hello', id: 1 };
    const result = getToolGroupBorderAppearance(
      item,
      null,
      false,
      [],
      mockBackgroundShells,
    );
    expect(result).toEqual({ borderColor: '', borderDimColor: false });
  });

  it('inspects only the last pending tool_group item if current has no tools', () => {
    const item = { type: 'tool_group' as const, tools: [], id: 1 };
    const pendingItems = [
      {
        type: 'tool_group' as const,
        tools: [
          {
            callId: '1',
            name: 'some_tool',
            description: '',
            status: CoreToolCallStatus.Executing,
            ptyId: undefined,
            resultDisplay: undefined,
            confirmationDetails: undefined,
          } as IndividualToolCallDisplay,
        ],
      },
      {
        type: 'tool_group' as const,
        tools: [
          {
            callId: '2',
            name: 'other_tool',
            description: '',
            status: CoreToolCallStatus.Success,
            ptyId: undefined,
            resultDisplay: undefined,
            confirmationDetails: undefined,
          } as IndividualToolCallDisplay,
        ],
      },
    ];

    // Only the last item (Success) should be inspected, so hasPending = false.
    // The previous item was Executing (pending) but it shouldn't be counted.
    const result = getToolGroupBorderAppearance(
      item,
      null,
      false,
      pendingItems,
      mockBackgroundShells,
    );
    expect(result).toEqual({
      borderColor: theme.border.default,
      borderDimColor: false,
    });
  });

  it('returns default border for completed normal tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          callId: '1',
          name: 'some_tool',
          description: '',
          status: CoreToolCallStatus.Success,
          ptyId: undefined,
          resultDisplay: undefined,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      ],
      id: 1,
    };
    const result = getToolGroupBorderAppearance(
      item,
      null,
      false,
      [],
      mockBackgroundShells,
    );
    expect(result).toEqual({
      borderColor: theme.border.default,
      borderDimColor: false,
    });
  });

  it('returns warning border for pending normal tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          callId: '1',
          name: 'some_tool',
          description: '',
          status: CoreToolCallStatus.Executing,
          ptyId: undefined,
          resultDisplay: undefined,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      ],
      id: 1,
    };
    const result = getToolGroupBorderAppearance(
      item,
      null,
      false,
      [],
      mockBackgroundShells,
    );
    expect(result).toEqual({
      borderColor: theme.status.warning,
      borderDimColor: true,
    });
  });

  it('returns symbol border for executing shell commands', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          callId: '1',
          name: SHELL_COMMAND_NAME,
          description: '',
          status: CoreToolCallStatus.Executing,
          ptyId: activeShellPtyId,
          resultDisplay: undefined,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      ],
      id: 1,
    };
    // While executing shell commands, it's dim false, border symbol
    const result = getToolGroupBorderAppearance(
      item,
      activeShellPtyId,
      true,
      [],
      mockBackgroundShells,
    );
    expect(result).toEqual({
      borderColor: theme.ui.symbol,
      borderDimColor: false,
    });
  });

  it('returns symbol border and dims color for background executing shell command when another shell is active', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          callId: '1',
          name: SHELL_COMMAND_NAME,
          description: '',
          status: CoreToolCallStatus.Executing,
          ptyId: 456, // Different ptyId, not active
          resultDisplay: undefined,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      ],
      id: 1,
    };
    const result = getToolGroupBorderAppearance(
      item,
      activeShellPtyId,
      false,
      [],
      mockBackgroundShells,
    );
    expect(result).toEqual({
      borderColor: theme.ui.symbol,
      borderDimColor: true,
    });
  });

  it('handles empty tools with active shell turn (isCurrentlyInShellTurn)', () => {
    const item = { type: 'tool_group' as const, tools: [], id: 1 };

    // active shell turn
    const result = getToolGroupBorderAppearance(
      item,
      activeShellPtyId,
      true,
      [],
      mockBackgroundShells,
    );
    // Since there are no tools to inspect, it falls back to empty pending, but isCurrentlyInShellTurn=true
    // so it counts as pending shell.
    expect(result.borderColor).toEqual(theme.ui.symbol);
    // It shouldn't be dim because there are no tools to say it isEmbeddedShellFocused = false
    expect(result.borderDimColor).toBe(false);
  });
});

describe('MainContent', () => {
  const defaultMockUiState = {
    history: [
      { id: 1, type: 'user', text: 'Hello' },
      { id: 2, type: 'gemini', text: 'Hi there' },
    ],
    pendingHistoryItems: [],
    mainAreaWidth: 80,
    staticAreaMaxItemHeight: 20,
    availableTerminalHeight: 24,
    slashCommands: [],
    constrainHeight: false,
    thought: null,
    isEditorDialogOpen: false,
    activePtyId: undefined,
    embeddedShellFocused: false,
    historyRemountKey: 0,
    cleanUiDetailsVisible: true,
    bannerData: { defaultText: '', warningText: '' },
    bannerVisible: false,
    copyModeEnabled: false,
    terminalWidth: 100,
  };

  beforeEach(() => {
    vi.mocked(useAlternateBuffer).mockReturnValue(false);
  });

  it('renders in normal buffer mode', async () => {
    const { lastFrame, unmount } = renderWithProviders(<MainContent />, {
      uiState: defaultMockUiState as Partial<UIState>,
    });
    await waitFor(() => expect(lastFrame()).toContain('AppHeader(full)'));
    const output = lastFrame();

    expect(output).toContain('AppHeader');
    expect(output).toContain('Hello');
    expect(output).toContain('Hi there');
    unmount();
  });

  it('renders in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MainContent />,
      {
        uiState: defaultMockUiState as Partial<UIState>,
      },
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('AppHeader(full)');
    expect(output).toContain('Hello');
    expect(output).toContain('Hi there');
    unmount();
  });

  it('renders minimal header in minimal mode (alternate buffer)', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);

    const { lastFrame, unmount } = renderWithProviders(<MainContent />, {
      uiState: {
        ...defaultMockUiState,
        cleanUiDetailsVisible: false,
      } as Partial<UIState>,
    });
    await waitFor(() => expect(lastFrame()).toContain('Hello'));
    const output = lastFrame();

    expect(output).toContain('AppHeader(minimal)');
    expect(output).not.toContain('AppHeader(full)');
    expect(output).toContain('Hello');
    unmount();
  });

  it('restores full header details after toggle in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);

    let setShowDetails: ((visible: boolean) => void) | undefined;
    const ToggleHarness = () => {
      const outerState = useUIState();
      const [showDetails, setShowDetailsState] = useState(
        outerState.cleanUiDetailsVisible,
      );
      setShowDetails = setShowDetailsState;

      return (
        <UIStateContext.Provider
          value={{ ...outerState, cleanUiDetailsVisible: showDetails }}
        >
          <MainContent />
        </UIStateContext.Provider>
      );
    };

    const { lastFrame } = renderWithProviders(<ToggleHarness />, {
      uiState: {
        ...defaultMockUiState,
        cleanUiDetailsVisible: false,
      } as Partial<UIState>,
    });

    await waitFor(() => expect(lastFrame()).toContain('AppHeader(minimal)'));
    if (!setShowDetails) {
      throw new Error('setShowDetails was not initialized');
    }
    const setShowDetailsSafe = setShowDetails;

    act(() => {
      setShowDetailsSafe(true);
    });

    await waitFor(() => expect(lastFrame()).toContain('AppHeader(full)'));
  });

  it('always renders full header details in normal buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(false);
    const { lastFrame } = renderWithProviders(<MainContent />, {
      uiState: {
        ...defaultMockUiState,
        cleanUiDetailsVisible: false,
      } as Partial<UIState>,
    });

    await waitFor(() => expect(lastFrame()).toContain('AppHeader(full)'));
    expect(lastFrame()).not.toContain('AppHeader(minimal)');
  });

  it('does not constrain height in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MainContent />,
      {
        uiState: defaultMockUiState as Partial<UIState>,
      },
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('AppHeader(full)');
    expect(output).toContain('Hello');
    expect(output).toContain('Hi there');
    unmount();
  });

  it('renders a split tool group without a gap between static and pending areas', async () => {
    const toolCalls = [
      {
        callId: 'tool-1',
        name: 'test-tool',
        description: 'A tool for testing',
        resultDisplay: 'Part 1',
        status: CoreToolCallStatus.Success,
      } as IndividualToolCallDisplay,
    ];

    const pendingToolCalls = [
      {
        callId: 'tool-2',
        name: 'test-tool',
        description: 'A tool for testing',
        resultDisplay: 'Part 2',
        status: CoreToolCallStatus.Success,
      } as IndividualToolCallDisplay,
    ];

    const uiState = {
      ...defaultMockUiState,
      history: [
        {
          id: 1,
          type: 'tool_group' as const,
          tools: toolCalls,
          borderBottom: false,
        },
      ],
      pendingHistoryItems: [
        {
          type: 'tool_group' as const,
          tools: pendingToolCalls,
          borderTop: false,
          borderBottom: true,
        },
      ],
    };

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MainContent />,
      {
        uiState: uiState as Partial<UIState>,
      },
    );
    await waitUntilReady();

    const output = lastFrame();
    // Verify Part 1 and Part 2 are rendered.
    expect(output).toContain('Part 1');
    expect(output).toContain('Part 2');

    // The snapshot will be the best way to verify there is no gap (empty line) between them.
    expect(output).toMatchSnapshot();
    unmount();
  });

  describe('MainContent Tool Output Height Logic', () => {
    const testCases = [
      {
        name: 'ASB mode - Focused shell should expand',
        isAlternateBuffer: true,
        embeddedShellFocused: true,
        constrainHeight: true,
        shouldShowLine1: false,
        staticAreaMaxItemHeight: 15,
      },
      {
        name: 'ASB mode - Unfocused shell',
        isAlternateBuffer: true,
        embeddedShellFocused: false,
        constrainHeight: true,
        shouldShowLine1: false,
        staticAreaMaxItemHeight: 15,
      },
      {
        name: 'Normal mode - Constrained height',
        isAlternateBuffer: false,
        embeddedShellFocused: false,
        constrainHeight: true,
        shouldShowLine1: false,
        staticAreaMaxItemHeight: 15,
      },
      {
        name: 'Normal mode - Unconstrained height',
        isAlternateBuffer: false,
        embeddedShellFocused: false,
        constrainHeight: false,
        shouldShowLine1: true,
        staticAreaMaxItemHeight: 15,
      },
    ];

    it.each(testCases)(
      '$name',
      async ({
        isAlternateBuffer,
        embeddedShellFocused,
        constrainHeight,
        shouldShowLine1,
        staticAreaMaxItemHeight,
      }) => {
        vi.mocked(useAlternateBuffer).mockReturnValue(isAlternateBuffer);
        const ptyId = 123;
        const uiState = {
          ...defaultMockUiState,
          history: [],
          pendingHistoryItems: [
            {
              type: 'tool_group',
              id: 1,
              tools: [
                {
                  callId: 'call_1',
                  name: SHELL_COMMAND_NAME,
                  status: CoreToolCallStatus.Executing,
                  description: 'Running a long command...',
                  // 20 lines of output.
                  // Default max is 15, so Line 1-5 will be truncated/scrolled out if not expanded.
                  resultDisplay: Array.from(
                    { length: 20 },
                    (_, i) => `Line ${i + 1}`,
                  ).join('\n'),
                  ptyId,
                  confirmationDetails: undefined,
                },
              ],
            },
          ],
          availableTerminalHeight: 30, // In ASB mode, focused shell should get ~28 lines
          staticAreaMaxItemHeight,
          terminalHeight: 50,
          terminalWidth: 100,
          mainAreaWidth: 100,
          thought: null,
          embeddedShellFocused,
          activePtyId: embeddedShellFocused ? ptyId : undefined,
          constrainHeight,
          isEditorDialogOpen: false,
          slashCommands: [],
          historyRemountKey: 0,
          cleanUiDetailsVisible: true,
          bannerData: {
            defaultText: '',
            warningText: '',
          },
          bannerVisible: false,
        };

        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <MainContent />,
          {
            uiState: uiState as Partial<UIState>,
            useAlternateBuffer: isAlternateBuffer,
          },
        );
        await waitUntilReady();

        const output = lastFrame();

        // Sanity checks - Use regex with word boundary to avoid matching "Line 10" etc.
        const line1Regex = /\bLine 1\b/;
        if (shouldShowLine1) {
          expect(output).toMatch(line1Regex);
        } else {
          expect(output).not.toMatch(line1Regex);
        }

        // All cases should show the last line
        expect(output).toContain('Line 20');

        // Snapshots for visual verification
        expect(output).toMatchSnapshot();
        unmount();
      },
    );
  });
});
