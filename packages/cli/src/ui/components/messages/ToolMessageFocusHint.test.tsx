/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { ToolCallStatus, StreamingState } from '../../types.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SHELL_COMMAND_NAME,
  SHELL_FOCUS_HINT_DELAY_MS,
} from '../../constants.js';
import type { Config, ToolResultDisplay } from '@google/gemini-cli-core';

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
    status: ToolCallStatus.Executing,
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
      const { lastFrame } = renderWithProviders(
        <Component {...baseProps} resultDisplay={undefined} />,
        { uiState: { streamingState: StreamingState.Idle } },
      );

      // Initially, no focus hint
      expect(lastFrame()).toMatchSnapshot('initial-no-output');

      // Advance timers by the delay
      act(() => {
        vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
      });

      // Now it SHOULD contain the focus hint
      expect(lastFrame()).toMatchSnapshot('after-delay-no-output');
      expect(lastFrame()).toContain('(Tab to focus)');
    });

    it('shows focus hint after delay with output', async () => {
      const { lastFrame } = renderWithProviders(
        <Component {...baseProps} resultDisplay="Some output" />,
        { uiState: { streamingState: StreamingState.Idle } },
      );

      // Initially, no focus hint
      expect(lastFrame()).toMatchSnapshot('initial-with-output');

      // Advance timers
      act(() => {
        vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
      });

      expect(lastFrame()).toMatchSnapshot('after-delay-with-output');
      expect(lastFrame()).toContain('(Tab to focus)');
    });
  });

  it('handles long descriptions by shrinking them to show the focus hint', async () => {
    const longDescription = 'A'.repeat(100);
    const { lastFrame } = renderWithProviders(
      <ToolMessage
        {...baseProps}
        description={longDescription}
        resultDisplay="output"
      />,
      { uiState: { streamingState: StreamingState.Idle } },
    );

    act(() => {
      vi.advanceTimersByTime(SHELL_FOCUS_HINT_DELAY_MS + 100);
    });

    // The focus hint should be visible
    expect(lastFrame()).toMatchSnapshot('long-description');
    expect(lastFrame()).toContain('(Tab to focus)');
    // The name should still be visible
    expect(lastFrame()).toContain(SHELL_COMMAND_NAME);
  });
});
