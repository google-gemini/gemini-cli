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
import { StreamingState } from '../../types.js';
import {
  type Config,
  SHELL_TOOL_NAME,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHELL_COMMAND_NAME, ACTIVE_SHELL_MAX_LINES } from '../../constants.js';

describe('<ShellToolMessage />', () => {
  const baseProps: ShellToolMessageProps = {
    callId: 'tool-123',
    name: SHELL_COMMAND_NAME,
    description: 'A shell command',
    resultDisplay: 'Test result',
    status: CoreToolCallStatus.Executing,
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
      const { lastFrame, simulateClick } = renderShell(
        { name },
        { mouseEventsEnabled: true },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A shell command');
      });

      await simulateClick(2, 2);

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(true);
      });
    });
    it('resets focus when shell finishes', async () => {
      let updateStatus: (s: CoreToolCallStatus) => void = () => {};

      const Wrapper = () => {
        const [status, setStatus] = React.useState(
          CoreToolCallStatus.Executing,
        );
        updateStatus = setStatus;
        return <ShellToolMessage {...baseProps} status={status} ptyId={1} />;
      };

      const { lastFrame } = renderWithProviders(<Wrapper />, {
        uiActions,
        uiState: {
          streamingState: StreamingState.Idle,
          embeddedShellFocused: true,
          activePtyId: 1,
        },
      });

      // Verify it is initially focused
      await waitFor(() => {
        expect(lastFrame()).toContain('(Shift+Tab to unfocus)');
      });

      // Now update status to Success
      await act(async () => {
        updateStatus(CoreToolCallStatus.Success);
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
        { status: CoreToolCallStatus.Executing },
        undefined,
      ],
      [
        'renders in Success state (history mode)',
        { status: CoreToolCallStatus.Success },
        undefined,
      ],
      [
        'renders in Error state',
        { status: CoreToolCallStatus.Error, resultDisplay: 'Error output' },
        undefined,
      ],
      [
        'renders in Alternate Buffer mode while focused',
        {
          status: CoreToolCallStatus.Executing,
          ptyId: 1,
        },
        {
          useAlternateBuffer: true,
          uiState: {
            embeddedShellFocused: true,
            activePtyId: 1,
          },
        },
      ],
      [
        'renders in Alternate Buffer mode while unfocused',
        {
          status: CoreToolCallStatus.Executing,
          ptyId: 1,
        },
        {
          useAlternateBuffer: true,
          uiState: {
            embeddedShellFocused: false,
            activePtyId: 1,
          },
        },
      ],
    ])('%s', async (_, props, options) => {
      const { lastFrame, waitUntilReady } = renderShell(props, options);
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
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
        'defaults to ACTIVE_SHELL_MAX_LINES in alternate buffer when availableTerminalHeight is undefined',
        undefined,
        ACTIVE_SHELL_MAX_LINES,
        false,
      ],
    ])('%s', async (_, availableTerminalHeight, expectedMaxLines, focused) => {
      const { lastFrame, waitUntilReady } = renderShell(
        {
          resultDisplay: LONG_OUTPUT,
          renderOutputAsMarkdown: false,
          availableTerminalHeight,
          ptyId: 1,
          status: CoreToolCallStatus.Executing,
        },
        {
          useAlternateBuffer: true,
          uiState: {
            activePtyId: focused ? 1 : 2,
            embeddedShellFocused: focused,
          },
        },
      );

      await waitUntilReady();
      const frame = lastFrame();
      expect(frame.match(/Line \d+/g)?.length).toBe(expectedMaxLines);
      expect(frame).toMatchSnapshot();
    });

    it('fully expands in standard mode when availableTerminalHeight is undefined', async () => {
      const { lastFrame } = renderShell(
        {
          resultDisplay: LONG_OUTPUT,
          renderOutputAsMarkdown: false,
          availableTerminalHeight: undefined,
          status: CoreToolCallStatus.Executing,
        },
        { useAlternateBuffer: false },
      );

      await waitFor(() => {
        const frame = lastFrame();
        // Should show all 100 lines
        expect(frame.match(/Line \d+/g)?.length).toBe(100);
      });
    });

    it('fully expands in alternate buffer mode when constrainHeight is false and isExpandable is true', async () => {
      const { lastFrame, waitUntilReady } = renderShell(
        {
          resultDisplay: LONG_OUTPUT,
          renderOutputAsMarkdown: false,
          availableTerminalHeight: undefined,
          status: CoreToolCallStatus.Success,
          isExpandable: true,
        },
        {
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: false,
          },
        },
      );

      await waitUntilReady();
      await waitFor(() => {
        const frame = lastFrame();
        // Should show all 100 lines because constrainHeight is false and isExpandable is true
        expect(frame.match(/Line \d+/g)?.length).toBe(100);
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('stays constrained in alternate buffer mode when isExpandable is false even if constrainHeight is false', async () => {
      const { lastFrame, waitUntilReady } = renderShell(
        {
          resultDisplay: LONG_OUTPUT,
          renderOutputAsMarkdown: false,
          availableTerminalHeight: undefined,
          status: CoreToolCallStatus.Success,
          isExpandable: false,
        },
        {
          useAlternateBuffer: true,
          uiState: {
            constrainHeight: false,
          },
        },
      );

      await waitUntilReady();
      await waitFor(() => {
        const frame = lastFrame();
        // Should still be constrained to ACTIVE_SHELL_MAX_LINES (15) because isExpandable is false
        expect(frame.match(/Line \d+/g)?.length).toBe(15);
      });
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
