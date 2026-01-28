/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import type {
  ToolCallConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import {
  StreamingState,
  ToolCallStatus,
  type IndividualToolCallDisplay,
} from '../../types.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { waitFor } from '../../../test-utils/async.js';

vi.mock('../../contexts/ToolActionsContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../contexts/ToolActionsContext.js')
    >();
  return {
    ...actual,
    useToolActions: vi.fn(),
  };
});

describe('ToolConfirmationMessage Overflow', () => {
  const mockConfirm = vi.fn();
  vi.mocked(useToolActions).mockReturnValue({
    confirm: mockConfirm,
    cancel: vi.fn(),
    isDiffingEnabled: false,
  });

  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getMessageBus: () => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn(),
    }),
    isEventDrivenSchedulerEnabled: () => false,
    getTheme: () => ({
      status: { warning: 'yellow' },
      text: { primary: 'white', secondary: 'gray', link: 'blue' },
      border: { default: 'gray' },
      ui: { symbol: 'cyan' },
    }),
  } as unknown as Config;

  it('should display "press ctrl-o" hint when content overflows in ToolGroupMessage', async () => {
    // Large diff that will definitely overflow
    const diffLines = ['--- a/test.txt', '+++ b/test.txt', '@@ -1,20 +1,20 @@'];
    for (let i = 0; i < 50; i++) {
      diffLines.push(`+ line ${i + 1}`);
    }
    const fileDiff = diffLines.join('\n');

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff,
      originalContent: '',
      newContent: 'lots of lines',
      onConfirm: vi.fn(),
    };

    const toolCalls: IndividualToolCallDisplay[] = [
      {
        callId: 'test-call-id',
        name: 'test-tool',
        description: 'a test tool',
        status: ToolCallStatus.Confirming,
        confirmationDetails,
        resultDisplay: undefined,
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
        config: mockConfig,
        uiState: {
          streamingState: StreamingState.WaitingForConfirmation,
          constrainHeight: true,
        },
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
