/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { waitFor } from '../../../test-utils/async.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import {
  CoreToolCallStatus,
  type DiffStat,
  type FileDiff,
  type GrepResult,
  type ListDirectoryResult,
  type ReadManyFilesResult,
  makeFakeConfig,
} from '@google/gemini-cli-core';
import type {
  SerializableConfirmationDetails,
  ToolResultDisplay,
} from '../../types.js';

describe('DenseToolMessage', () => {
  const defaultProps = {
    callId: 'call-1',
    name: 'test-tool',
    description: 'Test description',
    status: CoreToolCallStatus.Success,
    resultDisplay: 'Success result' as ToolResultDisplay,
    confirmationDetails: undefined,
    terminalWidth: 80,
  };

  it('explicitly renders the filename in the header for FileDiff results', async () => {
    const fileDiff: FileDiff = {
      fileName: 'test-file.ts',
      filePath: '/test-file.ts',
      fileDiff:
        '--- a/test-file.ts\n+++ b/test-file.ts\n@@ -1 +1 @@\n-old\n+new',
      originalContent: 'old',
      newContent: 'new',
    };

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        resultDisplay={fileDiff as unknown as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('test-file.ts');
  });

  it('renders correctly for a successful string result', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage {...defaultProps} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('test-tool');
    expect(output).toContain('Test description');
    expect(output).toContain('→ Success result');
    expect(output).toMatchSnapshot();
  });

  it('truncates long string results', async () => {
    const longResult = 'A'.repeat(200);
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={longResult as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('…');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('flattens newlines in string results', async () => {
    const multilineResult = 'Line 1\nLine 2';
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={multilineResult as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Line 1 Line 2');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for file diff results with stats', async () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+diff content',
      fileName: 'test.ts',
      filePath: '/path/to/test.ts',
      originalContent: 'old content',
      newContent: 'new content',
      diffStat: {
        user_added_lines: 5,
        user_removed_lines: 2,
        user_added_chars: 50,
        user_removed_chars: 20,
        model_added_lines: 10,
        model_removed_lines: 4,
        model_added_chars: 100,
        model_removed_chars: 40,
      },
    };
    const { lastFrame } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={diffResult as ToolResultDisplay}
      />,
      {
        settings: createMockSettings({
          merged: { useAlternateBuffer: false, useTerminalBuffer: false },
        }),
      },
    );
    await waitFor(() => expect(lastFrame()).toContain('test-tool'));
    await waitFor(() =>
      expect(lastFrame()).toContain('test.ts → Accepted (+15, -6)'),
    );
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for Edit tool using confirmationDetails', async () => {
    const confirmationDetails = {
      type: 'edit' as const,
      title: 'Confirm Edit',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      fileDiff:
        '@@ -1,1 +1,1 @@\n-body { color: blue; }\n+body { color: red; }',
      originalContent: 'body { color: blue; }',
      newContent: 'body { color: red; }',
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={CoreToolCallStatus.AwaitingApproval}
        resultDisplay={undefined}
        confirmationDetails={
          confirmationDetails as SerializableConfirmationDetails
        }
      />,
      {},
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss');
    expect(output).toContain('→ Confirming');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for Rejected Edit tool', async () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+new line',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      originalContent: 'old line',
      newContent: 'new line',
      diffStat: {
        user_added_lines: 1,
        user_removed_lines: 1,
        user_added_chars: 0,
        user_removed_chars: 0,
        model_added_lines: 0,
        model_removed_lines: 0,
        model_added_chars: 0,
        model_removed_chars: 0,
      },
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={CoreToolCallStatus.Cancelled}
        resultDisplay={diffResult as ToolResultDisplay}
      />,
      {},
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss → Rejected (+1, -1)');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for Rejected Edit tool with confirmationDetails and diffStat', async () => {
    const confirmationDetails = {
      type: 'edit' as const,
      title: 'Confirm Edit',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      fileDiff:
        '@@ -1,1 +1,1 @@\n-body { color: blue; }\n+body { color: red; }',
      originalContent: 'body { color: blue; }',
      newContent: 'body { color: red; }',
      diffStat: {
        user_added_lines: 1,
        user_removed_lines: 1,
        user_added_chars: 0,
        user_removed_chars: 0,
        model_added_lines: 0,
        model_removed_lines: 0,
        model_added_chars: 0,
        model_removed_chars: 0,
      } as DiffStat,
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={CoreToolCallStatus.Cancelled}
        resultDisplay={undefined}
        confirmationDetails={
          confirmationDetails as unknown as SerializableConfirmationDetails
        }
      />,
      {},
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss → Rejected (+1, -1)');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for WriteFile tool', async () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old content\n+new content',
      fileName: 'config.json',
      filePath: '/path/to/config.json',
      originalContent: 'old content',
      newContent: 'new content',
      diffStat: {
        user_added_lines: 1,
        user_removed_lines: 1,
        user_added_chars: 0,
        user_removed_chars: 0,
        model_added_lines: 0,
        model_removed_lines: 0,
        model_added_chars: 0,
        model_removed_chars: 0,
      },
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="WriteFile"
        status={CoreToolCallStatus.Success}
        resultDisplay={diffResult as ToolResultDisplay}
      />,
      {},
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('WriteFile');
    expect(output).toContain('config.json → Accepted (+1, -1)');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for Rejected WriteFile tool', async () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old content\n+new content',
      fileName: 'config.json',
      filePath: '/path/to/config.json',
      originalContent: 'old content',
      newContent: 'new content',
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="WriteFile"
        status={CoreToolCallStatus.Cancelled}
        resultDisplay={diffResult as ToolResultDisplay}
      />,
      {},
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('WriteFile');
    expect(output).toContain('config.json');
    expect(output).toContain('→ Rejected');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for Errored Edit tool', async () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+new line',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      originalContent: 'old line',
      newContent: 'new line',
      diffStat: {
        user_added_lines: 1,
        user_removed_lines: 1,
        user_added_chars: 0,
        user_removed_chars: 0,
        model_added_lines: 0,
        model_removed_lines: 0,
        model_added_chars: 0,
        model_removed_chars: 0,
      },
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={CoreToolCallStatus.Error}
        resultDisplay={diffResult as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss → Failed (+1, -1)');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for grep results', async () => {
    const grepResult: GrepResult = {
      summary: 'Found 2 matches',
      matches: [
        {
          filePath: 'file1.ts',
          absolutePath: '/file1.ts',
          lineNumber: 10,
          line: 'match 1',
        },
        {
          filePath: 'file2.ts',
          absolutePath: '/file2.ts',
          lineNumber: 20,
          line: 'match 2',
        },
      ],
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={grepResult as unknown as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Found 2 matches');
    // Matches should no longer be rendered in dense mode to keep it compact
    expect(output).not.toContain('file1.ts:10: match 1');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for ls results', async () => {
    const lsResult: ListDirectoryResult = {
      summary: 'Listed 2 files. (1 ignored)',
      files: ['file1.ts', 'dir1'],
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={lsResult as unknown as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Listed 2 files. (1 ignored)');
    // Directory listings should not have a payload in dense mode
    expect(output).not.toContain('file1.ts');
    expect(output).not.toContain('dir1');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for ReadManyFiles results', async () => {
    const rmfResult: ReadManyFilesResult = {
      summary: 'Read 3 file(s)',
      files: ['file1.ts', 'file2.ts', 'file3.ts'],
      include: ['**/*.ts'],
      skipped: [{ path: 'skipped.bin', reason: 'binary' }],
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={rmfResult as unknown as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Attempting to read files from **/*.ts');
    expect(output).toContain('→ Read 3 file(s) (1 ignored)');
    // File lists should no longer be rendered in dense mode
    expect(output).not.toContain('file1.ts');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for todo updates', async () => {
    const todoResult = {
      todos: [],
    };
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        resultDisplay={todoResult as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Todos updated');
    expect(output).toMatchSnapshot();
  });

  it('renders generic output message for unknown object results', async () => {
    const genericResult = {
      some: 'data',
    } as unknown as ToolResultDisplay;
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={genericResult} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Returned (possible empty result)');
    expect(output).toMatchSnapshot();
  });

  it('renders correctly for error status with string message', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={CoreToolCallStatus.Error}
        resultDisplay={'Error occurred' as ToolResultDisplay}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Error occurred');
    expect(output).toMatchSnapshot();
  });

  it('renders generic failure message for error status without string message', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={CoreToolCallStatus.Error}
        resultDisplay={undefined}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('→ Failed');
    expect(output).toMatchSnapshot();
  });

  it('does not render result arrow if resultDisplay is missing', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={CoreToolCallStatus.Scheduled}
        resultDisplay={undefined}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).not.toContain('→');
    expect(output).toMatchSnapshot();
  });

  it('truncates long description but preserves tool name (< 25 chars)', async () => {
    const longDescription =
      'This is a very long description that should definitely be truncated because it exceeds the available terminal width and we want to see how it behaves.';
    const toolName = 'tool-name-is-24-chars-!!'; // Exactly 24 chars
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name={toolName}
        description={longDescription}
        terminalWidth={50} // Narrow width to force truncation
      />,
    );
    await waitUntilReady();
    const output = lastFrame();

    // Tool name should be fully present (it plus one space is exactly 25, fitting the maxWidth)
    expect(output).toContain(toolName);
    // Description should be present but truncated
    expect(output).toContain('This is a');
    expect(output).toMatchSnapshot();
  });

  describe('Toggleable Diff View (Alternate Buffer)', () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+new line',
      fileName: 'test.ts',
      filePath: '/path/to/test.ts',
      originalContent: 'old content',
      newContent: 'new content',
    };

    it('hides diff content by default when in alternate buffer mode', async () => {
      const { lastFrame, waitUntilReady } = await renderWithProviders(
        <DenseToolMessage
          {...defaultProps}
          resultDisplay={diffResult as ToolResultDisplay}
          status={CoreToolCallStatus.Success}
        />,
        {
          config: makeFakeConfig({ useAlternateBuffer: true }),
          settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
        },
      );
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain('Accepted');
      expect(output).not.toContain('new line');
      expect(output).toMatchSnapshot();
    });

    it('shows diff content by default when NOT in alternate buffer mode', async () => {
      const { lastFrame, waitUntilReady } = await renderWithProviders(
        <DenseToolMessage
          {...defaultProps}
          resultDisplay={diffResult as ToolResultDisplay}
          status={CoreToolCallStatus.Success}
        />,
        {
          config: makeFakeConfig({ useAlternateBuffer: false }),
          settings: createMockSettings({ ui: { useAlternateBuffer: false } }),
        },
      );
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain('Accepted');
      expect(output).toMatchSnapshot();
    });

    it('shows diff content when expanded via ToolActionsContext', async () => {
      const { lastFrame, waitUntilReady } = await renderWithProviders(
        <DenseToolMessage
          {...defaultProps}
          resultDisplay={diffResult as ToolResultDisplay}
          status={CoreToolCallStatus.Success}
        />,
        {
          config: makeFakeConfig({ useAlternateBuffer: true }),
          settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
          toolActions: {
            isExpanded: () => true,
          },
        },
      );
      await waitUntilReady();

      // Verify it shows the diff when expanded
      expect(lastFrame()).toContain('new line');
    });
  });

  describe('Visual Regression', () => {
    it('matches SVG snapshot for an Accepted file edit with diff stats', async () => {
      const diffResult: FileDiff = {
        fileName: 'test.ts',
        filePath: '/mock/test.ts',
        fileDiff: '--- a/test.ts\n+++ b/test.ts\n@@ -1 +1 @@\n-old\n+new',
        originalContent: 'old',
        newContent: 'new',
        diffStat: {
          model_added_lines: 1,
          model_removed_lines: 1,
          model_added_chars: 3,
          model_removed_chars: 3,
          user_added_lines: 0,
          user_removed_lines: 0,
          user_added_chars: 0,
          user_removed_chars: 0,
        },
      };

      const renderResult = await renderWithProviders(
        <DenseToolMessage
          {...defaultProps}
          name="edit"
          description="Editing test.ts"
          resultDisplay={diffResult as ToolResultDisplay}
          status={CoreToolCallStatus.Success}
        />,
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
    });

    it('matches SVG snapshot for a Rejected tool call', async () => {
      const renderResult = await renderWithProviders(
        <DenseToolMessage
          {...defaultProps}
          name="read_file"
          description="Reading important.txt"
          resultDisplay="Rejected by user"
          status={CoreToolCallStatus.Cancelled}
        />,
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
    });
  });
});
