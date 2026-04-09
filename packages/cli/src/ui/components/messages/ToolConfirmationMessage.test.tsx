/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import {
  type SerializableConfirmationDetails,
  type ToolCallConfirmationDetails,
  type Config,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import { act } from 'react';

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

describe('ToolConfirmationMessage', () => {
  const mockConfirm = vi.fn();
  vi.mocked(useToolActions).mockReturnValue({
    confirm: mockConfirm,
    cancel: vi.fn(),
    isDiffingEnabled: false,
    isExpanded: vi.fn().mockReturnValue(false),
    toggleExpansion: vi.fn(),
    toggleAllExpansion: vi.fn(),
  });

  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getDisableAlwaysAllow: () => false,
    getApprovalMode: () => 'default',
  } as unknown as Config;

  it('should not display urls if prompt and url are the same', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should display urls if prompt and url are different', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt:
        'fetch https://github.com/google/gemini-react/blob/main/README.md',
      urls: [
        'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
      ],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should display WarningMessage for deceptive URLs in info type', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://täst.com',
      urls: ['https://täst.com'],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Deceptive URL(s) detected');
    expect(output).toContain('Original: https://täst.com');
    expect(output).toContain(
      'Actual Host (Punycode): https://xn--tst-qla.com/',
    );
    unmount();
  });

  it('should display WarningMessage for deceptive URLs in exec type commands', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'curl https://еxample.com',
      rootCommand: 'curl',
      rootCommands: ['curl'],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Deceptive URL(s) detected');
    expect(output).toContain('Original: https://еxample.com/');
    expect(output).toContain(
      'Actual Host (Punycode): https://xn--xample-2of.com/',
    );
    unmount();
  });

  it('should exclude shell delimiters from extracted URLs in exec type commands', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'curl https://еxample.com;ls',
      rootCommand: 'curl',
      rootCommands: ['curl'],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Deceptive URL(s) detected');
    // It should extract "https://еxample.com" and NOT "https://еxample.com;ls"
    expect(output).toContain('Original: https://еxample.com/');
    // The command itself still contains 'ls', so we check specifically that 'ls' is not part of the URL line.
    expect(output).not.toContain('Original: https://еxample.com/;ls');
    unmount();
  });

  it('should aggregate multiple deceptive URLs into a single WarningMessage', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'Fetch both',
      urls: ['https://еxample.com', 'https://täst.com'],
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Deceptive URL(s) detected');
    expect(output).toContain('Original: https://еxample.com/');
    expect(output).toContain('Original: https://täst.com/');
    unmount();
  });

  it('should display multiple commands for exec type when provided', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Multiple Commands',
      command: 'echo "hello"', // Primary command
      rootCommand: 'echo',
      rootCommands: ['echo'],
      commands: ['echo "hello"', 'ls -la', 'whoami'], // Multi-command list
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('echo "hello"');
    expect(output).toContain('ls -la');
    expect(output).toContain('whoami');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should render multiline shell scripts with correct newlines and syntax highlighting', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Multiline Script',
      command: 'echo "hello"\nfor i in 1 2 3; do\n  echo $i\ndone',
      rootCommand: 'echo',
      rootCommands: ['echo'],
    };

    const result = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );
    await result.waitUntilReady();

    const output = result.lastFrame();
    expect(output).toContain('echo "hello"');
    expect(output).toContain('for i in 1 2 3; do');
    expect(output).toContain('echo $i');
    expect(output).toContain('done');

    await expect(result).toMatchSvgSnapshot();
    result.unmount();
  });

  describe('with folder trust', () => {
    const editConfirmationDetails: SerializableConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
    };

    const execConfirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      rootCommands: ['echo'],
    };

    const infoConfirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
    };

    const mcpConfirmationDetails: SerializableConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
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
      it('should show "allow always" when folder is trusted', async () => {
        const mockConfig = {
          isTrustedFolder: () => true,
          getIdeMode: () => false,
          getDisableAlwaysAllow: () => false,
          getApprovalMode: () => 'default',
        } as unknown as Config;
        const { lastFrame, unmount } = await renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={details}
            config={mockConfig}
            getPreferredEditor={vi.fn()}
            availableTerminalHeight={30}
            terminalWidth={80}
            toolName="shell"
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });

      it('should NOT show "allow always" when folder is untrusted', async () => {
        const mockConfig = {
          isTrustedFolder: () => false,
          getIdeMode: () => false,
          getDisableAlwaysAllow: () => false,
          getApprovalMode: () => 'default',
        } as unknown as Config;

        const { lastFrame, unmount } = await renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={details}
            config={mockConfig}
            getPreferredEditor={vi.fn()}
            availableTerminalHeight={30}
            terminalWidth={80}
            toolName="shell"
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });
    });
  });

  describe('enablePermanentToolApproval setting', () => {
    const editConfirmationDetails: SerializableConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
    };

    it('should NOT show "Allow for all future sessions" when setting is false (default)', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
        getDisableAlwaysAllow: () => false,
        getApprovalMode: () => 'default',
      } as unknown as Config;
      const { lastFrame, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: false },
          }),
        },
      );

      expect(lastFrame()).not.toContain('Allow for all future sessions');
      unmount();
    });

    it('should show "Allow for all future sessions" when trusted', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
        getDisableAlwaysAllow: () => false,
        getApprovalMode: () => 'default',
      } as unknown as Config;
      const { lastFrame, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: true },
          }),
        },
      );

      const output = lastFrame();
      expect(output).toContain('future sessions');
      // Verify it is the default selection (matching the indicator in the snapshot)
      expect(output).toMatchSnapshot();
      unmount();
    });
  });

  describe('Modify with external editor option', () => {
    const editConfirmationDetails: SerializableConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
    };

    it('should show "Modify with external editor" when NOT in IDE mode', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
        getDisableAlwaysAllow: () => false,
        getApprovalMode: () => 'default',
      } as unknown as Config;
      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: false,
        isExpanded: vi.fn().mockReturnValue(false),
        toggleExpansion: vi.fn(),
        toggleAllExpansion: vi.fn(),
      });

      const { lastFrame, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
      );

      expect(lastFrame()).toContain('Modify with external editor');
      unmount();
    });

    it('should show "Modify with external editor" when in IDE mode but diffing is NOT enabled', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => true,
        getDisableAlwaysAllow: () => false,
        getApprovalMode: () => 'default',
      } as unknown as Config;
      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: false,
        isExpanded: vi.fn().mockReturnValue(false),
        toggleExpansion: vi.fn(),
        toggleAllExpansion: vi.fn(),
      });

      const { lastFrame, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
      );

      expect(lastFrame()).toContain('Modify with external editor');
      unmount();
    });

    it('should NOT show "Modify with external editor" when in IDE mode AND diffing is enabled', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => true,
        getDisableAlwaysAllow: () => false,
        getApprovalMode: () => 'default',
      } as unknown as Config;
      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: true,
        isExpanded: vi.fn().mockReturnValue(false),
        toggleExpansion: vi.fn(),
        toggleAllExpansion: vi.fn(),
      });

      const { lastFrame, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
      );

      expect(lastFrame()).not.toContain('Modify with external editor');
      unmount();
    });
  });

  it('should strip BiDi characters from MCP tool and server names', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test\u202Eserver',
      toolName: 'test\u202Dtool',
      toolDisplayName: 'Test Tool',
      onConfirm: vi.fn(),
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    // BiDi characters \u202E and \u202D should be stripped
    expect(output).toContain('MCP Server: testserver');
    expect(output).toContain('Tool: testtool');
    expect(output).toContain('Allow execution of MCP tool "testtool"');
    expect(output).toContain('from server "testserver"?');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('should show MCP tool details expand hint for MCP confirmations', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
      toolArgs: {
        url: 'https://www.google.co.jp',
      },
      toolDescription: 'Navigates browser to a URL.',
      toolParameterSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Destination URL',
          },
        },
        required: ['url'],
      },
      onConfirm: vi.fn(),
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('MCP Tool Details:');
    expect(output).toContain('(press Ctrl+O to expand MCP tool details)');
    expect(output).not.toContain('https://www.google.co.jp');
    expect(output).not.toContain('Navigates browser to a URL.');
    unmount();
  });

  it('should omit empty MCP invocation arguments from details', async () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
      toolArgs: {},
      toolDescription: 'No arguments required.',
      onConfirm: vi.fn(),
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={80}
        toolName="shell"
      />,
    );

    const output = lastFrame();
    expect(output).toContain('MCP Tool Details:');
    expect(output).toContain('(press Ctrl+O to expand MCP tool details)');
    expect(output).not.toContain('Invocation Arguments:');
    unmount();
  });

  describe('height allocation and layout', () => {
    it('should expand to available height for large exec commands', async () => {
      let largeCommand = '';
      for (let i = 1; i <= 50; i++) {
        largeCommand += `echo "Line ${i}"\n`;
      }

      const confirmationDetails: SerializableConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: largeCommand.trimEnd(),
        rootCommand: 'echo',
        rootCommands: ['echo'],
      };

      const { waitUntilReady, lastFrame, generateSvg, unmount } =
        await renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={confirmationDetails}
            config={mockConfig}
            getPreferredEditor={vi.fn()}
            availableTerminalHeight={40}
            terminalWidth={80}
            toolName="shell"
          />,
        );
      await waitUntilReady();

      const outputLines = lastFrame().split('\n');
      // Should use the entire terminal height
      expect(outputLines.length).toBe(40);

      await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
      unmount();
    });

    it('should expand to available height for large edit diffs', async () => {
      // Create a large diff string
      let largeDiff = '--- a/file.ts\n+++ b/file.ts\n@@ -1,10 +1,15 @@\n';
      for (let i = 1; i <= 20; i++) {
        largeDiff += `-const oldLine${i} = true;\n`;
        largeDiff += `+const newLine${i} = true;\n`;
      }

      const confirmationDetails: SerializableConfirmationDetails = {
        type: 'edit',
        title: 'Confirm Edit',
        fileName: 'file.ts',
        filePath: '/file.ts',
        fileDiff: largeDiff,
        originalContent: 'old',
        newContent: 'new',
        isModifying: false,
      };

      const { waitUntilReady, lastFrame, generateSvg, unmount } =
        await renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={confirmationDetails}
            config={mockConfig}
            getPreferredEditor={vi.fn()}
            availableTerminalHeight={40}
            terminalWidth={80}
            toolName="shell"
          />,
        );
      await waitUntilReady();

      const outputLines = lastFrame().split('\n');
      // Should use the entire terminal height
      expect(outputLines.length).toBe(40);

      await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
      unmount();
    });
  });

  describe('ESCAPE key behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should call confirm(Cancel) asynchronously via useEffect when ESC is pressed', async () => {
      const mockConfirm = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useToolActions).mockReturnValue({
        confirm: mockConfirm,
        cancel: vi.fn(),
        isDiffingEnabled: false,
        isExpanded: vi.fn().mockReturnValue(false),
        toggleExpansion: vi.fn(),
        toggleAllExpansion: vi.fn(),
      });
      const confirmationDetails: SerializableConfirmationDetails = {
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'https://example.com',
        urls: ['https://example.com'],
      };

      const { stdin, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="shell"
        />,
      );

      stdin.write('\x1b');

      // To assert that the confirmation happens asynchronously (via useEffect) rather than
      // synchronously (directly inside the keystroke handler), we must run our assertion
      // *inside* the act() block.
      await act(async () => {
        await vi.runAllTimersAsync();
        expect(mockConfirm).not.toHaveBeenCalled();
      });

      // Now that the act() block has returned, React flushes the useEffect, calling handleConfirm.
      expect(mockConfirm).toHaveBeenCalledWith(
        'test-call-id',
        ToolConfirmationOutcome.Cancel,
        undefined,
      );

      unmount();
    });
  });
});
