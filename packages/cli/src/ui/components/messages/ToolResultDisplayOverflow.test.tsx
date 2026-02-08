/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  StreamingState,
  ToolCallStatus,
  type IndividualToolCallDisplay,
} from '../../types.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { waitFor } from '../../../test-utils/async.js';

describe('ToolResultDisplay Overflow', () => {
  it('should display "press ctrl-o" hint when content overflows in ToolGroupMessage', async () => {
    // Large output that will definitely overflow
    const lines = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`line ${i + 1}`);
    }
    const resultDisplay = lines.join('\n');

    const toolCalls: IndividualToolCallDisplay[] = [
      {
        callId: 'call-1',
        name: 'test-tool',
        description: 'a test tool',
        status: ToolCallStatus.Success,
        resultDisplay,
        confirmationDetails: undefined,
      },
    ];

    const { lastFrame } = renderWithProviders(
      <OverflowProvider>
        <ToolGroupMessage
          groupId={1}
          toolCalls={toolCalls}
          availableTerminalHeight={15} // Small height to force overflow
          terminalWidth={80}
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

    // ResizeObserver might take a tick
    await waitFor(() =>
      expect(lastFrame()).toContain('Press ctrl-o to show more lines'),
    );

    const frame = lastFrame();
    expect(frame).toBeDefined();
    if (frame) {
      expect(frame).toContain('Press ctrl-o to show more lines');
      // Ensure it's AFTER the bottom border
      const linesOfOutput = frame.split('\n');
      const bottomBorderIndex = linesOfOutput.findLastIndex((l) =>
        l.includes('╰─'),
      );
      const hintIndex = linesOfOutput.findIndex((l) =>
        l.includes('Press ctrl-o to show more lines'),
      );
      expect(hintIndex).toBeGreaterThan(bottomBorderIndex);
      expect(frame).toMatchSnapshot();
    }
  });
});
