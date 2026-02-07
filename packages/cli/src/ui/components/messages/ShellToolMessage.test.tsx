/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import {
  ShellToolMessage,
  type ShellToolMessageProps,
} from './ShellToolMessage.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import type { Config } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHELL_TOOL_NAME } from '@google/gemini-cli-core';
import { SHELL_COMMAND_NAME, ACTIVE_SHELL_MAX_LINES } from '../../constants.js';

describe('<ShellToolMessage />', () => {
  const baseProps: ShellToolMessageProps = {
    callId: 'tool-123',
    name: SHELL_COMMAND_NAME,
    description: 'A shell command',
    resultDisplay: 'Test result',
    status: ToolCallStatus.Executing,
    terminalWidth: 80,
    confirmationDetails: undefined,
    emphasis: 'medium',
    isFirst: true,
    borderColor: 'green',
    borderDimColor: false,
    config: {
      getEnableInteractiveShell: () => true,
    } as unknown as Config,
  };

  const mockSetEmbeddedShellFocused = vi.fn();
  const uiActions = {
    setEmbeddedShellFocused: mockSetEmbeddedShellFocused,
  };

  // Helper to render with context
  const renderWithContext = (
    ui: React.ReactElement,
    streamingState: StreamingState,
  ) =>
    renderWithProviders(ui, {
      uiActions,
      uiState: { streamingState },
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('interactive shell focus', () => {
    it.each([
      ['SHELL_COMMAND_NAME', SHELL_COMMAND_NAME],
      ['SHELL_TOOL_NAME', SHELL_TOOL_NAME],
    ])('clicks inside the shell area sets focus for %s', async (_, name) => {
      const { stdin, lastFrame, simulateClick } = renderWithProviders(
        <ShellToolMessage {...baseProps} name={name} />,
        {
          mouseEventsEnabled: true,
          uiActions,
        },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A shell command');
      });

      await simulateClick(stdin, 2, 2);

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(true);
      });
    });

    it('resets focus when shell finishes', async () => {
      let updateStatus: (s: ToolCallStatus) => void = () => {};

      const Wrapper = () => {
        const [status, setStatus] = React.useState(ToolCallStatus.Executing);
        updateStatus = setStatus;
        return (
          <ShellToolMessage
            {...baseProps}
            status={status}
            embeddedShellFocused={true}
            activeShellPtyId={1}
            ptyId={1}
          />
        );
      };

      const { lastFrame } = renderWithContext(<Wrapper />, StreamingState.Idle);

      // Verify it is initially focused
      await waitFor(() => {
        expect(lastFrame()).toContain('(Focused)');
      });

      // Now update status to Success
      await act(async () => {
        updateStatus(ToolCallStatus.Success);
      });

      // Should call setEmbeddedShellFocused(false) because isThisShellFocused became false
      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Snapshots', () => {
    it.each([
      ['renders in Executing state', { status: ToolCallStatus.Executing }],
      [
        'renders in Success state (history mode)',
        { status: ToolCallStatus.Success },
      ],
      [
        'renders in Error state',
        { status: ToolCallStatus.Error, resultDisplay: 'Error output' },
      ],
      [
        'renders in Alternate Buffer mode while focused',
        {
          status: ToolCallStatus.Executing,
          embeddedShellFocused: true,
          activeShellPtyId: 1,
          ptyId: 1,
          useAlternateBuffer: true,
        },
      ],
      [
        'renders in Alternate Buffer mode while unfocused',
        {
          status: ToolCallStatus.Executing,
          embeddedShellFocused: false,
          activeShellPtyId: 1,
          ptyId: 1,
          useAlternateBuffer: true,
        },
      ],
    ])(
      '%s',
      async (
        _,
        props: Partial<ShellToolMessageProps> & {
          useAlternateBuffer?: boolean;
        },
      ) => {
        const { useAlternateBuffer, ...componentProps } = props;
        const { lastFrame } = renderWithProviders(
          <ShellToolMessage {...baseProps} {...componentProps} />,
          { uiActions, useAlternateBuffer },
        );
        await waitFor(() => {
          expect(lastFrame()).toMatchSnapshot();
        });
      },
    );
  });

  describe('Height Constraints', () => {
    it.each([
      [
        'respects availableTerminalHeight when it is smaller than ACTIVE_SHELL_MAX_LINES',
        { availableTerminalHeight: 10, expectedMaxLines: 8 },
      ],
      [
        'uses ACTIVE_SHELL_MAX_LINES when availableTerminalHeight is large',
        {
          availableTerminalHeight: 100,
          expectedMaxLines: ACTIVE_SHELL_MAX_LINES,
        },
      ],
    ])('%s', async (_, { availableTerminalHeight, expectedMaxLines }) => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage
          {...baseProps}
          resultDisplay={Array.from(
            { length: 50 },
            (_, i) => `Line ${i + 1}`,
          ).join('\n')}
          renderOutputAsMarkdown={false}
          availableTerminalHeight={availableTerminalHeight}
          activeShellPtyId={1}
          ptyId={2} // not focused
          status={ToolCallStatus.Executing}
        />,
        {
          uiActions,
          useAlternateBuffer: true,
        },
      );

      await waitFor(() => {
        const frame = lastFrame();
        const matches = frame!.match(/Line \d+/g);
        if (availableTerminalHeight < ACTIVE_SHELL_MAX_LINES) {
          expect(matches?.length).toBeLessThanOrEqual(expectedMaxLines);
          expect(matches?.length).toBeGreaterThan(0);
        } else {
          expect(matches?.length).toBe(expectedMaxLines);
        }
        expect(frame).toMatchSnapshot();
      });
    });
  });
});
