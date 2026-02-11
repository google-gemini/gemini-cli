/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import { ToolCallStatus } from '../../types.js';
import type {
  FileDiff,
  SerializableConfirmationDetails,
  ToolResultDisplay,
} from '../../types.js';

describe('DenseToolMessage', () => {
  const defaultProps = {
    callId: 'call-1',
    name: 'test-tool',
    description: 'Test description',
    status: ToolCallStatus.Success,
    resultDisplay: 'Success result',
    confirmationDetails: undefined,
  };

  it('renders correctly for a successful string result', () => {
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} />,
    );
    const output = lastFrame();
    expect(output).toContain('test-tool');
    expect(output).toContain('Test description');
    expect(output).toContain('→ Success result');
  });

  it('truncates long string results', () => {
    const longResult = 'A'.repeat(200);
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={longResult} />,
    );
    // Remove all whitespace to check the continuous string content truncation
    const output = lastFrame()?.replace(/\s/g, '');
    expect(output).toContain('A'.repeat(117) + '...');
  });

  it('flattens newlines in string results', () => {
    const multilineResult = 'Line 1\nLine 2';
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={multilineResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Line 1 Line 2');
  });

  it('renders correctly for file diff results with stats', () => {
    const diffResult = {
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
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={diffResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('test.ts (+15, -6) → Accepted');
    expect(output).toContain('diff content');
  });

  it('renders correctly for Edit tool using confirmationDetails', () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      fileDiff:
        '@@ -1,1 +1,1 @@\n-body { color: blue; }\n+body { color: red; }',
      originalContent: 'body { color: blue; }',
      newContent: 'body { color: red; }',
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={ToolCallStatus.Confirming}
        resultDisplay={undefined}
        confirmationDetails={confirmationDetails}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss');
    expect(output).toContain('→ Confirming');
    expect(output).toContain('body { color: red; }');
  });

  it('renders correctly for Rejected Edit tool', () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+new line',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      originalContent: 'old line',
      newContent: 'new line',
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={ToolCallStatus.Canceled}
        resultDisplay={diffResult}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss');
    expect(output).toContain('→ Rejected');
    expect(output).toContain('- old line');
    expect(output).toContain('+ new line');
  });

  it('renders correctly for WriteFile tool', () => {
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
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="WriteFile"
        status={ToolCallStatus.Success}
        resultDisplay={diffResult}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('WriteFile');
    expect(output).toContain('config.json (+1, -1)');
    expect(output).toContain('→ Accepted');
    expect(output).toContain('+ new content');
  });

  it('renders correctly for Rejected WriteFile tool', () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old content\n+new content',
      fileName: 'config.json',
      filePath: '/path/to/config.json',
      originalContent: 'old content',
      newContent: 'new content',
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="WriteFile"
        status={ToolCallStatus.Canceled}
        resultDisplay={diffResult}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('WriteFile');
    expect(output).toContain('config.json');
    expect(output).toContain('→ Rejected');
    expect(output).toContain('- old content');
    expect(output).toContain('+ new content');
  });

  it('renders correctly for Errored Edit tool', () => {
    const diffResult: FileDiff = {
      fileDiff: '@@ -1,1 +1,1 @@\n-old line\n+new line',
      fileName: 'styles.scss',
      filePath: '/path/to/styles.scss',
      originalContent: 'old line',
      newContent: 'new line',
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        name="Edit"
        status={ToolCallStatus.Error}
        resultDisplay={diffResult}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('Edit');
    expect(output).toContain('styles.scss');
    expect(output).toContain('→ Failed');
  });

  it('renders correctly for grep results', () => {
    const grepResult = {
      summary: 'Found 2 matches',
      matches: [
        { filePath: 'file1.ts', lineNumber: 10, line: 'match 1' },
        { filePath: 'file2.ts', lineNumber: 20, line: 'match 2' },
      ],
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={grepResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Found 2 matches');
    // Matches are rendered in a secondary list for high-signal summaries
    expect(output).toContain('file1.ts:10: match 1');
    expect(output).toContain('file2.ts:20: match 2');
  });

  it('renders correctly for ls results', () => {
    const lsResult = {
      summary: 'Listed 2 files. (1 ignored)',
      files: ['file1.ts', 'dir1'],
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={lsResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Listed 2 files. (1 ignored)');
    // Directory listings should not have a payload in dense mode
    expect(output).not.toContain('file1.ts');
    expect(output).not.toContain('dir1');
  });

  it('renders correctly for ReadManyFiles results', () => {
    const rmfResult = {
      summary: 'Read 3 file(s)',
      files: ['file1.ts', 'file2.ts', 'file3.ts'],
      include: ['**/*.ts'],
      skipped: [{ path: 'skipped.bin', reason: 'binary' }],
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={rmfResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('Attempting to read files from **/*.ts');
    expect(output).toContain('→ Read 3 file(s) (1 ignored)');
    expect(output).toContain('file1.ts');
    expect(output).toContain('file2.ts');
    expect(output).toContain('file3.ts');
  });

  it('renders correctly for todo updates', () => {
    const todoResult = {
      todos: [],
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={todoResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Todos updated');
  });

  it('renders generic output message for unknown object results', () => {
    const genericResult = {
      some: 'data',
    } as unknown as ToolResultDisplay;
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={genericResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Output received');
  });

  it('renders correctly for error status with string message', () => {
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={ToolCallStatus.Error}
        resultDisplay="Error occurred"
      />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Error occurred');
  });

  it('renders generic failure message for error status without string message', () => {
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={ToolCallStatus.Error}
        resultDisplay={undefined}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Failed');
  });

  it('does not render result arrow if resultDisplay is missing', () => {
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage
        {...defaultProps}
        status={ToolCallStatus.Pending}
        resultDisplay={undefined}
      />,
    );
    const output = lastFrame();
    expect(output).not.toContain('→');
  });
});
