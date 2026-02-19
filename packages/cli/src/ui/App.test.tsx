/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import type React from 'react';
import { renderWithProviders } from '../test-utils/render.js';
import { Text, useIsScreenReaderEnabled, type DOMElement } from 'ink';
import { App } from './App.js';
import { type UIState } from './contexts/UIStateContext.js';
import { StreamingState } from './types.js';
import { makeFakeConfig, CoreToolCallStatus } from '@google/gemini-cli-core';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

vi.mock('./components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));

vi.mock('./components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('./components/Notifications.js', async () => {
  const { Text, Box } = await import('ink');
  return {
    Notifications: () => (
      <Box>
        <Text>Notifications</Text>
      </Box>
    ),
  };
});

vi.mock('./components/QuittingDisplay.js', () => ({
  QuittingDisplay: () => <Text>Quitting...</Text>,
}));

vi.mock('./components/HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: () => <Text>HistoryItemDisplay</Text>,
}));

vi.mock('./components/Footer.js', async () => {
  const { Text, Box } = await import('ink');
  return {
    Footer: () => (
      <Box>
        <Text>Footer</Text>
      </Box>
    ),
  };
});

describe('App', () => {
  beforeEach(() => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);
  });

  const mockUIState: Partial<UIState> = {
    streamingState: StreamingState.Idle,
    cleanUiDetailsVisible: true,
    quittingMessages: null,
    dialogsVisible: false,
    mainControlsRef: {
      current: null,
    } as unknown as React.MutableRefObject<DOMElement | null>,
    rootUiRef: {
      current: null,
    } as unknown as React.MutableRefObject<DOMElement | null>,
    historyManager: {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    },
    history: [],
    pendingHistoryItems: [],
    pendingGeminiHistoryItems: [],
    bannerData: {
      defaultText: 'Mock Banner Text',
      warningText: '',
    },
    backgroundShells: new Map(),
  };

  it('should render main content and composer when not quitting', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: mockUIState,
        useAlternateBuffer: false,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
    unmount();
  });

  it('should render quitting display when quittingMessages is set', async () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
    } as UIState;

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: quittingUIState,
        useAlternateBuffer: false,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Quitting...');
    unmount();
  });

  it('should render full history in alternate buffer mode when quittingMessages is set', async () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
      history: [{ id: 1, type: 'user', text: 'history item' }],
      pendingHistoryItems: [{ type: 'user', text: 'pending item' }],
    } as UIState;

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: quittingUIState,
        useAlternateBuffer: true,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('HistoryItemDisplay');
    expect(lastFrame()).toContain('Quitting...');
    unmount();
  });

  it('should render dialog manager when dialogs are visible', async () => {
    const dialogUIState = {
      ...mockUIState,
      dialogsVisible: true,
    } as UIState;

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: dialogUIState,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('DialogManager');
    unmount();
  });

  it.each([
    { key: 'C', stateKey: 'ctrlCPressedOnce' },
    { key: 'D', stateKey: 'ctrlDPressedOnce' },
  ])(
    'should show Ctrl+$key exit prompt when dialogs are visible and $stateKey is true',
    async ({ key, stateKey }) => {
      const uiState = {
        ...mockUIState,
        dialogsVisible: true,
        [stateKey]: true,
      } as UIState;

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <App />,
        {
          uiState,
        },
      );
      await waitUntilReady();

      expect(lastFrame()).toContain(`Press Ctrl+${key} again to exit.`);
      unmount();
    },
  );

  it('should render ScreenReaderAppLayout when screen reader is enabled', async () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(true);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: mockUIState,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Footer');
    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Composer');
    unmount();
  });

  it('should render DefaultAppLayout when screen reader is not enabled', async () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: mockUIState,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
    unmount();
  });

  it('should render ToolConfirmationQueue along with Composer when tool is confirming and experiment is on', async () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const toolCalls = [
      {
        callId: 'call-1',
        name: 'ls',
        description: 'list directory',
        status: CoreToolCallStatus.AwaitingApproval,
        resultDisplay: '',
        confirmationDetails: {
          type: 'exec' as const,
          title: 'Confirm execution',
          command: 'ls',
          rootCommand: 'ls',
          rootCommands: ['ls'],
        },
      },
    ];

    const stateWithConfirmingTool = {
      ...mockUIState,
      pendingHistoryItems: [
        {
          type: 'tool_group',
          tools: toolCalls,
        },
      ],
      pendingGeminiHistoryItems: [
        {
          type: 'tool_group',
          tools: toolCalls,
        },
      ],
    } as UIState;

    const configWithExperiment = makeFakeConfig();
    vi.spyOn(configWithExperiment, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(configWithExperiment, 'getIdeMode').mockReturnValue(false);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <App />,
      {
        uiState: stateWithConfirmingTool,
        config: configWithExperiment,
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Action Required'); // From ToolConfirmationQueue
    expect(lastFrame()).toContain('Composer');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  describe('Snapshots', () => {
    it('renders default layout correctly', async () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(false);
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <App />,
        {
          uiState: mockUIState,
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders screen reader layout correctly', async () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(true);
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <App />,
        {
          uiState: mockUIState,
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders with dialogs visible', async () => {
      const dialogUIState = {
        ...mockUIState,
        dialogsVisible: true,
      } as UIState;
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <App />,
        {
          uiState: dialogUIState,
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
