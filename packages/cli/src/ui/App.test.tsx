/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { App } from './App.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import { StreamingState } from './types.js';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

vi.mock('./components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
}));

vi.mock('./components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));

vi.mock('./components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('./components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));

vi.mock('./components/QuittingDisplay.js', () => ({
  QuittingDisplay: () => <Text>Quitting...</Text>,
}));

vi.mock('./components/Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
}));

describe('App', () => {
  const mockUIState: Partial<UIState> = {
    streamingState: StreamingState.Idle,
    quittingMessages: null,
    dialogsVisible: false,
    mainControlsRef: { current: null },
    historyManager: {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    },
  };

  it('should render main content and composer when not quitting', () => {
    const { lastFrame } = render(
      <UIStateContext.Provider value={mockUIState as UIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('Composer');
  });

  it('should render quitting display when quittingMessages is set', () => {
    const quittingUIState = {
      ...mockUIState,
      quittingMessages: [{ id: 1, type: 'user', text: 'test' }],
    } as UIState;

    const { lastFrame } = render(
      <UIStateContext.Provider value={quittingUIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('Quitting...');
  });

  it('should render dialog manager when dialogs are visible', () => {
    const dialogUIState = {
      ...mockUIState,
      dialogsVisible: true,
    } as UIState;

    const { lastFrame } = render(
      <UIStateContext.Provider value={dialogUIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Notifications');
    expect(lastFrame()).toContain('DialogManager');
  });

  it('should show Ctrl+C exit prompt when dialogs are visible and ctrlCPressedOnce is true', () => {
    const ctrlCUIState = {
      ...mockUIState,
      dialogsVisible: true,
      ctrlCPressedOnce: true,
    } as UIState;

    const { lastFrame } = render(
      <UIStateContext.Provider value={ctrlCUIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('Press Ctrl+C again to exit.');
  });

  it('should show Ctrl+D exit prompt when dialogs are visible and ctrlDPressedOnce is true', () => {
    const ctrlDUIState = {
      ...mockUIState,
      dialogsVisible: true,
      ctrlDPressedOnce: true,
    } as UIState;

    const { lastFrame } = render(
      <UIStateContext.Provider value={ctrlDUIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('Press Ctrl+D again to exit.');
  });

  it('should render ScreenReaderAppLayout when screen reader is enabled', () => {
    (useIsScreenReaderEnabled as vi.Mock).mockReturnValue(true);

    const { lastFrame } = render(
      <UIStateContext.Provider value={mockUIState as UIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain(
      'Notifications\nFooter\nMainContent\nComposer',
    );
  });

  it('should render DefaultAppLayout when screen reader is not enabled', () => {
    (useIsScreenReaderEnabled as vi.Mock).mockReturnValue(false);

    const { lastFrame } = render(
      <UIStateContext.Provider value={mockUIState as UIState}>
        <App />
      </UIStateContext.Provider>,
    );

    expect(lastFrame()).toContain('MainContent\nNotifications\nComposer');
  });
});
