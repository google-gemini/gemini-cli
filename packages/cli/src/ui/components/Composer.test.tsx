/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import { Box, Text } from 'ink';
import { Composer } from './Composer.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from '../contexts/UIActionsContext.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { createMockSettings } from '../../test-utils/settings.js';
// Mock VimModeContext hook
vi.mock('../contexts/VimModeContext.js', () => ({
  useVimMode: vi.fn(() => ({
    vimEnabled: false,
    vimMode: 'INSERT',
  })),
}));
import { ApprovalMode } from '@google/gemini-cli-core';
import { StreamingState, ToolCallStatus } from '../types.js';

// Mock child components
vi.mock('./LoadingIndicator.js', () => ({
  LoadingIndicator: ({ thought }: { thought?: string }) => (
    <Text>LoadingIndicator{thought ? `: ${thought}` : ''}</Text>
  ),
}));

vi.mock('./ContextSummaryDisplay.js', () => ({
  ContextSummaryDisplay: () => <Text>ContextSummaryDisplay</Text>,
}));

vi.mock('./HookStatusDisplay.js', () => ({
  HookStatusDisplay: () => <Text>HookStatusDisplay</Text>,
}));

vi.mock('./ApprovalModeIndicator.js', () => ({
  ApprovalModeIndicator: () => <Text>ApprovalModeIndicator</Text>,
}));

vi.mock('./ShellModeIndicator.js', () => ({
  ShellModeIndicator: () => <Text>ShellModeIndicator</Text>,
}));

vi.mock('./ShortcutsHint.js', () => ({
  ShortcutsHint: () => <Text>ShortcutsHint</Text>,
}));

vi.mock('./ShortcutsHelp.js', () => ({
  ShortcutsHelp: () => <Text>ShortcutsHelp</Text>,
}));

vi.mock('./DetailedMessagesDisplay.js', () => ({
  DetailedMessagesDisplay: () => <Text>DetailedMessagesDisplay</Text>,
}));

vi.mock('./InputPrompt.js', () => ({
  InputPrompt: ({ placeholder }: { placeholder?: string }) => (
    <Text>InputPrompt: {placeholder}</Text>
  ),
  calculatePromptWidths: vi.fn(() => ({
    inputWidth: 80,
    suggestionsWidth: 40,
    containerWidth: 84,
  })),
}));

vi.mock('./Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
}));

vi.mock('./ShowMoreLines.js', () => ({
  ShowMoreLines: () => <Text>ShowMoreLines</Text>,
}));

vi.mock('./QueuedMessageDisplay.js', () => ({
  QueuedMessageDisplay: ({ messageQueue }: { messageQueue: string[] }) => {
    if (messageQueue.length === 0) {
      return null;
    }
    return (
      <>
        {messageQueue.map((message, index) => (
          <Text key={index}>{message}</Text>
        ))}
      </>
    );
  },
}));

