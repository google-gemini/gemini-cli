/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Box } from 'ink';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { ToolCallStatus, StreamingState } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import type { Config } from '@google/gemini-cli-core';
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
    getModel: () => 'gemini-pro',
    getDebugMode: () => false,
    getTargetDir: () => '/mock/target/dir',
    getFileSystemService: () => ({
      readFile: vi.fn().mockResolvedValue('Plan content'),
    }),
    storage: {
      getProjectTempPlansDir: () => '/mock/temp/plans',
    },
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the confirming tool with progress indicator', () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ls',
        description: 'list files',
        status: ToolCallStatus.Confirming,
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

    const { lastFrame } = renderWithProviders(
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
    expect(output).toContain('Action Required');
    expect(output).toContain('1 of 3');
    expect(output).toContain('ls'); // Tool name
    expect(output).toContain('list files'); // Tool description
    expect(output).toContain("Allow execution of: 'ls'?");
    expect(output).toMatchSnapshot();

    const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
    expect(stickyHeaderProps.borderColor).toBe(theme.status.warning);
  });

  it('returns null if tool has no confirmation details', () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ls',
        status: ToolCallStatus.Confirming,
        confirmationDetails: undefined,
      },
      index: 1,
      total: 1,
    };

    const { lastFrame } = renderWithProviders(
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

    expect(lastFrame()).toBe('');
  });

  it('renders expansion hint when content is long and constrained', async () => {
    const longDiff = '@@ -1,1 +1,50 @@\n' + '+line\n'.repeat(50);
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'replace',
        description: 'edit file',
        status: ToolCallStatus.Confirming,
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

    const { lastFrame } = renderWithProviders(
      <Box flexDirection="column" height={30}>
        <ToolConfirmationQueue
          confirmingTool={confirmingTool as unknown as ConfirmingToolState}
        />
      </Box>,
      {
        config: mockConfig,
        useAlternateBuffer: false,
        uiState: {
          terminalWidth: 80,
          terminalHeight: 20,
          constrainHeight: true,
          streamingState: StreamingState.WaitingForConfirmation,
        },
      },
    );

    await waitFor(() =>
      expect(lastFrame()).toContain('Press ctrl-o to show more lines'),
    );
    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).toContain('Press ctrl-o to show more lines');
  });

  it('calculates availableContentHeight based on availableTerminalHeight from UI state', async () => {
    const longDiff = '@@ -1,1 +1,50 @@\n' + '+line\n'.repeat(50);
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'replace',
        description: 'edit file',
        status: ToolCallStatus.Confirming,
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
    const { lastFrame } = renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        useAlternateBuffer: false,
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
    await waitFor(() => expect(lastFrame()).toContain('first 49 lines hidden'));
    expect(lastFrame()).toMatchSnapshot();
  });

  it('provides more height for ask_user by subtracting less overhead', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ask_user',
        description: 'ask user',
        status: ToolCallStatus.Confirming,
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

    const { lastFrame } = renderWithProviders(
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
    // AskUserDialog uses 15 lines to render its multi-line question and options.
    await waitFor(() => {
      expect(lastFrame()).toContain('Line 6');
      expect(lastFrame()).not.toContain('lines hidden');
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('does not render expansion hint when constrainHeight is false', () => {
    const longDiff = 'line\n'.repeat(50);
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'replace',
        description: 'edit file',
        status: ToolCallStatus.Confirming,
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

    const { lastFrame } = renderWithProviders(
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
    expect(output).not.toContain('Press ctrl-o to show more lines');
    expect(output).toMatchSnapshot();
  });

  it('renders AskUser tool confirmation with Success color', () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ask_user',
        description: 'ask user',
        status: ToolCallStatus.Confirming,
        confirmationDetails: {
          type: 'ask_user' as const,
          questions: [],
          onConfirm: vi.fn(),
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame } = renderWithProviders(
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
  });

  it('renders ExitPlanMode tool confirmation with Success color', async () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'exit_plan_mode',
        description: 'exit plan mode',
        status: ToolCallStatus.Confirming,
        confirmationDetails: {
          type: 'exit_plan_mode' as const,
          planPath: '/path/to/plan',
          onConfirm: vi.fn(),
        },
      },
      index: 1,
      total: 1,
    };

    const { lastFrame } = renderWithProviders(
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

    await waitFor(() => {
      expect(lastFrame()).toContain('Plan content goes here');
    });

    const output = lastFrame();
    expect(output).toMatchSnapshot();

    const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
    expect(stickyHeaderProps.borderColor).toBe(theme.status.success);
  });
});
