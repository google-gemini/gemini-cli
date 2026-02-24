/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { StreamingState, type IndividualToolCallDisplay } from '../../types.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { waitFor } from '../../../test-utils/async.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

describe('ToolOverflowConsistencyChecks: ToolGroupMessage and ToolResultDisplay synchronization', () => {
  it('should ensure explicit hasOverflow calculation is consistent with ToolResultDisplay truncation in Alternate Buffer (ASB) mode', async () => {
    /**
     * Logic:
     * 1. availableTerminalHeight(13) - staticHeight(3) = 10 lines per tool.
     * 2. ASB mode reserves 1 + 6 = 7 lines.
     * 3. Line budget = 10 - 7 = 3 lines.
     * 4. 5 lines of output > 3 lines budget => hasOverflow should be TRUE.
     */

    const lines = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`);
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

    const { lastFrame } = renderWithProviders(
      <OverflowProvider>
        <ToolGroupMessage
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={13}
          terminalWidth={80}
          isExpandable={true}
        />
      </OverflowProvider>,
      {
        uiState: {
          streamingState: StreamingState.Idle,
          constrainHeight: true,
        },
        useAlternateBuffer: true,
      },
    );

    // In ASB mode, the hint should appear because hasOverflow is now correctly calculated.
    await waitFor(() =>
      expect(lastFrame()?.toLowerCase()).toContain(
        'press ctrl+o to show more lines',
      ),
    );
  });

  it('should ensure explicit hasOverflow calculation is consistent with ToolResultDisplay truncation in Standard mode', async () => {
    /**
     * Logic:
     * 1. availableTerminalHeight(13) - staticHeight(3) = 10 lines per tool.
     * 2. Standard mode reserves 1 + 2 = 3 lines.
     * 3. Line budget = 10 - 3 = 7 lines.
     * 4. 9 lines of output > 7 lines budget => hasOverflow should be TRUE.
     */

    const lines = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`);
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

    const { lastFrame } = renderWithProviders(
      <OverflowProvider>
        <ToolGroupMessage
          item={{ id: 1, type: 'tool_group', tools: toolCalls }}
          toolCalls={toolCalls}
          availableTerminalHeight={13}
          terminalWidth={80}
          isExpandable={true}
        />
      </OverflowProvider>,
      {
        uiState: {
          streamingState: StreamingState.Idle,
          constrainHeight: true,
        },
        useAlternateBuffer: false,
      },
    );

    // Verify truncation is occurring (standard mode uses MaxSizedBox)
    await waitFor(() => expect(lastFrame()).toContain('hidden ...'));

    // In Standard mode, ToolGroupMessage calculates hasOverflow correctly now.
    // While Standard mode doesn't render the inline hint (ShowMoreLines returns null),
    // the logic inside ToolGroupMessage is now synchronized.
  });
});
