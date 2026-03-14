/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { StreamingState, type IndividualToolCallDisplay } from '../../types.js';
import { waitFor } from '../../../test-utils/async.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { useOverflowState } from '../../contexts/OverflowContext.js';

describe('ToolOverflowConsistencyChecks: ToolGroupMessage and ToolResultDisplay synchronization', () => {
  it('should ensure ToolGroupMessage correctly reports overflow to the global state in Alternate Buffer (ASB) mode', async () => {
    /**
     * Logic:
     * 1. availableTerminalHeight(13) - staticHeight(1) - ASB Reserved(6) = 6 lines per tool.
     * 2. 10 lines of output > 6 lines budget => hasOverflow should be TRUE.
     */

    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const resultDisplay = lines.join('\n');

    const toolCalls: IndividualToolCallDisplay[] = [
      {
        callId: 'call-1',
        name: 'test-tool',
        description: 'a test tool',
        status: CoreToolCallStatus.Success,
        resultDisplay,
        confirmationDetails: undefined,
      },
    ];

    let latestOverflowState: ReturnType<typeof useOverflowState>;
    const StateCapture = () => {
      latestOverflowState = useOverflowState();
      return null;
    };

    const { unmount, waitUntilReady } = renderWithProviders(
      <>
        <StateCapture />
        <ToolGroupMessage
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={13}
          terminalWidth={80}
          isExpandable={true}
        />
      </>,
      {
        uiState: {
          streamingState: StreamingState.Idle,
          constrainHeight: true,
        },
        useAlternateBuffer: true,
      },
    );

    await waitUntilReady();

    // To verify that the overflow state was indeed updated by the Scrollable component.
    await waitFor(() => {
      expect(latestOverflowState?.overflowingIds.size).toBeGreaterThan(0);
    });

    unmount();
  });

  it('should ensure ToolGroupMessage correctly reports overflow in Standard mode', async () => {
    /**
     * Logic:
     * 1. availableTerminalHeight(13) passed to ToolGroupMessage.
     * 2. ToolGroupMessage subtracts its static height (2) => 11 lines available for tools.
     * 3. ToolResultDisplay gets 11 lines, subtracts static height (1) and Standard Reserved (2) => 8 lines.
     * 4. 15 lines of output > 8 lines budget => hasOverflow should be TRUE.
     */

    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);
    const resultDisplay = lines.join('\n');

    const toolCalls: IndividualToolCallDisplay[] = [
      {
        callId: 'call-1',
        name: 'test-tool',
        description: 'a test tool',
        status: CoreToolCallStatus.Success,
        resultDisplay,
        confirmationDetails: undefined,
      },
    ];

    const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
      <ToolGroupMessage
        item={{ id: 1, type: 'tool_group', tools: toolCalls }}
        toolCalls={toolCalls}
        availableTerminalHeight={13}
        terminalWidth={80}
        isExpandable={true}
      />,
      {
        uiState: {
          streamingState: StreamingState.Idle,
          constrainHeight: true,
        },
        useAlternateBuffer: false,
      },
    );

    await waitUntilReady();

    // Verify truncation is occurring (standard mode uses MaxSizedBox)
    await waitFor(() => expect(lastFrame()).toContain('hidden (Ctrl+O'));

    unmount();
  });
});
