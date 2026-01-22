/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import type { ToolResultDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';

describe('DenseToolMessage', () => {
  const defaultProps = {
    callId: 'call-1',
    name: 'test-tool',
    description: 'Test description',
    status: ToolCallStatus.Success,
    resultDisplay: 'Success result',
    confirmationDetails: undefined,
    isFirst: true,
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

  it('renders correctly for file diff results', () => {
    const diffResult = {
      fileDiff: 'diff content',
      fileName: 'test.ts',
      filePath: '/path/to/test.ts',
      originalContent: 'old content',
      newContent: 'new content',
    };
    const { lastFrame } = renderWithProviders(
      <DenseToolMessage {...defaultProps} resultDisplay={diffResult} />,
    );
    const output = lastFrame();
    expect(output).toContain('→ Diff applied to test.ts');
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
