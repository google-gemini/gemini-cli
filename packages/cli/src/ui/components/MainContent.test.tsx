/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { MainContent } from './MainContent.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Box, Text } from 'ink';
import type React from 'react';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { ToolCallStatus } from '../types.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import type { UIState } from '../contexts/UIStateContext.js';

// Mock dependencies
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
    isEditorDialogOpen: false,
    activePtyId: undefined,
    embeddedShellFocused: false,
    historyRemountKey: 0,
    bannerData: { defaultText: '', warningText: '' },
    bannerVisible: false,
  };

  beforeEach(() => {
    vi.mocked(useAlternateBuffer).mockReturnValue(false);
  });

  it('renders in normal buffer mode', async () => {
    const { lastFrame } = renderWithProviders(<MainContent />, {
      uiState: defaultMockUiState as Partial<UIState>,
    });
    await waitFor(() => expect(lastFrame()).toContain('AppHeader'));
    const output = lastFrame();

    expect(output).toContain('Hello');
    expect(output).toContain('Hi there');
  });

  it('renders in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame } = renderWithProviders(<MainContent />, {
      uiState: defaultMockUiState as Partial<UIState>,
    });
    await waitFor(() => expect(lastFrame()).toContain('ScrollableList'));
    const output = lastFrame();

    expect(output).toContain('AppHeader');
    expect(output).toContain('Hello');
    expect(output).toContain('Hi there');
  });

  it('does not constrain height in alternate buffer mode', async () => {
    vi.mocked(useAlternateBuffer).mockReturnValue(true);
    const { lastFrame } = renderWithProviders(<MainContent />, {
      uiState: defaultMockUiState as Partial<UIState>,
    });
    await waitFor(() => expect(lastFrame()).toContain('Hello'));
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  describe('MainContent Tool Output Height Logic', () => {
    const testCases = [
      {
        name: 'ASB mode - Focused shell should expand',
        isAlternateBuffer: true,
        embeddedShellFocused: true,
        constrainHeight: true,
        shouldShowLine1: true,
      },
      {
        name: 'ASB mode - Unfocused shell',
        isAlternateBuffer: true,
        embeddedShellFocused: false,
        constrainHeight: true,
        shouldShowLine1: false,
      },
      {
        name: 'Normal mode - Constrained height',
        isAlternateBuffer: false,
        embeddedShellFocused: false,
        constrainHeight: true,
        shouldShowLine1: false,
      },
      {
        name: 'Normal mode - Unconstrained height',
        isAlternateBuffer: false,
        embeddedShellFocused: false,
        constrainHeight: false,
        shouldShowLine1: false,
      },
    ];

    it.each(testCases)(
      '$name',
      async ({
        isAlternateBuffer,
        embeddedShellFocused,
        constrainHeight,
        shouldShowLine1,
      }) => {
        vi.mocked(useAlternateBuffer).mockReturnValue(isAlternateBuffer);
        const ptyId = 123;
        const uiState = {
          history: [],
          pendingHistoryItems: [
            {
              type: 'tool_group' as const,
              id: 1,
              tools: [
                {
                  callId: 'call_1',
                  name: SHELL_COMMAND_NAME,
                  status: ToolCallStatus.Executing,
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
          terminalHeight: 50,
          terminalWidth: 100,
          mainAreaWidth: 100,
          embeddedShellFocused,
          activePtyId: embeddedShellFocused ? ptyId : undefined,
          constrainHeight,
          isEditorDialogOpen: false,
          slashCommands: [],
          historyRemountKey: 0,
          bannerData: {
            defaultText: '',
            warningText: '',
          },
          bannerVisible: false,
        };

        const { lastFrame } = renderWithProviders(<MainContent />, {
          uiState: uiState as Partial<UIState>,
          useAlternateBuffer: isAlternateBuffer,
        });

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
      },
    );
  });
});
