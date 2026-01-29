/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import type React from 'react';
import { renderWithProviders } from '../test-utils/render.js';
import { Text, useIsScreenReaderEnabled, type DOMElement } from 'ink';
import { App } from './App.js';
import { type UIState } from './contexts/UIStateContext.js';
import { StreamingState, ToolCallStatus } from './types.js';
import { makeFakeConfig } from '@google/gemini-cli-core';

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
  };

  it('should render main content and composer when not quitting', () => {
    const { lastFrame } = renderWithProviders(<App />, {
      uiState: mockUIState,
      useAlternateBuffer: false,
    });

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
  });

  it('should render quitting display when quittingMessages is set', () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
    } as UIState;

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: quittingUIState,
      useAlternateBuffer: false,
    });

    expect(lastFrame()).toContain('Quitting...');
  });

  it('should render full history in alternate buffer mode when quittingMessages is set', () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
      history: [{ id: 1, type: 'user', text: 'history item' }],
      pendingHistoryItems: [{ type: 'user', text: 'pending item' }],
    } as UIState;

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: quittingUIState,
      useAlternateBuffer: true,
    });

    expect(lastFrame()).toContain('HistoryItemDisplay');
    expect(lastFrame()).toContain('Quitting...');
  });

  it('should render dialog manager when dialogs are visible', () => {
    const dialogUIState = {
      ...mockUIState,
      dialogsVisible: true,
    } as UIState;

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: dialogUIState,
    });

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('DialogManager');
  });

  it.each([
    { key: 'C', stateKey: 'ctrlCPressedOnce' },
    { key: 'D', stateKey: 'ctrlDPressedOnce' },
  ])(
    'should show Ctrl+$key exit prompt when dialogs are visible and $stateKey is true',
    ({ key, stateKey }) => {
      const uiState = {
        ...mockUIState,
        dialogsVisible: true,
        [stateKey]: true,
      } as UIState;

      const { lastFrame } = renderWithProviders(<App />, {
        uiState,
      });

      expect(lastFrame()).toContain(`Press Ctrl+${key} again to exit.`);
    },
  );

  it('should render ScreenReaderAppLayout when screen reader is enabled', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(true);

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: mockUIState,
    });

    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Footer');
    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Composer');
  });

  it('should render DefaultAppLayout when screen reader is not enabled', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: mockUIState,
    });

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
  });

  it('should render ToolConfirmationQueue along with Composer when tool is confirming and experiment is on', () => {
    (useIsScreenReaderEnabled as Mock).mockReturnValue(false);

    const toolCalls = [
      {
        callId: 'call-1',
        name: 'ls',
        description: 'list directory',
        status: ToolCallStatus.Confirming,
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
      pendingHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
      pendingGeminiHistoryItems: [{ type: 'tool_group', tools: toolCalls }],
    } as UIState;

    const configWithExperiment = makeFakeConfig();
    vi.spyOn(
      configWithExperiment,
      'isEventDrivenSchedulerEnabled',
    ).mockReturnValue(true);
    vi.spyOn(configWithExperiment, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(configWithExperiment, 'getIdeMode').mockReturnValue(false);

    const { lastFrame } = renderWithProviders(<App />, {
      uiState: stateWithConfirmingTool,
      config: configWithExperiment,
    });

    expect(lastFrame()).toContain('Tips for getting started');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Action Required'); // From ToolConfirmationQueue
    expect(lastFrame()).toContain('Composer');
    expect(lastFrame()).toMatchSnapshot();
  });

  describe('Snapshots', () => {
    it('renders default layout correctly', () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(false);
      const { lastFrame } = renderWithProviders(<App />, {
        uiState: mockUIState,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders screen reader layout correctly', () => {
      (useIsScreenReaderEnabled as Mock).mockReturnValue(true);
      const { lastFrame } = renderWithProviders(<App />, {
        uiState: mockUIState,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders with dialogs visible', () => {
      const dialogUIState = {
        ...mockUIState,
        dialogsVisible: true,
      } as UIState;
      const { lastFrame } = renderWithProviders(<App />, {
        uiState: dialogUIState,
      });
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
