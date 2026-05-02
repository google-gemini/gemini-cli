/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { getToolGroupBorderAppearance } from './borderStyles.js';
import { CoreToolCallStatus, makeFakeConfig } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { MainContent } from '../components/MainContent.js';
import { Text } from 'ink';

vi.mock('../components/CliSpinner.js', () => ({
  CliSpinner: () => <Text>⊶</Text>,
}));

const altBufferOptions = {
  config: makeFakeConfig({ useAlternateBuffer: true }),
  settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
};

import { type UIState } from '../contexts/UIStateContext.js';

const defaultMockUiState: Partial<UIState> = {
  history: [],
  pendingHistoryItems: [],
  mainAreaWidth: 100,
  staticAreaMaxItemHeight: 20,
  availableTerminalHeight: 30,
  cleanUiDetailsVisible: true,
  mouseMode: false,
  slashCommands: [],
  constrainHeight: false,
  historyRemountKey: 0,
  isConfigInitialized: true,
  terminalWidth: 100,
  isEditorDialogOpen: false,
  embeddedShellFocused: false,
};

const renderMainContentWithState = async (uiState: Partial<UIState> = {}) => {
  const combinedState = {
    ...defaultMockUiState,
    ...uiState,
  } as unknown as UIState;
  return renderWithProviders(
    <MainContent
      history={combinedState.history}
      pendingHistoryItems={combinedState.pendingHistoryItems}
      mainAreaWidth={combinedState.mainAreaWidth}
      staticAreaMaxItemHeight={combinedState.staticAreaMaxItemHeight}
      availableTerminalHeight={combinedState.availableTerminalHeight}
      cleanUiDetailsVisible={combinedState.cleanUiDetailsVisible}
      mouseMode={combinedState.mouseMode}
      slashCommands={combinedState.slashCommands}
      constrainHeight={combinedState.constrainHeight}
      historyRemountKey={combinedState.historyRemountKey}
      isConfigInitialized={combinedState.isConfigInitialized}
      terminalWidth={combinedState.terminalWidth}
      isEditorDialogOpen={combinedState.isEditorDialogOpen}
      embeddedShellFocused={combinedState.embeddedShellFocused}
    />,
    {
      ...altBufferOptions,
      uiState: combinedState,
    },
  );
};

describe('getToolGroupBorderAppearance', () => {
  it('should use warning color for pending non-shell tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'google_web_search',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const appearance = getToolGroupBorderAppearance(item, undefined, false, []);
    expect(appearance.borderColor).toBe(theme.status.warning);
    expect(appearance.borderDimColor).toBe(true);
  });

  it('should use correct color for empty slice by looking at pending items', () => {
    const pendingItem = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'google_web_search',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const sliceItem = {
      type: 'tool_group' as const,
      tools: [] as IndividualToolCallDisplay[],
    };
    const allPendingItems = [pendingItem, sliceItem];

    const appearance = getToolGroupBorderAppearance(
      sliceItem,
      undefined,
      false,
      allPendingItems,
    );

    // It should match the pendingItem appearance
    expect(appearance.borderColor).toBe(theme.status.warning);
    expect(appearance.borderDimColor).toBe(true);
  });

  it('should use active color for shell tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'run_shell_command',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const appearance = getToolGroupBorderAppearance(item, undefined, false, []);
    expect(appearance.borderColor).toBe(theme.ui.active);
    expect(appearance.borderDimColor).toBe(true);
  });

  it('should use focus color for focused shell tools', () => {
    const ptyId = 123;
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'run_shell_command',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
          ptyId,
        },
      ] as IndividualToolCallDisplay[],
    };
    const appearance = getToolGroupBorderAppearance(item, ptyId, true, []);
    expect(appearance.borderColor).toBe(theme.ui.focus);
    expect(appearance.borderDimColor).toBe(false);
  });
});

describe('MainContent tool group border SVG snapshots', () => {
  it('should render SVG snapshot for a pending search dialog (google_web_search)', async () => {
    const renderResult = await renderMainContentWithState({
      pendingHistoryItems: [
        {
          type: 'tool_group',
          tools: [
            {
              name: 'google_web_search',
              status: CoreToolCallStatus.Executing,
              resultDisplay: 'Searching...',
              callId: 'call-1',
            } as unknown as IndividualToolCallDisplay,
          ],
        },
      ],
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('should render SVG snapshot for an empty slice following a search tool', async () => {
    const renderResult = await renderMainContentWithState({
      history: [],
      pendingHistoryItems: [
        {
          type: 'tool_group',
          tools: [
            {
              name: 'google_web_search',
              status: CoreToolCallStatus.Executing,
              resultDisplay: 'Searching...',
              callId: 'call-1',
            } as unknown as IndividualToolCallDisplay,
          ],
        },
        {
          type: 'tool_group',
          tools: [],
        },
      ],
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('should render SVG snapshot for a shell tool', async () => {
    const renderResult = await renderMainContentWithState({
      history: [],
      pendingHistoryItems: [
        {
          type: 'tool_group',
          tools: [
            {
              name: 'run_shell_command',
              status: CoreToolCallStatus.Executing,
              resultDisplay: 'Running command...',
              callId: 'call-1',
            } as unknown as IndividualToolCallDisplay,
          ],
        },
      ],
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });
});
