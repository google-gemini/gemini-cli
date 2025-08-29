/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServerManager } from './McpServerManager';
import type { MCPServerConfig } from '@google/gemini-cli-core';

// Mock the McpServerForm component
vi.mock('./McpServerForm', () => ({
  McpServerForm: vi.fn(({ onSave, onCancel, serverName, serverConfig }) => (
    <div data-testid="mcp-server-form">
      <h1>{serverName ? 'Edit' : 'Add'} Server</h1>
      <button
        onClick={() =>
          onSave(
            serverName || 'NewServer',
            serverConfig || { description: 'new' },
            serverName,
          )
        }
      >
        Save
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )),
}));

describe('McpServerManager', () => {
  const mockOnChange = vi.fn();
  const mockServers: Record<string, MCPServerConfig> = {
    ServerA: { description: 'Description for A' },
    ServerB: { command: 'run-b' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the list of servers', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    expect(screen.getByText('ServerA')).toBeInTheDocument();
    expect(screen.getByText('Description for A')).toBeInTheDocument();
    expect(screen.getByText('ServerB')).toBeInTheDocument();
    expect(screen.getByText('Stdio: run-b')).toBeInTheDocument();
  });

  it('shows a message when no servers are configured', () => {
    render(<McpServerManager mcpServers={{}} onChange={mockOnChange} />);
    expect(screen.getByText('No MCP servers configured.')).toBeInTheDocument();
  });

  it('switches to the form view when "Add New Server" is clicked', () => {
    render(<McpServerManager mcpServers={{}} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Add New Server'));
    expect(screen.getByTestId('mcp-server-form')).toBeInTheDocument();
    expect(screen.getByText('Add Server')).toBeInTheDocument();
  });

  it('switches to the form view when "Edit" is clicked', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    fireEvent.click(screen.getAllByText('Edit')[0]); // Click edit for ServerA
    expect(screen.getByTestId('mcp-server-form')).toBeInTheDocument();
    expect(screen.getByText('Edit Server')).toBeInTheDocument();
  });

  it('calls onChange when a server is deleted', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    fireEvent.click(screen.getAllByText('Delete')[1]); // Click delete for ServerB
    expect(mockOnChange).toHaveBeenCalledWith({
      ServerA: { description: 'Description for A' },
    });
  });

  it('calls onChange when a new server is saved', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    fireEvent.click(screen.getByText('Add New Server'));
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockServers,
      NewServer: { description: 'new' },
    });
    // Should switch back to list view
    expect(screen.queryByTestId('mcp-server-form')).not.toBeInTheDocument();
  });

  it('calls onChange when an existing server is edited and saved', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    fireEvent.click(screen.getAllByText('Edit')[0]); // Edit ServerA
    fireEvent.click(screen.getByText('Save')); // The mock form will save with the original name

    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockServers,
      ServerA: { description: 'Description for A' }, // In a real scenario, this would be updated data
    });
    expect(screen.queryByTestId('mcp-server-form')).not.toBeInTheDocument();
  });

  it('switches back to the list view when "Cancel" is clicked', () => {
    render(
      <McpServerManager mcpServers={mockServers} onChange={mockOnChange} />,
    );
    fireEvent.click(screen.getByText('Add New Server'));
    expect(screen.getByTestId('mcp-server-form')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('mcp-server-form')).not.toBeInTheDocument();
  });
});
