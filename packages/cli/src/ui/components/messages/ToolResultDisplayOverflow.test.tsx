/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type AnsiOutput,
  CoreToolCallStatus,
  SHELL_COMMAND_NAME,
} from '@google/gemini-cli-core';
import {
  StreamingState,
  type IndividualToolCallDisplay,
} from '../../types.js';
import { waitFor } from '../../../test-utils/async.js';

// Mock UIStateContext partially
const mockUseUIState = vi.fn();
vi.mock('../../contexts/UIStateContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../contexts/UIStateContext.js')>();
  return {
    ...actual,
    useUIState: () => mockUseUIState(),
  };
});

// Mock useAlternateBuffer
const mockUseAlternateBuffer = vi.fn();
vi.mock('../../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: () => mockUseAlternateBuffer(),
}));

describe('ToolResultDisplay Overflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUIState.mockReturnValue({ renderMarkdown: true });
    mockUseAlternateBuffer.mockReturnValue(false);
  });

  it('shows the head of the content when overflowDirection is bottom (string)', async () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={content}
        terminalWidth={80}
        maxLines={3}
        overflowDirection="bottom"
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).not.toContain('Line 3'); // Line 3 is replaced by the "hidden" label
    expect(output).not.toContain('Line 4');
    expect(output).not.toContain('Line 5');
    expect(output).toContain('hidden');
    unmount();
  });

  it('shows the tail of the content when overflowDirection is top (string default)', async () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={content}
        terminalWidth={80}
        maxLines={3}
        overflowDirection="top"
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).not.toContain('Line 1');
    expect(output).not.toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).toContain('Line 4');
    expect(output).toContain('Line 5');
    expect(output).toContain('hidden');
    unmount();
  });

  it('shows the head of the content when overflowDirection is bottom (ANSI)', async () => {
    const ansiResult: AnsiOutput = Array.from({ length: 5 }, (_, i) => [
      {
        text: `Line ${i + 1}`,
        fg: '',
        bg: '',
        bold: false,
        italic: false,
        underline: false,
        dim: false,
        inverse: false,
      },
    ]);
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolResultDisplay
        resultDisplay={ansiResult}
        terminalWidth={80}
        maxLines={3}
        overflowDirection="bottom"
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
    expect(output).not.toContain('Line 3');
    expect(output).not.toContain('Line 4');
    expect(output).not.toContain('Line 5');
    expect(output).toContain('hidden');
    unmount();
  });

  it('shows "Press CTRL+O to show more lines" hint in ASB mode with overflow', async () => {
    const resultDisplay = Array.from(
      { length: 50 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');

    const toolCalls: IndividualToolCallDisplay[] = [
      {
        callId: 'call-1',
        name: SHELL_COMMAND_NAME,
        description: 'a test tool',
        status: CoreToolCallStatus.Success,
        resultDisplay,
        confirmationDetails: undefined,
      },
    ];

    mockUseAlternateBuffer.mockReturnValue(true);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolGroupMessage
        item={{ id: 1, type: 'tool_group', tools: toolCalls }}
        toolCalls={toolCalls}
        availableTerminalHeight={15} // Small height to force overflow
        terminalWidth={80}
        isExpandable={true}
      />,
      {
        uiState: {
          streamingState: StreamingState.Idle,
          constrainHeight: true,
        },
        useAlternateBuffer: true,
      },
    );

    await waitUntilReady();

    // In ASB mode the overflow hint can render before the scroll position
    // settles. Wait for both the hint and the tail of the content so this
    // snapshot is deterministic across slower CI runners.
    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toBeDefined();
      expect(frame?.toLowerCase()).toContain('press ctrl+o to show more lines');
      expect(frame).toContain('Line 50');
    });

    unmount();
  });
});
