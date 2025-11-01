/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { SettingsProvider } from '../../contexts/SettingsContext';

// Mock child components and global APIs
vi.mock('./McpServer/McpServerManager', () => ({
  McpServerManager: vi.fn(({ mcpServers, onChange }) => (
    <div data-testid="mcp-server-manager">
      <button onClick={() => onChange({ ...mcpServers, new: {} })}>
        Update Servers
      </button>
    </div>
  )),
}));

const mockSettingsGet = vi.fn();
const mockSettingsSet = vi.fn();
const mockThemesGet = vi.fn();
const mockRestartTerminal = vi.fn();
const mockGetSchema = vi.fn();

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the global electron API by attaching it to the existing window
    window.electron = {
      settings: {
        get: mockSettingsGet,
        getSchema: mockGetSchema,
        set: mockSettingsSet,
        restartTerminal: mockRestartTerminal,
      },
      themes: {
        get: mockThemesGet,
      },
      onMainWindowResize: vi.fn(() => vi.fn()),
      terminal: {
        onData: vi.fn(() => vi.fn()),
        sendKey: vi.fn(),
        resize: vi.fn(),
        onReset: vi.fn(() => vi.fn()),
      },
      theme: {
        set: vi.fn(),
        onInit: vi.fn(() => vi.fn()),
      },
      languageMap: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(),
      },
      onShowGeminiEditor: vi.fn(() => vi.fn()),
      resolveDiff: vi.fn().mockResolvedValue({ success: true }),
    };

    // Provide default mock implementations
    mockSettingsGet.mockResolvedValue({
      merged: {
        theme: 'Default Dark',
        vimMode: false,
        mcpServers: {},
      },
    });
    mockThemesGet.mockResolvedValue([
      { name: 'Default Dark' },
      { name: 'Default Light' },
    ]);
    mockGetSchema.mockResolvedValue({
      ui: {
        category: 'UI',
        properties: {
          theme: {
            type: 'string',
            label: 'Theme',
            category: 'UI',
            showInDialog: true,
          },
        },
      },
      general: {
        category: 'General',
        properties: {
          vimMode: {
            type: 'boolean',
            label: 'Vim Mode',
            category: 'General',
            showInDialog: true,
          },
          preferredEditor: {
            type: 'string',
            label: 'Preferred Editor',
            category: 'General',
            showInDialog: true,
          },
          memoryImportFormat: {
            type: 'enum',
            label: 'Memory Import Format',
            category: 'General',
            showInDialog: true,
            options: [
              { value: 'tree', label: 'Tree' },
              { value: 'flat', label: 'Flat' },
            ],
          },
          terminalCwd: {
            type: 'string',
            label: 'Terminal Working Directory',
            category: 'General',
            showInDialog: true,
          },
        },
      },
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SettingsProvider>
        <SettingsModal isOpen={false} onClose={() => {}} />
      </SettingsProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when isOpen is true and fetches initial data', async () => {
    const { container } = render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(mockSettingsGet).toHaveBeenCalled();
      expect(mockThemesGet).toHaveBeenCalled();
      expect(mockGetSchema).toHaveBeenCalled();
    });

    expect(screen.getByText('Settings')).toBeInTheDocument();
    const sidebar = container.querySelector('.settings-sidebar');
    expect(sidebar?.querySelector('.active')?.textContent).toBe('General');
  });

  it('calls onClose when the close button is clicked', async () => {
    const handleClose = vi.fn();
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={handleClose} />
      </SettingsProvider>,
    );
    await waitFor(() => screen.getByText('Settings'));
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it('switches categories when a sidebar item is clicked', async () => {
    const { container } = render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('UI')).toBeInTheDocument();
    });

    const sidebar = container.querySelector('.settings-sidebar');
    expect(sidebar?.querySelector('.active')?.textContent).toBe('General');

    fireEvent.click(screen.getByText('UI'));

    expect(sidebar?.querySelector('.active')?.textContent).toBe('UI');
    expect(screen.queryByText('General', { selector: 'li.active' })).toBeNull();
  });

  it('handles changing a checkbox setting', async () => {
    mockSettingsGet.mockResolvedValue({ merged: { vimMode: false } });
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => screen.getByRole('heading', { name: 'General' }));

    const vimCheckbox = await screen.findByLabelText('Vim Mode');
    expect(vimCheckbox).not.toBeChecked();

    fireEvent.click(vimCheckbox);

    // We don't expect it to be checked immediately because it waits for refreshSettings
    // But we can check if set was called.
    await waitFor(() => {
      expect(mockSettingsSet).toHaveBeenCalledWith({
        changes: { general: { vimMode: true } },
        scope: 'User',
      });
    });
  });

  it('handles changing a text input setting', async () => {
    mockSettingsGet.mockResolvedValue({ merged: { preferredEditor: 'code' } });
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => screen.getByRole('heading', { name: 'General' }));

    const editorInput = await screen.findByLabelText('Preferred Editor');
    fireEvent.change(editorInput, { target: { value: 'vim' } });

    await waitFor(() => {
      expect(mockSettingsSet).toHaveBeenCalledWith({
        changes: { general: { preferredEditor: 'vim' } },
        scope: 'User',
      });
    });
  });

  it('handles changing a select setting', async () => {
    mockSettingsGet.mockResolvedValue({
      merged: { memoryImportFormat: 'tree' },
    });
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => screen.getByRole('heading', { name: 'General' }));

    const formatSelect = await screen.findByLabelText('Memory Import Format');
    fireEvent.change(formatSelect, { target: { value: 'flat' } });

    await waitFor(() => {
      expect(mockSettingsSet).toHaveBeenCalledWith({
        changes: { general: { memoryImportFormat: 'flat' } },
        scope: 'User',
      });
    });
  });

  it('renders McpServerManager and handles changes', async () => {
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => screen.getByText('MCP Servers'));
    fireEvent.click(screen.getByText('MCP Servers'));

    const manager = await screen.findByTestId('mcp-server-manager');
    expect(manager).toBeInTheDocument();

    fireEvent.click(screen.getByText('Update Servers'));

    await waitFor(() => {
      expect(mockSettingsSet).toHaveBeenCalledWith({
        changes: { mcpServers: { new: {} } },
        scope: 'User',
      });
    });
  });

  it('handles changing the terminal cwd setting', async () => {
    mockSettingsGet.mockResolvedValue({
      merged: { terminalCwd: '/Users/test' },
    });
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </SettingsProvider>,
    );

    await waitFor(() => screen.getByRole('heading', { name: 'General' }));

    const cwdInput = await screen.findByLabelText('Terminal Working Directory');
    fireEvent.change(cwdInput, { target: { value: '/Users/test/new' } });

    await waitFor(() => {
      expect(mockSettingsSet).toHaveBeenCalledWith({
        changes: { general: { terminalCwd: '/Users/test/new' } },
        scope: 'User',
      });
    });
  });
});
