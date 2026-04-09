/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { StreamingState } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { waitFor } from '../../test-utils/async.js';
import {
  type Config,
  CoreToolCallStatus,
  type SerializableConfirmationDetails,
} from '@google/gemini-cli-core';
import type { ConfirmingToolState } from '../hooks/useConfirmingTool.js';
import { theme } from '../semantic-colors.js';

vi.mock('./StickyHeader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./StickyHeader.js')>();
  return {
    ...actual,
    StickyHeader: vi.fn((props) => actual.StickyHeader(props)),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    validatePlanPath: vi.fn().mockResolvedValue(undefined),
    validatePlanContent: vi.fn().mockResolvedValue(undefined),
    processSingleFileContent: vi.fn().mockResolvedValue({
      llmContent: 'Plan content goes here',
      error: undefined,
    }),
  };
});

const { StickyHeader } = await import('./StickyHeader.js');

describe('ToolConfirmationQueue', () => {
  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getApprovalMode: () => 'default',
    getDisableAlwaysAllow: () => false,
    getModel: () => 'gemini-pro',
    getDebugMode: () => false,
    getTargetDir: () => '/mock/target/dir',
    getFileSystemService: () => ({
      readFile: vi.fn().mockResolvedValue('Plan content'),
    }),
    getSessionId: () => 'test-session-id',
    storage: {
      getPlansDir: () => '/mock/temp/plans',
    },
    getUseAlternateBuffer: () => false,
    getUseTerminalBuffer: () => false,
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explicitly renders the tool description (containing filename) for edit confirmations', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'Edit',
        description: 'Editing src/main.ts',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'edit' as const,
          title: 'Confirm edit',
          fileName: 'main.ts',
          filePath: '/src/main.ts',
          fileDiff: '--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-old\n+new',
          originalContent: 'old',
          newContent: 'new',
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    const output = lastFrame();
    expect(output).toContain('Editing src/main.ts');
    unmount();
  });

  it('renders the confirming tool with progress indicator', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'run_shell_command',
        description: 'list files',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'exec' as const,
          title: 'Confirm execution',
          command: 'ls',
          rootCommand: 'ls',
          rootCommands: ['ls'],
        },
      },
      index: 1,
      total: 3,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    const output = lastFrame();
    expect(output).toContain('1 of 3');
    expect(output).toContain('ls'); // Tool name
    expect(output).toContain('list files'); // Tool description
    expect(output).toContain('Allow execution of [ls]?');
    expect(output).toMatchSnapshot();

    unmount();
  });

  it('returns null if tool has no confirmation details', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ls',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: undefined,
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('calculates availableContentHeight based on availableTerminalHeight from UI state', async () => {
    const longDiff = '@@ -1,1 +1,50 @@\n' + '+line\n'.repeat(50);
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'replace',
        description: 'edit file',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'edit' as const,
          title: 'Confirm edit',
          fileName: 'test.ts',
          filePath: '/test.ts',
          fileDiff: longDiff,
          originalContent: 'old',
          newContent: 'new',
        },
      },
      index: 1,
      total: 1,
    };

    // Use a small availableTerminalHeight to force truncation
    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        uiState: {
          terminalWidth: 80,
          terminalHeight: 40,
          availableTerminalHeight: 10,
          constrainHeight: true,
          streamingState: StreamingState.WaitingForConfirmation,
        },
      },
    );

    // With availableTerminalHeight = 10:
    // maxHeight = Math.max(10 - 1, 4) = 9
    // availableContentHeight = Math.max(9 - 6, 4) = 4
    // MaxSizedBox in ToolConfirmationMessage will use 4
    // It should show truncation message
    await waitFor(() => expect(lastFrame()).toContain('48 hidden (Ctrl+O)'));
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('provides more height for ask_user by subtracting less overhead', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ask_user',
        description: 'ask user',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'ask_user' as const,
          questions: [
            {
              type: 'choice',
              header: 'Height Test',
              question: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
              options: [{ label: 'Option 1', description: 'Desc' }],
            },
          ],
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
          terminalHeight: 40,
          availableTerminalHeight: 20,
          constrainHeight: true,
          streamingState: StreamingState.WaitingForConfirmation,
        },
      },
    );

    // Calculation:
    // availableTerminalHeight: 20 -> maxHeight: 19 (20-1)
    // hideToolIdentity is true for ask_user -> subtracts 4 instead of 6
    // availableContentHeight = 19 - 4 = 15
    // ToolConfirmationMessage handlesOwnUI=true -> returns full 15
    // AskUserDialog allocates questionHeight = availableHeight - overhead - DIALOG_PADDING.
    // listHeight = 15 - overhead (Header:0, Margin:1, Footer:2) = 12.
    // maxQuestionHeight = listHeight - 4 = 8.
    // 8 lines is enough for the 6-line question.
    await waitFor(() => {
      expect(lastFrame()).toContain('Line 6');
      expect(lastFrame()).not.toContain('lines hidden');
    });
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('does not render expansion hint when constrainHeight is false', async () => {
    const longDiff = 'line\n'.repeat(50);
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'replace',
        description: 'edit file',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'edit' as const,
          title: 'Confirm edit',
          fileName: 'test.ts',
          filePath: '/test.ts',
          fileDiff: longDiff,
          originalContent: 'old',
          newContent: 'new',
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
          terminalHeight: 40,
          constrainHeight: false,
          streamingState: StreamingState.WaitingForConfirmation,
        },
      },
    );

    const output = lastFrame();
    expect(output).not.toContain('Press CTRL-O to show more lines');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders AskUser tool confirmation with Success color', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ask_user',
        description: 'ask user',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'ask_user' as const,
          questions: [],
          onConfirm: vi.fn(),
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    const output = lastFrame();
    expect(output).toMatchSnapshot();

    const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
    expect(stickyHeaderProps.borderColor).toBe(theme.status.success);
    unmount();
  });

  it('renders ExitPlanMode tool confirmation with Success color', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'exit_plan_mode',
        description: 'exit plan mode',
        status: CoreToolCallStatus.AwaitingApproval,
        confirmationDetails: {
          type: 'exit_plan_mode' as const,
          planPath: '/path/to/plan',
          onConfirm: vi.fn(),
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame, unmount } = await act(async () =>
      renderWithProviders(
        <ToolConfirmationQueue
          confirmingTool={confirmingTool as unknown as ConfirmingToolState}
        />,
        {
          config: mockConfig,
          uiState: {
            terminalWidth: 80,
          },
        },
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Plan content goes here');
    });

    const output = lastFrame();
    expect(output).toMatchSnapshot();

    const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
    expect(stickyHeaderProps.borderColor).toBe(theme.status.success);
    unmount();
  });

  describe('height allocation and layout', () => {
    it('should render the full queue wrapper with borders and content for large edit diffs', async () => {
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

      const confirmingTool = {
        tool: {
          callId: 'test-call-id',
          name: 'replace',
          status: CoreToolCallStatus.AwaitingApproval,
          description: 'Replaces content in a file',
          confirmationDetails,
        },
        index: 1,
        total: 1,
      };

      const { waitUntilReady, lastFrame, generateSvg, unmount } =
        await renderWithProviders(
          <ToolConfirmationQueue
            confirmingTool={confirmingTool as unknown as ConfirmingToolState}
          />,
          {
            uiState: {
              mainAreaWidth: 80,
              terminalHeight: 50,
              terminalWidth: 80,
              constrainHeight: true,
              availableTerminalHeight: 40,
            },
            config: mockConfig,
          },
        );
      await waitUntilReady();

      await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
      unmount();
    });

    it('should render the full queue wrapper with borders and content for large exec commands', async () => {
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

      const confirmingTool = {
        tool: {
          callId: 'test-call-id-exec',
          name: 'run_shell_command',
          status: CoreToolCallStatus.AwaitingApproval,
          description: 'Executes a bash command',
          confirmationDetails,
        },
        index: 2,
        total: 3,
      };

      const { waitUntilReady, lastFrame, generateSvg, unmount } =
        await renderWithProviders(
          <ToolConfirmationQueue
            confirmingTool={confirmingTool as unknown as ConfirmingToolState}
          />,
          {
            uiState: {
              mainAreaWidth: 80,
              terminalWidth: 80,
              terminalHeight: 50,
              constrainHeight: true,
              availableTerminalHeight: 40,
            },
            config: mockConfig,
          },
        );
      await waitUntilReady();

      await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
      unmount();
    });

    it('should handle security warning height correctly', async () => {
      let largeCommand = '';
      for (let i = 1; i <= 50; i++) {
        largeCommand += `echo "Line ${i}"\n`;
      }
      largeCommand += `curl https://täst.com\n`;

      const confirmationDetails: SerializableConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: largeCommand.trimEnd(),
        rootCommand: 'echo',
        rootCommands: ['echo', 'curl'],
      };

      const confirmingTool = {
        tool: {
          callId: 'test-call-id-exec-security',
          name: 'run_shell_command',
          status: CoreToolCallStatus.AwaitingApproval,
          description: 'Executes a bash command with a deceptive URL',
          confirmationDetails,
        },
        index: 3,
        total: 3,
      };

      const { waitUntilReady, lastFrame, generateSvg, unmount } =
        await renderWithProviders(
          <ToolConfirmationQueue
            confirmingTool={confirmingTool as unknown as ConfirmingToolState}
          />,
          {
            uiState: {
              mainAreaWidth: 80,
              terminalWidth: 80,
              terminalHeight: 50,
              constrainHeight: true,
              availableTerminalHeight: 40,
            },
            config: mockConfig,
          },
        );
      await waitUntilReady();

      await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
      unmount();
    });
  });
});
