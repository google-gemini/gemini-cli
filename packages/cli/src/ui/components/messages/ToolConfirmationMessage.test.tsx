/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type {
  ToolCallConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { ToolConfirmationOutcome } from '@google/gemini-cli-core';
import {
  renderWithProviders,
  createMockSettings,
} from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { act } from 'react';

describe('ToolConfirmationMessage', () => {
  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow providing feedback', async () => {
    const onConfirm = vi.fn();
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm,
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    // Initial state check
    expect(lastFrame()).toContain('Provide feedback (f)');

    // Focus feedback item
    await act(async () => {
      stdin.write('f');
    });

    await act(async () => {
      stdin.write('Use lower case');
    });
    await waitFor(() => {
      // Placeholder disappears, only input visible
      expect(lastFrame()).toContain('● 3. Use lower case');
    });
    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(ToolConfirmationOutcome.Feedback, {
        feedback: 'Use lower case',
      });
    });
  });

  it('should expand feedback box height when input is multi-line', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={40} // Narrow width to force wrapping
      />,
    );

    // Focus feedback item
    await act(async () => {
      stdin.write('f');
    });

    // Type long feedback that will wrap
    const longFeedback =
      'This is a very long feedback message that should definitely wrap into multiple lines given the narrow width of the terminal.';
    await act(async () => {
      stdin.write(longFeedback);
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('This is a very long feedback');
      expect(frame).toContain('message that should');
      expect(frame).toContain('definitely wrap into multiple');
    });
  });

  it('should clear feedback buffer when pressing f', async () => {
    const onConfirm = vi.fn();
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm,
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={100}
      />,
    );

    await act(async () => {
      stdin.write('f');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('● 3. Provide feedback (f)');
    });

    await act(async () => {
      stdin.write('clearme');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('clearme');
    });

    // Move away
    await act(async () => {
      stdin.write('\u001B[A'); // Up arrow
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('● 2. Allow for this session');
    });

    // Come back with 'f'
    await act(async () => {
      stdin.write('f');
    });

    // Should be cleared and focused
    await waitFor(() => {
      expect(lastFrame()).toContain('● 3. Provide feedback (f)');
      expect(lastFrame()).not.toContain('clearme');
    });
  });

  it('should not auto-submit when selecting the feedback option', async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm,
    };

    const { stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={100}
      />,
    );

    // Press 'f' to focus feedback
    await act(async () => {
      stdin.write('f');
    });

    // Advance timers and ensure no async calls happen
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onConfirm).not.toHaveBeenCalled();

    // Press '3' (the number for feedback in this untrusted config)
    // Wait, in mockConfig isTrustedFolder returns true, so feedback is at index 2 (number 3).
    await act(async () => {
      stdin.write('3');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await waitFor(() => {
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it('should restrict navigation when feedback input is focused', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={100}
      />,
    );

    // Focus feedback item
    await act(async () => {
      stdin.write('f');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('● 3. Provide feedback (f)');
    });

    // Try numeric navigation (should be ignored and typed instead)
    await act(async () => {
      stdin.write('1');
    });
    await waitFor(() => {
      // Placeholder should disappear, only input '1' remains
      expect(lastFrame()).toContain('● 3. 1');
    });

    // Try 'j'/'k' navigation (should be ignored)
    await act(async () => {
      stdin.write('k');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('● 3. 1');
    });

    // Try up arrow (should work)
    await act(async () => {
      stdin.write('\u001B[A'); // Up arrow
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('● 2. Allow for this session');
    });
  });

  it('should not reset feedback buffer when pressing f while already focused', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={100}
      />,
    );

    // Focus and type something containing 'f'
    await act(async () => {
      stdin.write('f');
    });
    await act(async () => {
      stdin.write('fix');
    });
    await waitFor(() => {
      expect(lastFrame()).toContain('fix');
    });

    // Press 'f' again
    await act(async () => {
      stdin.write('f');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('fixf');
    });
  });

  it('should not display urls if prompt and url are the same', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should display urls if prompt and url are different', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt:
        'fetch https://github.com/google/gemini-react/blob/main/README.md',
      urls: [
        'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  describe('with folder trust', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };

    const execConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const infoConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const mcpConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
      onConfirm: vi.fn(),
    };

    describe.each([
      {
        description: 'for edit confirmations',
        details: editConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for exec confirmations',
        details: execConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for info confirmations',
        details: infoConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for mcp confirmations',
        details: mcpConfirmationDetails,
        alwaysAllowText: 'always allow',
      },
    ])('$description', ({ details }) => {
      it('should show "allow always" when folder is trusted', () => {
        const mockConfig = {
          isTrustedFolder: () => true,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
      });

      it('should NOT show "allow always" when folder is untrusted', () => {
        const mockConfig = {
          isTrustedFolder: () => false,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });

  describe('enablePermanentToolApproval setting', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };

    it('should NOT show "Allow for all future sessions" when setting is false (default)', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: false },
          }),
        },
      );

      expect(lastFrame()).not.toContain('Allow for all future sessions');
    });

    it('should show "Allow for all future sessions" when setting is true', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: true },
          }),
        },
      );

      expect(lastFrame()).toContain('Allow for all future sessions');
    });
  });
});
