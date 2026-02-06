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
import { SHELL_COMMAND_NAME } from '../../constants.js';

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
    const shellProps: ShellToolMessageProps = {
      ...baseProps,
    };

    it('clicks inside the shell area sets focus to true', async () => {
      const { stdin, lastFrame, simulateClick } = renderWithProviders(
        <ShellToolMessage {...shellProps} />,
        {
          mouseEventsEnabled: true,
          uiActions,
        },
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('A shell command'); // Wait for render
      });

      await simulateClick(stdin, 2, 2); // Click at column 2, row 2 (1-based)

      await waitFor(() => {
        expect(mockSetEmbeddedShellFocused).toHaveBeenCalledWith(true);
      });
    });

    it('handles focus for SHELL_TOOL_NAME (core shell tool)', async () => {
      const coreShellProps: ShellToolMessageProps = {
        ...shellProps,
        name: SHELL_TOOL_NAME,
      };

      const { stdin, lastFrame, simulateClick } = renderWithProviders(
        <ShellToolMessage {...coreShellProps} />,
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
            {...shellProps}
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
    it('renders in Executing state', async () => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage {...baseProps} status={ToolCallStatus.Executing} />,
        { uiActions },
      );
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('renders in Success state (history mode)', async () => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage {...baseProps} status={ToolCallStatus.Success} />,
        { uiActions },
      );
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('renders in Error state', async () => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage
          {...baseProps}
          status={ToolCallStatus.Error}
          resultDisplay="Error output"
        />,
        { uiActions },
      );
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('renders in Alternate Buffer mode while focused', async () => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage
          {...baseProps}
          status={ToolCallStatus.Executing}
          embeddedShellFocused={true}
          activeShellPtyId={1}
          ptyId={1}
        />,
        { uiActions, useAlternateBuffer: true },
      );
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });

    it('renders in Alternate Buffer mode while unfocused', async () => {
      const { lastFrame } = renderWithProviders(
        <ShellToolMessage
          {...baseProps}
          status={ToolCallStatus.Executing}
          embeddedShellFocused={false}
          activeShellPtyId={1}
          ptyId={1}
        />,
        { uiActions, useAlternateBuffer: true },
      );
      await waitFor(() => {
        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });
});
