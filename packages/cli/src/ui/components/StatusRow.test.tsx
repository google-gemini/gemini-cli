/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { StatusRow } from './StatusRow.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useComposerStatus } from '../hooks/useComposerStatus.js';
import { type UIState } from '../contexts/UIStateContext.js';

import { type SessionStatsState } from '../contexts/SessionContext.js';
import { type ThoughtSummary } from '../types.js';
import { ApprovalMode } from '@google/gemini-cli-core';

vi.mock('../hooks/useComposerStatus.js', () => ({
  useComposerStatus: vi.fn(),
}));

describe('<StatusRow />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultUiState: Partial<UIState> = {
    currentTip: undefined,
    thought: null,
    elapsedTime: 0,
    currentWittyPhrase: undefined,
    activeHooks: [],
    sessionStats: { lastPromptTokenCount: 0 } as unknown as SessionStatsState,
    shortcutsHelpVisible: false,
    contextFileNames: [],
    showApprovalModeIndicator: ApprovalMode.DEFAULT,
    allowPlanMode: false,
    renderMarkdown: true,
    currentModel: 'gemini-3',
  };

  it('renders status and tip correctly when they both fit', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      currentTip: 'Test Tip',
      thought: { subject: 'Thinking...' } as unknown as ThoughtSummary,
      elapsedTime: 5,
      currentWittyPhrase: 'I am witty',
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Thinking...');
    expect(output).toContain('I am witty');
    expect(output).toContain('Tip: Test Tip');
  });

  it('renders correctly when interactive shell is waiting', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: true,
      showLoadingIndicator: false,
      showTips: false,
      showWit: false,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={true}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState: defaultUiState,
      },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('! Shell awaiting input (Tab to focus)');
  });

  it('renders tip with absolute positioning when it fits but might collide (verification of container logic)', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      currentTip: 'Test Tip',
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('Tip: Test Tip');
  });

  it('renders retry status phrase from uiState when retrying connection', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      statusPhrase: 'Trying to reach gemini-2.5-flash (Attempt 1/5)',
      elapsedTime: 5,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Trying to reach gemini-2.5-flash (Attempt 1/5)');
    expect(output).not.toContain('Thinking...');
  });

  it('prioritizes retry status over thought subject when thought is present', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      statusPhrase: 'Trying to reach gemini-2.5-flash (Attempt 1/5)',
      thought: { subject: 'Thinking...' } as unknown as ThoughtSummary,
      elapsedTime: 5,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Trying to reach gemini-2.5-flash (Attempt 1/5)');
    expect(output).not.toContain('Thinking...');
  });

  it('renders statusPhrase passed directly via props', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
        statusPhrase="Trying to reach gemini-2.5-pro (Attempt 2/3)"
      />,
      {
        width: 100,
        uiState: defaultUiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Trying to reach gemini-2.5-pro (Attempt 2/3)');
  });

  it('renders generic retry phrase in low error verbosity mode when attempt threshold is met', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: true,
      showWit: true,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      statusPhrase: "This is taking a bit longer, we're still on it.",
      elapsedTime: 8,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain("This is taking a bit longer, we're still on it.");
  });

  it('renders active hook status and does not crash when active hooks are present', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: false,
      showWit: false,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      activeHooks: [
        {
          name: 'linter',
          eventName: 'before-command',
          source: 'user',
        },
      ],
      elapsedTime: 2,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={true}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Executing Hook: linter');
  });

  it('renders retry status correctly in narrow terminal mode', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: true,
      showTips: false,
      showWit: false,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      statusPhrase: 'Trying to reach gemini-2.5-flash (Attempt 1/5)',
      elapsedTime: 3,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={true}
        terminalWidth={60}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 60,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Trying to reach gemini-2.5-flash (Attempt 1/5)');
  });

  it('renders statusPhrase even when showLoadingIndicator is false', async () => {
    (useComposerStatus as Mock).mockReturnValue({
      isInteractiveShellWaiting: false,
      showLoadingIndicator: false,
      showTips: false,
      showWit: false,
      modeContentObj: null,
      showMinimalContext: false,
    });

    const uiState: Partial<UIState> = {
      ...defaultUiState,
      statusPhrase: 'Trying to reach gemini-2.5-flash (Attempt 2/5)',
      elapsedTime: 4,
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <StatusRow
        showUiDetails={false}
        isNarrow={false}
        terminalWidth={100}
        hideContextSummary={false}
        hideUiDetailsForSuggestions={false}
        hasPendingActionRequired={false}
      />,
      {
        width: 100,
        uiState,
      },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Trying to reach gemini-2.5-flash (Attempt 2/5)');
  });
});
