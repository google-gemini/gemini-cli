/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type {
  SerializableConfirmationDetails,
  ToolCallConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';

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
  });

  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;

  it('should not display urls if prompt and url are the same', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
    };

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('echo "hello"');
    expect(output).toContain('ls -la');
    expect(output).toContain('whoami');
    expect(output).toMatchSnapshot();
    unmount();
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
        } as unknown as Config;

        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );
        await waitUntilReady();

        expect(lastFrame()).toMatchSnapshot();
        unmount();
      });

      it('should NOT show "allow always" when folder is untrusted', async () => {
        const mockConfig = {
          isTrustedFolder: () => false,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
          <ToolConfirmationMessage
            callId="test-call-id"
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );
        await waitUntilReady();

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
      } as unknown as Config;

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
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
      await waitUntilReady();

      expect(lastFrame()).not.toContain('Allow for all future sessions');
      unmount();
    });

    it('should show "Allow for all future sessions" when setting is true', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
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
      await waitUntilReady();

      expect(lastFrame()).toContain('Allow for all future sessions');
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
      } as unknown as Config;

      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: false,
      });

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toContain('Modify with external editor');
      unmount();
    });

    it('should show "Modify with external editor" when in IDE mode but diffing is NOT enabled', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => true,
      } as unknown as Config;

      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: false,
      });

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toContain('Modify with external editor');
      unmount();
    });

    it('should NOT show "Modify with external editor" when in IDE mode AND diffing is enabled', async () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => true,
      } as unknown as Config;

      vi.mocked(useToolActions).mockReturnValue({
        confirm: vi.fn(),
        cancel: vi.fn(),
        isDiffingEnabled: true,
      });

      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <ToolConfirmationMessage
          callId="test-call-id"
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );
      await waitUntilReady();

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

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );
    await waitUntilReady();

    const output = lastFrame();
    // BiDi characters \u202E and \u202D should be stripped
    expect(output).toContain('MCP Server: testserver');
    expect(output).toContain('Tool: testtool');
    expect(output).toContain('Allow execution of MCP tool "testtool"');
    expect(output).toContain('from server "testserver"?');
    expect(output).toMatchSnapshot();
    unmount();
  });
});
