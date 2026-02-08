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

  const LONG_OUTPUT = Array.from(
    { length: 100 },
    (_, i) => `Line ${i + 1}`,
  ).join('\n');

  const mockSetEmbeddedShellFocused = vi.fn();
  const uiActions = {
    setEmbeddedShellFocused: mockSetEmbeddedShellFocused,
  };

  const renderShell = (
    props: Partial<ShellToolMessageProps> = {},
    options: Parameters<typeof renderWithProviders>[1] = {},
  ) =>
    renderWithProviders(<ShellToolMessage {...baseProps} {...props} />, {
      uiActions,
      ...options,
    });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('interactive shell focus', () => {
    it.each([
      ['SHELL_COMMAND_NAME', SHELL_COMMAND_NAME],
      ['SHELL_TOOL_NAME', SHELL_TOOL_NAME],
    ])('clicks inside the shell area sets focus for %s', async (_, name) => {
      const { stdin, lastFrame, simulateClick } = renderShell(
        { name },
        { mouseEventsEnabled: true },
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

      const { lastFrame } = renderWithProviders(<Wrapper />, {
        uiActions,
        uiState: { streamingState: StreamingState.Idle },
      });

      // Verify it is initially focused
      await waitFor(() => {
        expect(lastFrame()).toContain('(Shift+Tab to unfocus)');
      });

      // Now update status to Success
      await act(async () => {
        updateStatus(ToolCallStatus.Success);
      });

      // Should call setEmbeddedShellFocused(false) because isThisShellFocused became false
      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(false);
        expect(lastFrame()).not.toContain('(Shift+Tab to unfocus)');
      });
    });
  });

  describe('Snapshots', () => {
    it.each([
      [
        'renders in Executing state',
        { status: ToolCallStatus.Executing },
        undefined,
      ],
      [
        'renders in Success state (history mode)',
        { status: ToolCallStatus.Success },
        undefined,
      ],
      [
        'renders in Error state',
        { status: ToolCallStatus.Error, resultDisplay: 'Error output' },
        undefined,
      ],
      [
        'renders in Alternate Buffer mode while focused',
        {
          status: ToolCallStatus.Executing,
          embeddedShellFocused: true,
          activeShellPtyId: 1,
          ptyId: 1,
        },
        { useAlternateBuffer: true },
      ],
      [
        'renders in Alternate Buffer mode while unfocused',
        {
          status: ToolCallStatus.Executing,
          embeddedShellFocused: false,
          activeShellPtyId: 1,
          ptyId: 1,
        },
        { useAlternateBuffer: true },
      ],
    ])('%s', async (_, props, options) => {
      const { lastFrame } = renderShell(props, options);
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });

  describe('Height Constraints', () => {
    it.each([
      [
        'respects availableTerminalHeight when it is smaller than ACTIVE_SHELL_MAX_LINES',
        10,
        8,
        false,
      ],
      [
        'uses ACTIVE_SHELL_MAX_LINES when availableTerminalHeight is large',
        100,
        ACTIVE_SHELL_MAX_LINES,
        false,
      ],
      [
        'uses full availableTerminalHeight when focused in alternate buffer mode',
        100,
        98, // 100 - 2
        true,
      ],
      [
        'defaults to ACTIVE_SHELL_MAX_LINES when availableTerminalHeight is undefined',
        undefined,
        ACTIVE_SHELL_MAX_LINES,
        false,
      ],
    ])('%s', async (_, availableTerminalHeight, expectedMaxLines, focused) => {
      const { lastFrame } = renderShell(
        {
          resultDisplay: LONG_OUTPUT,
          renderOutputAsMarkdown: false,
          availableTerminalHeight,
          activeShellPtyId: 1,
          ptyId: focused ? 1 : 2,
          status: ToolCallStatus.Executing,
          embeddedShellFocused: focused,
        },
        { useAlternateBuffer: true },
      );

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame!.match(/Line \d+/g)?.length).toBe(expectedMaxLines);
        expect(frame).toMatchSnapshot();
      });
    });
  });
});
