/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { App } from './App.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import { StreamingState } from './types.js';

// Mock components to isolate App component testing
vi.mock('./components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
}));

vi.mock('./components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('./components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));

vi.mock('./components/QuittingDisplay.js', () => ({
  QuittingDisplay: () => <Text>QuittingDisplay</Text>,
}));

vi.mock('./components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));

// Base mock UI state for testing
const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    quittingMessages: null,
    streamingState: null,
    mainControlsRef: { current: null },
    dialogsVisible: false,

    // Add required properties for complete UIState
    history: [],
    pendingHistoryItems: [],
    isInputActive: true,
    buffer: '',
    inputWidth: 80,
    suggestionsWidth: 40,
    userMessages: [],
    slashCommands: [],
    commandContext: null,
    shellModeActive: false,
    isFocused: true,
    showAutoAcceptIndicator: false,
    messageQueue: [],
    showErrorDetails: false,
    errorCount: 0,
    filteredConsoleMessages: [],
    constrainHeight: false,
    mainAreaWidth: 80,
    staticAreaMaxItemHeight: 20,
    availableTerminalHeight: 40,
    historyRemountKey: 0,

    // Add more required state properties
    thought: '',
    currentLoadingPhrase: '',
    elapsedTime: 0,
    contextFileNames: [],
    ctrlCPressedOnce: false,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    ideContextState: null,
    geminiMdFileCount: 0,
    showToolDescriptions: false,

    // UI state flags
    debugMessage: '',
    corgiMode: false,
    branchName: undefined,
    nightly: false,
    isTrustedFolder: undefined,
    sessionStats: {
      lastPromptTokenCount: 0,
      sessionTokenCount: 0,
      totalPrompts: 0,
    },
    isEditorDialogOpen: false,

    ...overrides,
  }) as UIState;

describe('App Integration Tests', () => {
  describe('Normal Operation', () => {
    it('renders MainContent and Composer when not quitting and no dialogs visible', () => {
      const mockState = createMockUIState({
        quittingMessages: null,
        dialogsVisible: false,
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      const output = lastFrame();
      expect(output).toContain('MainContent');
      expect(output).toContain('Composer');
      expect(output).toContain('Notifications');
      expect(output).not.toContain('DialogManager');
      expect(output).not.toContain('QuittingDisplay');
    });

    it('renders MainContent and DialogManager when dialogs are visible', () => {
      const mockState = createMockUIState({
        quittingMessages: null,
        dialogsVisible: true,
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      const output = lastFrame();
      expect(output).toContain('MainContent');
      expect(output).toContain('DialogManager');
      expect(output).toContain('Notifications');
      expect(output).not.toContain('Composer');
      expect(output).not.toContain('QuittingDisplay');
    });

    it('renders QuittingDisplay when quitting messages are present', () => {
      const mockState = createMockUIState({
        quittingMessages: ['Shutting down...'],
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      const output = lastFrame();
      expect(output).toContain('QuittingDisplay');
      expect(output).not.toContain('MainContent');
      expect(output).not.toContain('Composer');
      expect(output).not.toContain('DialogManager');
      expect(output).not.toContain('Notifications');
    });
  });

  describe('StreamingContext Integration', () => {
    it('provides streaming state to children when not quitting', () => {
      const mockState = createMockUIState({
        streamingState: StreamingState.WaitingForConfirmation,
        quittingMessages: null,
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      // The App component should render normally with StreamingContext providing the state
      const output = lastFrame();
      expect(output).toContain('MainContent');
      expect(output).toContain('Composer');
    });

    it('does not provide streaming context when quitting', () => {
      const mockState = createMockUIState({
        streamingState: StreamingState.WaitingForConfirmation,
        quittingMessages: ['Exiting...'],
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      // When quitting, only QuittingDisplay should render
      const output = lastFrame();
      expect(output).toContain('QuittingDisplay');
      expect(output).not.toContain('MainContent');
    });
  });

  describe('Layout Structure', () => {
    it('renders components in correct layout structure', () => {
      const mockState = createMockUIState({
        quittingMessages: null,
        dialogsVisible: false,
      });

      const { lastFrame } = render(
        <UIStateContext.Provider value={mockState}>
          <App />
        </UIStateContext.Provider>,
      );

      // Verify the basic layout structure is present
      const output = lastFrame();
      expect(output).toMatchSnapshot();
    });
  });
});