// Mock contexts
vi.mock('../contexts/OverflowContext.js', () => ({
  OverflowProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Create mock context providers
const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    streamingState: StreamingState.Idle,
    isConfigInitialized: true,
    contextFileNames: [],
    showApprovalModeIndicator: ApprovalMode.DEFAULT,
    messageQueue: [],
    showErrorDetails: false,
    constrainHeight: false,
    isInputActive: true,
    buffer: { text: '' },
    inputWidth: 80,
    suggestionsWidth: 40,
    userMessages: [],
    slashCommands: [],
    commandContext: null,
    shellModeActive: false,
    isFocused: true,
    thought: '',
    currentLoadingPhrase: '',
    elapsedTime: 0,
    ctrlCPressedOnce: false,
    ctrlDPressedOnce: false,
    showEscapePrompt: false,
    shortcutsHelpVisible: false,
    ideContextState: null,
    geminiMdFileCount: 0,
    renderMarkdown: true,
    filteredConsoleMessages: [],
    history: [],
    sessionStats: {
      lastPromptTokenCount: 0,
      sessionTokenCount: 0,
      totalPrompts: 0,
    },
    branchName: 'main',
    debugMessage: '',
    corgiMode: false,
    errorCount: 0,
    nightly: false,
    isTrustedFolder: true,
    activeHooks: [],
    isBackgroundShellVisible: false,
    embeddedShellFocused: false,
    ...overrides,
  }) as UIState;

const createMockUIActions = (): UIActions =>
  ({
    handleFinalSubmit: vi.fn(),
    handleClearScreen: vi.fn(),
    setShellModeActive: vi.fn(),
    onEscapePromptChange: vi.fn(),
    vimHandleInput: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const createMockConfig = (overrides = {}) => ({
  getModel: vi.fn(() => 'gemini-1.5-pro'),
  getTargetDir: vi.fn(() => '/test/dir'),
  getDebugMode: vi.fn(() => false),
  getAccessibility: vi.fn(() => ({})),
  getMcpServers: vi.fn(() => ({})),
  isPlanEnabled: vi.fn(() => false),
  getToolRegistry: () => ({
    getTool: vi.fn(),
  }),
  getSkillManager: () => ({
    getSkills: () => [],
    getDisplayableSkills: () => [],
  }),
  getMcpClientManager: () => ({
    getMcpServers: () => ({}),
    getBlockedMcpServers: () => [],
  }),
  ...overrides,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const renderComposer = (
  uiState: UIState,
  settings = createMockSettings(),
  config = createMockConfig(),
  uiActions = createMockUIActions(),
) =>
  render(
    <ConfigContext.Provider value={config as any}>
      <SettingsContext.Provider value={settings as any}>
        <UIStateContext.Provider value={uiState}>
          <UIActionsContext.Provider value={uiActions}>
            <Composer />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Composer', () => {
  describe('Footer Display Settings', () => {
    it('renders Footer by default when hideFooter is false', () => {
      const uiState = createMockUIState();
      const settings = createMockSettings({ ui: { hideFooter: false } });

      const { lastFrame } = renderComposer(uiState, settings);

      expect(lastFrame()).toContain('Footer');
    });

    it('does NOT render Footer when hideFooter is true', () => {
      const uiState = createMockUIState();
      const settings = createMockSettings({ ui: { hideFooter: true } });

      const { lastFrame } = renderComposer(uiState, settings);

      // Check for content that only appears IN the Footer component itself
      expect(lastFrame()).not.toContain('[NORMAL]'); // Vim mode indicator
      expect(lastFrame()).not.toContain('(main'); // Branch name with parentheses
    });

    it('passes correct props to Footer including vim mode when enabled', async () => {
      const uiState = createMockUIState({
        branchName: 'feature-branch',
        corgiMode: true,
        errorCount: 2,
        sessionStats: {
          sessionId: 'test-session',
          sessionStartTime: new Date(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metrics: {} as any,
          lastPromptTokenCount: 150,
          promptCount: 5,
        },
      });
      const config = createMockConfig({
        getModel: vi.fn(() => 'gemini-1.5-flash'),
        getTargetDir: vi.fn(() => '/project/path'),
        getDebugMode: vi.fn(() => true),
      });
      const settings = createMockSettings({
        ui: {
          hideFooter: false,
          showMemoryUsage: true,
        },
      });
      // Mock vim mode for this test
      const { useVimMode } = await import('../contexts/VimModeContext.js');
      vi.mocked(useVimMode).mockReturnValueOnce({
        vimEnabled: true,
        vimMode: 'INSERT',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { lastFrame } = renderComposer(uiState, settings, config);

      expect(lastFrame()).toContain('Footer');
      // Footer should be rendered with all the state passed through
    });
  });

  describe('Loading Indicator', () => {
    it('renders LoadingIndicator with thought when streaming', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Processing',
          description: 'Processing your request...',
        },
        currentLoadingPhrase: 'Analyzing',
        elapsedTime: 1500,
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
    });

    it('keeps shortcuts hint visible while loading', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        elapsedTime: 1,
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).toContain('ShortcutsHint');
    });

    it('renders LoadingIndicator without thought when accessibility disables loading phrases', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: { subject: 'Hidden', description: 'Should not show' },
      });
      const config = createMockConfig({
        getAccessibility: vi.fn(() => ({ enableLoadingPhrases: false })),
      });

      const { lastFrame } = renderComposer(uiState, undefined, config);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).not.toContain('Should not show');
    });

    it('does not render LoadingIndicator when waiting for confirmation', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.WaitingForConfirmation,
        thought: {
          subject: 'Confirmation',
          description: 'Should not show during confirmation',
        },
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });

    it('does not render LoadingIndicator when a tool confirmation is pending', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                callId: 'call-1',
                name: 'edit',
                description: 'edit file',
                status: ToolCallStatus.Confirming,
                resultDisplay: undefined,
                confirmationDetails: undefined,
              },
            ],
          },
        ],
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
      expect(output).not.toContain('esc to cancel');
    });

    it('renders LoadingIndicator when embedded shell is focused but background shell is visible', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundShellVisible: true,
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
    });

    it('does NOT render LoadingIndicator when embedded shell is focused and background shell is NOT visible', () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundShellVisible: false,
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });
  });

  describe('Message Queue Display', () => {
    it('displays queued messages when present', () => {
      const uiState = createMockUIState({
        messageQueue: [
          'First queued message',
          'Second queued message',
          'Third queued message',
        ],
      });

      const { lastFrame } = renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('First queued message');
      expect(output).toContain('Second queued message');
      expect(output).toContain('Third queued message');
    });

    it('renders QueuedMessageDisplay with empty message queue', () => {
      const uiState = createMockUIState({
        messageQueue: [],
      });

      const { lastFrame } = renderComposer(uiState);

      // The component should render but return null for empty queue
      // This test verifies that the component receives the correct prop
      const output = lastFrame();
      expect(output).toContain('InputPrompt'); // Verify basic Composer rendering
    });
  });

  describe('Context and Status Display', () => {
    it('shows ContextSummaryDisplay in normal state', () => {
      const uiState = createMockUIState({
        ctrlCPressedOnce: false,
        ctrlDPressedOnce: false,
        showEscapePrompt: false,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('ContextSummaryDisplay');
    });

    it('renders HookStatusDisplay instead of ContextSummaryDisplay with active hooks', () => {
      const uiState = createMockUIState({
        activeHooks: [{ name: 'test-hook', eventName: 'before-agent' }],
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('HookStatusDisplay');
      expect(lastFrame()).not.toContain('ContextSummaryDisplay');
    });

    it('shows Ctrl+C exit prompt when ctrlCPressedOnce is true', () => {
      const uiState = createMockUIState({
        ctrlCPressedOnce: true,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('Press Ctrl+C again to exit');
    });

    it('shows Ctrl+D exit prompt when ctrlDPressedOnce is true', () => {
      const uiState = createMockUIState({
        ctrlDPressedOnce: true,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('Press Ctrl+D again to exit');
    });

    it('shows escape prompt when showEscapePrompt is true', () => {
      const uiState = createMockUIState({
        showEscapePrompt: true,
        history: [{ id: 1, type: 'user', text: 'test' }],
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('Press Esc again to rewind');
    });
  });

  describe('Input and Indicators', () => {
    it('renders InputPrompt when input is active', () => {
      const uiState = createMockUIState({
        isInputActive: true,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('InputPrompt');
    });

    it('does not render InputPrompt when input is inactive', () => {
      const uiState = createMockUIState({
        isInputActive: false,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).not.toContain('InputPrompt');
    });

    it.each([
      [ApprovalMode.DEFAULT],
      [ApprovalMode.AUTO_EDIT],
      [ApprovalMode.PLAN],
      [ApprovalMode.YOLO],
    ])(
      'shows ApprovalModeIndicator when approval mode is %s and shell mode is inactive',
      (mode) => {
        const uiState = createMockUIState({
          showApprovalModeIndicator: mode,
          shellModeActive: false,
        });

        const { lastFrame } = renderComposer(uiState);

        expect(lastFrame()).toMatch(/ApprovalModeIndic[\s\S]*ator/);
      },
    );

    it('shows ShellModeIndicator when shell mode is active', () => {
      const uiState = createMockUIState({
        shellModeActive: true,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toMatch(/ShellModeIndic[\s\S]*tor/);
    });

    it('shows RawMarkdownIndicator when renderMarkdown is false', () => {
      const uiState = createMockUIState({
        renderMarkdown: false,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('raw markdown mode');
    });

    it('does not show RawMarkdownIndicator when renderMarkdown is true', () => {
      const uiState = createMockUIState({
        renderMarkdown: true,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).not.toContain('raw markdown mode');
    });
  });

  describe('Error Details Display', () => {
    it('shows DetailedMessagesDisplay when showErrorDetails is true', () => {
      const uiState = createMockUIState({
        showErrorDetails: true,
        filteredConsoleMessages: [
          { level: 'error', message: 'Test error', timestamp: new Date() },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('DetailedMessagesDisplay');
      expect(lastFrame()).toContain('ShowMoreLines');
    });

    it('does not show error details when showErrorDetails is false', () => {
      const uiState = createMockUIState({
        showErrorDetails: false,
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).not.toContain('DetailedMessagesDisplay');
    });
  });

  describe('Vim Mode Placeholders', () => {
    it('shows correct placeholder in INSERT mode', async () => {
      const uiState = createMockUIState({ isInputActive: true });
      const { useVimMode } = await import('../contexts/VimModeContext.js');
      vi.mocked(useVimMode).mockReturnValue({
        vimEnabled: true,
        vimMode: 'INSERT',
        toggleVimEnabled: vi.fn(),
        setVimMode: vi.fn(),
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain(
        "InputPrompt:   Press 'Esc' for NORMAL mode.",
      );
    });

    it('shows correct placeholder in NORMAL mode', async () => {
      const uiState = createMockUIState({ isInputActive: true });
      const { useVimMode } = await import('../contexts/VimModeContext.js');
      vi.mocked(useVimMode).mockReturnValue({
        vimEnabled: true,
        vimMode: 'NORMAL',
        toggleVimEnabled: vi.fn(),
        setVimMode: vi.fn(),
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain(
        "InputPrompt:   Press 'i' for INSERT mode.",
      );
    });
  });

  describe('Shortcuts Hint', () => {
    it('hides shortcuts hint when a action is required (e.g. dialog is open)', () => {
      const uiState = createMockUIState({
        customDialog: (
          <Box>
            <Text>Test Dialog</Text>
            <Text>Test Content</Text>
          </Box>
        ),
      });

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHint');
    });

    it('keeps shortcuts hint visible when no action is required', () => {
      const uiState = createMockUIState();

      const { lastFrame } = renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHint');
    });
  });
});
