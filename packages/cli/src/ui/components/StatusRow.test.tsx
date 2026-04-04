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
import { type TextBuffer } from '../components/shared/text-buffer.js';
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
    buffer: { text: '' } as unknown as TextBuffer,
    sessionStats: { lastPromptTokenCount: 0 } as unknown as SessionStatsState,
    shortcutsHelpVisible: false,
    contextFileNames: [],
    showApprovalModeIndicator: ApprovalMode.DEFAULT,
    allowPlanMode: false,
    shellModeActive: false,
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
});
