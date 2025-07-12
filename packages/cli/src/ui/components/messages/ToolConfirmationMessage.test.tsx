/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';

describe('ToolConfirmationMessage', () => {
  it('should not display urls if prompt and url are the same', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = render(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).not.toContain('URLs to fetch:');
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

    const { lastFrame } = render(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('URLs to fetch:');
    expect(lastFrame()).toContain(
      '- https://raw.githubusercontent.com/google/gemini-react/main/README.md',
    );
  });

  describe('keyboard shortcuts', () => {
    describe('edit confirmation', () => {
      const editConfirmationDetails: ToolCallConfirmationDetails = {
        type: 'edit',
        title: 'Edit File',
        fileName: 'test.txt',
        fileDiff: 'diff content',
        onConfirm: vi.fn(),
      };

      it('should handle y/Y key for ProceedOnce', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...editConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('y');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );

        onConfirm.mockClear();
        stdin.write('Y');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should handle a/A key for ProceedAlways', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...editConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('a');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlways,
        );

        onConfirm.mockClear();
        stdin.write('A');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlways,
        );
      });

      it('should handle m/M key for ModifyWithEditor', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...editConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('m');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ModifyWithEditor,
        );

        onConfirm.mockClear();
        stdin.write('M');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ModifyWithEditor,
        );
      });

      it('should handle escape key for Cancel', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...editConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('\u001b'); // ESC key
        expect(onConfirm).toHaveBeenCalledWith(ToolConfirmationOutcome.Cancel);
      });
    });

    describe('exec confirmation', () => {
      const execConfirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Execute Command',
        command: 'ls -la',
        rootCommand: 'ls',
        onConfirm: vi.fn(),
      };

      it('should handle y/Y key for ProceedOnce', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...execConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('y');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should handle a/A key for ProceedAlways', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...execConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('a');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlways,
        );
      });
    });

    describe('mcp confirmation', () => {
      const mcpConfirmationDetails: ToolCallConfirmationDetails = {
        type: 'mcp',
        title: 'MCP Tool',
        serverName: 'test-server',
        toolName: 'test-tool',
        toolDisplayName: 'Test Tool',
        onConfirm: vi.fn(),
      };

      it('should handle y/Y key for ProceedOnce', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...mcpConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('y');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should handle m/M key for ProceedAlwaysTool', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...mcpConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('m');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlwaysTool,
        );
      });

      it('should handle a/A key for ProceedAlwaysServer', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...mcpConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('a');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
      });
    });

    describe('info confirmation', () => {
      const infoConfirmationDetails: ToolCallConfirmationDetails = {
        type: 'info',
        title: 'Test',
        prompt: 'Test prompt',
        onConfirm: vi.fn(),
      };

      it('should handle y/Y key for ProceedOnce', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...infoConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('y');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });

      it('should handle a/A key for ProceedAlways', async () => {
        const onConfirm = vi.fn();
        const { stdin } = render(
          <ToolConfirmationMessage
            confirmationDetails={{ ...infoConfirmationDetails, onConfirm }}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        stdin.write('a');
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedAlways,
        );
      });
    });

    it('should not respond to shortcuts when not focused', async () => {
      const onConfirm = vi.fn();
      const { stdin } = render(
        <ToolConfirmationMessage
          confirmationDetails={{
            type: 'edit',
            title: 'Edit File',
            fileName: 'test.txt',
            fileDiff: 'diff content',
            onConfirm,
          }}
          isFocused={false}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );

      stdin.write('y');
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
