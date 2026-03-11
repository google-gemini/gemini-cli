/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { StreamingState } from '../../types.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SHELL_COMMAND_NAME,
  SHELL_FOCUS_HINT_DELAY_MS,
} from '../../constants.js';
import {
  type Config,
  type ToolResultDisplay,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';

vi.mock('../GeminiRespondingSpinner.js', () => ({
  GeminiRespondingSpinner: () => null,
}));

vi.mock('./ToolResultDisplay.js', () => ({
  ToolResultDisplay: () => null,
}));

describe('Focus Hint', () => {
  const mockConfig = {
    getEnableInteractiveShell: () => true,
  } as Config;

  const baseProps = {
    callId: 'tool-123',
    name: SHELL_COMMAND_NAME,
    description: 'A tool for testing',
    resultDisplay: undefined as ToolResultDisplay | undefined,
    status: CoreToolCallStatus.Executing,
    terminalWidth: 80,
    confirmationDetails: undefined,
    emphasis: 'medium' as const,
    isFirst: true,
    borderColor: 'green',
    borderDimColor: false,
    config: mockConfig,
    ptyId: 1,
    activeShellPtyId: 1,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const testCases = [
    { Component: ToolMessage, componentName: 'ToolMessage' },
    { Component: ShellToolMessage, componentName: 'ShellToolMessage' },
  ];

  describe.each(testCases)('$componentName', ({ Component }) => {
    it('shows focus hint after delay even with NO output', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Component {...baseProps} resultDisplay={undefined} />,
        { uiState: { streamingState: StreamingState.Idle } },
      );
      await waitUntilReady();

      // Initially, no focus hint
      expect(lastFrame()).toMatchSnapshot('initial-no-output');

      // Advance timers by the delay
      await act(async () => {
        vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
      });
      await waitUntilReady();

      // Now it SHOULD contain the focus hint
      expect(lastFrame()).toMatchSnapshot('after-delay-no-output');
      expect(lastFrame()).toContain('(Tab to focus)');
      unmount();
    });

    it('shows focus hint after delay with output', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Component {...baseProps} resultDisplay="Some output" />,
        { uiState: { streamingState: StreamingState.Idle } },
      );
      await waitUntilReady();

      // Initially, no focus hint
      expect(lastFrame()).toMatchSnapshot('initial-with-output');

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
      });
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot('after-delay-with-output');
      expect(lastFrame()).toContain('(Tab to focus)');
      unmount();
    });
  });

  it('handles long descriptions by shrinking them to show the focus hint', async () => {
    const longDescription = 'A'.repeat(100);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolMessage
        {...baseProps}
        description={longDescription}
        resultDisplay="output"
      />,
      { uiState: { streamingState: StreamingState.Idle } },
    );
    await waitUntilReady();

    await act(async () => {
      vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
    });
    await waitUntilReady();

    // The focus hint should be visible
    expect(lastFrame()).toMatchSnapshot('long-description');
    expect(lastFrame()).toContain('(Tab to focus)');
    // The name should still be visible
    expect(lastFrame()).toContain(SHELL_COMMAND_NAME);
    unmount();
  });
});
