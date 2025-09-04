/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { McpServerForm } from './McpServerForm';
import type { MCPServerConfig } from '@google/gemini-cli-core';

describe('McpServerForm', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  const baseProps = {
    onSave: mockOnSave,
    onCancel: mockOnCancel,
  };

  it('renders in "add" mode', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
    expect(screen.getByLabelText('Server Name')).toHaveValue('');
  });

  it('renders in "edit" mode with initial values', () => {
    const serverConfig: MCPServerConfig = {
      command: 'test-command',
      args: ['arg1', 'arg2'],
      description: 'A test server',
    };
    render(
      <McpServerForm
        {...baseProps}
        serverName="TestServer"
        serverConfig={serverConfig}
      />,
    );
    expect(screen.getByText('Edit MCP Server')).toBeInTheDocument();
    expect(screen.getByLabelText('Server Name')).toHaveValue('TestServer');
    expect(screen.getByLabelText('Description')).toHaveValue('A test server');
    expect(screen.getByLabelText('Command')).toHaveValue('test-command');
    expect(screen.getByLabelText('Arguments (comma-separated)')).toHaveValue(
      'arg1, arg2',
    );
  });

  it('handles input changes', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);

    // Text input
    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'New Server' },
    });
    expect(screen.getByLabelText('Server Name')).toHaveValue('New Server');

    // Number input
    fireEvent.change(screen.getByLabelText('Timeout (ms)'), {
      target: { value: '5000' },
    });
    expect(screen.getByLabelText('Timeout (ms)')).toHaveValue(5000);

    // Checkbox
    fireEvent.click(screen.getByLabelText('Trust Server'));
    expect(screen.getByLabelText('Trust Server')).toBeChecked();
  });

  it('handles string array changes', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);
    fireEvent.change(screen.getByLabelText('Include Tools (comma-separated)'), {
      target: { value: 'tool1, tool2' },
    });
    expect(
      screen.getByLabelText('Include Tools (comma-separated)'),
    ).toHaveValue('tool1, tool2');
  });

  it('handles record changes with valid JSON', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);
    const envTextarea = screen.getByLabelText(
      'Environment Variables (JSON)',
    ) as HTMLTextAreaElement;
    fireEvent.change(envTextarea, {
      target: { value: '{"KEY": "VALUE"}' },
    });
    expect(envTextarea.value).toBe('{"KEY": "VALUE"}');
  });

  it('ignores invalid JSON in record changes', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);
    const headersTextarea = screen.getByLabelText(
      'Headers (JSON)',
    ) as HTMLTextAreaElement;
    fireEvent.change(headersTextarea, {
      target: { value: '{"key":' },
    });
    expect(headersTextarea.value).toBe('{"key":');
    // We can't easily test the internal state without more complex setup,
    // but we can ensure saving still works and doesn't use the partial JSON.
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSave).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ headers: undefined }),
      undefined,
    );
  });

  it('calls onSave with the correct data', () => {
    render(
      <McpServerForm
        {...baseProps}
        serverName="OriginalName"
        serverConfig={{}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Server Name'), {
      target: { value: 'Updated Server' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Updated description' },
    });
    fireEvent.change(screen.getByLabelText('Arguments (comma-separated)'), {
      target: { value: 'a, b, c' },
    });
    fireEvent.click(screen.getByLabelText('Trust Server'));

    fireEvent.click(screen.getByText('Save'));

    expect(mockOnSave).toHaveBeenCalledWith(
      'Updated Server',
      expect.objectContaining({
        description: 'Updated description',
        args: ['a', 'b', 'c'],
        trust: true,
      }),
      'OriginalName',
    );
  });

  it('calls onCancel when the cancel button is clicked', () => {
    render(<McpServerForm {...baseProps} serverName={null} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });
});
