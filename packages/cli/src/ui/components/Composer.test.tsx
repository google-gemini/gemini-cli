/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import { Box, Text } from 'ink';
import { useEffect } from 'react';
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
import {
  ApprovalMode,
  tokenLimit,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';
import { TransientMessageType } from '../../utils/events.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';

const composerTestControls = vi.hoisted(() => ({
  suggestionsVisible: false,
  isAlternateBuffer: false,
}));

// Mock child components
vi.mock('./LoadingIndicator.js', () => ({
  LoadingIndicator: ({
    thought,
    thoughtLabel,
  }: {
    thought?: { subject?: string } | string;
    thoughtLabel?: string;
  }) => {
    const fallbackText =
      typeof thought === 'string' ? thought : thought?.subject;
    const text = thoughtLabel ?? fallbackText;
    return <Text>LoadingIndicator{text ? `: ${text}` : ''}</Text>;
  },
}));

vi.mock('./StatusDisplay.js', () => ({
  StatusDisplay: () => <Text>StatusDisplay</Text>,
}));

vi.mock('./ToastDisplay.js', () => ({
  ToastDisplay: () => <Text>ToastDisplay</Text>,
  shouldShowToast: (uiState: UIState) =>
    uiState.ctrlCPressedOnce ||
    Boolean(uiState.transientMessage) ||
    uiState.ctrlDPressedOnce ||
    (uiState.showEscapePrompt &&
      (uiState.buffer.text.length > 0 || uiState.history.length > 0)) ||
    Boolean(uiState.queueErrorMessage),
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
  InputPrompt: ({
    placeholder,
    onSuggestionsVisibilityChange,
  }: {
    placeholder?: string;
    onSuggestionsVisibilityChange?: (visible: boolean) => void;
  }) => {
    useEffect(() => {
      onSuggestionsVisibilityChange?.(composerTestControls.suggestionsVisible);
    }, [onSuggestionsVisibilityChange]);

    return <Text>InputPrompt: {placeholder}</Text>;
  },
  calculatePromptWidths: vi.fn(() => ({
    inputWidth: 80,
    suggestionsWidth: 40,
    containerWidth: 84,
  })),
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => composerTestControls.isAlternateBuffer,
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
    cleanUiDetailsVisible: true,
    ideContextState: null,
    geminiMdFileCount: 0,
    renderMarkdown: true,
    filteredConsoleMessages: [],
    history: [],
    sessionStats: {
      sessionId: 'test-session',
      sessionStartTime: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics: {} as any,
      lastPromptTokenCount: 0,
      promptCount: 0,
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
    quota: {
      userTier: undefined,
      stats: undefined,
      proQuotaRequest: null,
      validationRequest: null,
    },
    ...overrides,
  }) as UIState;

const createMockUIActions = (): UIActions =>
  ({
    handleFinalSubmit: vi.fn(),
    handleClearScreen: vi.fn(),
    setShellModeActive: vi.fn(),
    setCleanUiDetailsVisible: vi.fn(),
    toggleCleanUiDetailsVisible: vi.fn(),
    revealCleanUiDetailsTemporarily: vi.fn(),
    onEscapePromptChange: vi.fn(),
    vimHandleInput: vi.fn(),
    setShortcutsHelpVisible: vi.fn(),
  }) as Partial<UIActions> as UIActions;

const createMockConfig = (overrides = {}): Config =>
  ({
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
  }) as unknown as Config;

const renderComposer = async (
  uiState: UIState,
  settings = createMockSettings(),
  config = createMockConfig(),
  uiActions = createMockUIActions(),
) => {
  const result = render(
    <ConfigContext.Provider value={config as unknown as Config}>
      <SettingsContext.Provider value={settings as unknown as LoadedSettings}>
        <UIStateContext.Provider value={uiState}>
          <UIActionsContext.Provider value={uiActions}>
            <Composer />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
  await result.waitUntilReady();
  return result;
};

describe('Composer', () => {
  beforeEach(() => {
    composerTestControls.suggestionsVisible = false;
    composerTestControls.isAlternateBuffer = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Footer Display Settings', () => {
    it('renders Footer by default when hideFooter is false', async () => {
      const uiState = createMockUIState();
      const settings = createMockSettings({ ui: { hideFooter: false } });

      const { lastFrame } = await renderComposer(uiState, settings);

      expect(lastFrame()).toContain('Footer');
    });

    it('does NOT render Footer when hideFooter is true', async () => {
      const uiState = createMockUIState();
      const settings = createMockSettings({ ui: { hideFooter: true } });

      const { lastFrame } = await renderComposer(uiState, settings);

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
          metrics: {
            models: {},
            tools: {},
            files: {},
          } as SessionMetrics,
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
        toggleVimEnabled: vi.fn(),
        setVimMode: vi.fn(),
      } as unknown as ReturnType<typeof useVimMode>);

      const { lastFrame } = await renderComposer(uiState, settings, config);

      expect(lastFrame()).toContain('Footer');
      // Footer should be rendered with all the state passed through
    });
  });

  describe('Loading Indicator', () => {
    it('renders LoadingIndicator with thought when streaming', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Processing',
          description: 'Processing your request...',
        },
        currentLoadingPhrase: 'Analyzing',
        elapsedTime: 1500,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator: Processing');
    });

    it('renders generic thinking text in loading indicator when full inline thinking is enabled', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Detailed in-history thought',
          description: 'Full text is already in history',
        },
      });
      const settings = createMockSettings({
        ui: { inlineThinkingMode: 'full' },
      });

      const { lastFrame } = await renderComposer(uiState, settings);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator: Thinking ...');
    });

    it('hides shortcuts hint while loading', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        elapsedTime: 1,
        cleanUiDetailsVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).not.toContain('ShortcutsHint');
    });

    it('renders LoadingIndicator without thought when loadingPhrases is off', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: { subject: 'Hidden', description: 'Should not show' },
      });
      const settings = createMockSettings({
        merged: { ui: { loadingPhrases: 'off' } },
      });

      const { lastFrame } = await renderComposer(uiState, settings);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).not.toContain('Should not show');
    });

    it('does not render LoadingIndicator when waiting for confirmation', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.WaitingForConfirmation,
        thought: {
          subject: 'Confirmation',
          description: 'Should not show during confirmation',
        },
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });

    it('does not render LoadingIndicator when a tool confirmation is pending', async () => {
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
                status: CoreToolCallStatus.AwaitingApproval,
                resultDisplay: undefined,
                confirmationDetails: undefined,
              },
            ],
          },
        ],
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
      expect(output).not.toContain('esc to cancel');
    });

    it('renders LoadingIndicator when embedded shell is focused but background shell is visible', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundShellVisible: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
    });

    it('renders both LoadingIndicator and ApprovalModeIndicator when streaming in full UI mode', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Thinking',
          description: '',
        },
        showApprovalModeIndicator: ApprovalMode.PLAN,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('LoadingIndicator: Thinking');
      expect(output).toContain('ApprovalModeIndicator');
    });

    it('does NOT render LoadingIndicator when embedded shell is focused and background shell is NOT visible', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        embeddedShellFocused: true,
        isBackgroundShellVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).not.toContain('LoadingIndicator');
    });
  });

  describe('Message Queue Display', () => {
    it('displays queued messages when present', async () => {
      const uiState = createMockUIState({
        messageQueue: [
          'First queued message',
          'Second queued message',
          'Third queued message',
        ],
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('First queued message');
      expect(output).toContain('Second queued message');
      expect(output).toContain('Third queued message');
    });

    it('renders QueuedMessageDisplay with empty message queue', async () => {
      const uiState = createMockUIState({
        messageQueue: [],
      });

      const { lastFrame } = await renderComposer(uiState);

      // The component should render but return null for empty queue
      // This test verifies that the component receives the correct prop
      const output = lastFrame();
      expect(output).toContain('InputPrompt'); // Verify basic Composer rendering
    });
  });

  describe('Context and Status Display', () => {
    it('shows StatusDisplay and ApprovalModeIndicator in normal state', async () => {
      const uiState = createMockUIState({
        ctrlCPressedOnce: false,
        ctrlDPressedOnce: false,
        showEscapePrompt: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('StatusDisplay');
      expect(output).toContain('ApprovalModeIndicator');
      expect(output).not.toContain('ToastDisplay');
    });

    it('shows ToastDisplay and hides ApprovalModeIndicator when a toast is present', async () => {
      const uiState = createMockUIState({
        ctrlCPressedOnce: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('ToastDisplay');
      expect(output).not.toContain('ApprovalModeIndicator');
      expect(output).toContain('StatusDisplay');
    });

    it('shows ToastDisplay for other toast types', async () => {
      const uiState = createMockUIState({
        transientMessage: {
          text: 'Warning',
          type: TransientMessageType.Warning,
        },
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('ToastDisplay');
      expect(output).not.toContain('ApprovalModeIndicator');
    });
  });

  describe('Input and Indicators', () => {
    it('hides non-essential UI details in clean mode', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      const output = lastFrame();
      expect(output).toContain('ShortcutsHint');
      expect(output).toContain('InputPrompt');
      expect(output).not.toContain('Footer');
      expect(output).not.toContain('ApprovalModeIndicator');
      expect(output).not.toContain('ContextSummaryDisplay');
    });

    it('renders InputPrompt when input is active', async () => {
      const uiState = createMockUIState({
        isInputActive: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('InputPrompt');
    });

    it('does not render InputPrompt when input is inactive', async () => {
      const uiState = createMockUIState({
        isInputActive: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('InputPrompt');
    });

    it.each([
      [ApprovalMode.DEFAULT],
      [ApprovalMode.AUTO_EDIT],
      [ApprovalMode.PLAN],
      [ApprovalMode.YOLO],
    ])(
      'shows ApprovalModeIndicator when approval mode is %s and shell mode is inactive',
      async (mode) => {
        const uiState = createMockUIState({
          showApprovalModeIndicator: mode,
          shellModeActive: false,
        });

        const { lastFrame } = await renderComposer(uiState);

        expect(lastFrame()).toMatch(/ApprovalModeIndic[\s\S]*ator/);
      },
    );

    it('shows ShellModeIndicator when shell mode is active', async () => {
      const uiState = createMockUIState({
        shellModeActive: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toMatch(/ShellModeIndic[\s\S]*tor/);
    });

    it('shows RawMarkdownIndicator when renderMarkdown is false', async () => {
      const uiState = createMockUIState({
        renderMarkdown: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('raw markdown mode');
    });

    it('does not show RawMarkdownIndicator when renderMarkdown is true', async () => {
      const uiState = createMockUIState({
        renderMarkdown: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('raw markdown mode');
    });

    it.each([
      [ApprovalMode.YOLO, 'YOLO'],
      [ApprovalMode.PLAN, 'plan'],
      [ApprovalMode.AUTO_EDIT, 'auto edit'],
    ])(
      'shows minimal mode badge "%s" when clean UI details are hidden',
      async (mode, label) => {
        const uiState = createMockUIState({
          cleanUiDetailsVisible: false,
          showApprovalModeIndicator: mode,
        });

        const { lastFrame } = await renderComposer(uiState);
        expect(lastFrame()).toContain(label);
      },
    );

    it('hides minimal mode badge while loading in clean mode', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        streamingState: StreamingState.Responding,
        elapsedTime: 1,
        showApprovalModeIndicator: ApprovalMode.PLAN,
      });

      const { lastFrame } = await renderComposer(uiState);
      const output = lastFrame();
      expect(output).toContain('LoadingIndicator');
      expect(output).not.toContain('plan');
      expect(output).not.toContain('ShortcutsHint');
    });

    it('hides minimal mode badge while action-required state is active', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        showApprovalModeIndicator: ApprovalMode.PLAN,
        customDialog: (
          <Box>
            <Text>Prompt</Text>
          </Box>
        ),
      });

      const { lastFrame } = await renderComposer(uiState);
      const output = lastFrame();
      expect(output).not.toContain('plan');
      expect(output).not.toContain('ShortcutsHint');
    });

    it('shows Esc rewind prompt in minimal mode without showing full UI', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        showEscapePrompt: true,
        history: [{ id: 1, type: 'user', text: 'msg' }],
      });

      const { lastFrame } = await renderComposer(uiState);
      const output = lastFrame();
      expect(output).toContain('ToastDisplay');
      expect(output).not.toContain('ContextSummaryDisplay');
    });

    it('shows context usage bleed-through when over 60%', async () => {
      const model = 'gemini-2.5-pro';
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        currentModel: model,
        sessionStats: {
          sessionId: 'test-session',
          sessionStartTime: new Date(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metrics: {} as any,
          lastPromptTokenCount: Math.floor(tokenLimit(model) * 0.7),
          promptCount: 0,
        },
      });
      const settings = createMockSettings({
        ui: {
          footer: { hideContextPercentage: false },
        },
      });

      const { lastFrame } = await renderComposer(uiState, settings);
      expect(lastFrame()).toContain('%');
    });
  });

  describe('Error Details Display', () => {
    it('shows DetailedMessagesDisplay when showErrorDetails is true', async () => {
      const uiState = createMockUIState({
        showErrorDetails: true,
        filteredConsoleMessages: [
          {
            type: 'error',
            content: 'Test error',
            count: 1,
          },
        ],
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('DetailedMessagesDisplay');
      expect(lastFrame()).toContain('ShowMoreLines');
    });

    it('does not show error details when showErrorDetails is false', async () => {
      const uiState = createMockUIState({
        showErrorDetails: false,
      });

      const { lastFrame } = await renderComposer(uiState);

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

      const { lastFrame } = await renderComposer(uiState);

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

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain(
        "InputPrompt:   Press 'i' for INSERT mode.",
      );
    });
  });

  describe('Shortcuts Hint', () => {
    it('hides shortcuts hint when showShortcutsHint setting is false', async () => {
      const uiState = createMockUIState();
      const settings = createMockSettings({
        ui: {
          showShortcutsHint: false,
        },
      });

      const { lastFrame } = await renderComposer(uiState, settings);

      expect(lastFrame()).not.toContain('ShortcutsHint');
    });

    it('hides shortcuts hint when a action is required (e.g. dialog is open)', async () => {
      const uiState = createMockUIState({
        customDialog: (
          <Box>
            <Text>Test Dialog</Text>
            <Text>Test Content</Text>
          </Box>
        ),
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHint');
    });

    it('keeps shortcuts hint visible when no action is required', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHint');
    });

    it('shows shortcuts hint when full UI details are visible', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHint');
    });

    it('hides shortcuts hint while loading in minimal mode', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        streamingState: StreamingState.Responding,
        elapsedTime: 1,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHint');
    });

    it('shows shortcuts help in minimal mode when toggled on', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        shortcutsHelpVisible: true,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHelp');
    });

    it('hides shortcuts hint when suggestions are visible above input in alternate buffer', async () => {
      composerTestControls.isAlternateBuffer = true;
      composerTestControls.suggestionsVisible = true;

      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        showApprovalModeIndicator: ApprovalMode.PLAN,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHint');
      expect(lastFrame()).not.toContain('plan');
    });

    it('hides approval mode indicator when suggestions are visible above input in alternate buffer', async () => {
      composerTestControls.isAlternateBuffer = true;
      composerTestControls.suggestionsVisible = true;

      const uiState = createMockUIState({
        cleanUiDetailsVisible: true,
        showApprovalModeIndicator: ApprovalMode.YOLO,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ApprovalModeIndicator');
    });

    it('keeps shortcuts hint when suggestions are visible below input in regular buffer', async () => {
      composerTestControls.isAlternateBuffer = false;
      composerTestControls.suggestionsVisible = true;

      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHint');
    });
  });

  describe('Shortcuts Help', () => {
    it('shows shortcuts help in passive state', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        streamingState: StreamingState.Idle,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).toContain('ShortcutsHelp');
    });

    it('hides shortcuts help while streaming', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        streamingState: StreamingState.Responding,
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHelp');
    });

    it('hides shortcuts help when action is required', async () => {
      const uiState = createMockUIState({
        shortcutsHelpVisible: true,
        customDialog: (
          <Box>
            <Text>Dialog content</Text>
          </Box>
        ),
      });

      const { lastFrame } = await renderComposer(uiState);

      expect(lastFrame()).not.toContain('ShortcutsHelp');
    });
  });

  describe('Snapshots', () => {
    it('matches snapshot in idle state', async () => {
      const uiState = createMockUIState();
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot while streaming', async () => {
      const uiState = createMockUIState({
        streamingState: StreamingState.Responding,
        thought: {
          subject: 'Thinking',
          description: 'Thinking about the meaning of life...',
        },
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in narrow view', async () => {
      const uiState = createMockUIState({
        terminalWidth: 40,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in minimal UI mode', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('matches snapshot in minimal UI mode while loading', async () => {
      const uiState = createMockUIState({
        cleanUiDetailsVisible: false,
        streamingState: StreamingState.Responding,
        elapsedTime: 1000,
      });
      const { lastFrame } = await renderComposer(uiState);
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
