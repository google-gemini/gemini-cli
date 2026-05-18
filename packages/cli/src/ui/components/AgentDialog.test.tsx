/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { AgentDialog } from './AgentDialog.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { createMockSettings } from '../../test-utils/settings.js';
import type { Config } from '@google/gemini-cli-core';

describe('<AgentDialog />', () => {
  const mockSetAgent = vi.fn();
  const mockGetAgent = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnSelect = vi.fn();

  interface MockConfig extends Partial<Config> {
    setAgent: (agent: string, isTemporary?: boolean) => void;
    getAgent: () => string;
    getSessionId: () => string;
    getIdeMode: () => boolean;
  }

  const mockConfig: MockConfig = {
    setAgent: mockSetAgent,
    getAgent: mockGetAgent,
    getSessionId: () => 'test-session-id',
    getIdeMode: () => false,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAgent.mockReturnValue('gemini-cli');
  });

  const renderComponent = async (configValue = mockConfig as Config) => {
    const settings = createMockSettings({});

    const result = await renderWithProviders(
      <AgentDialog onClose={mockOnClose} onSelect={mockOnSelect} />,
      {
        config: configValue,
        settings,
      },
    );
    return result;
  };

  it('renders the agent selection view correctly', async () => {
    const { lastFrame, unmount } = await renderComponent();
    const output = lastFrame();
    expect(output).toContain('Select Agent');
    expect(output).toContain('Remember agent for future sessions: false');
    expect(output).toContain('Gemini CLI (Standard)');
    expect(output).toContain('Gemini Enterprise');
    unmount();
  });

  it('selects agent and closes when an option is selected', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Select Gemini CLI (default selection is first item) by pressing Enter
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetAgent).toHaveBeenCalledWith('gemini-cli', true); // Ephemeral by default
      expect(mockOnSelect).toHaveBeenCalledWith('gemini-cli');
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('selects the second agent when navigating and pressing enter', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Press arrow down to move selection to index 1 (gemini-enterprise)
    await act(async () => {
      stdin.write('\u001B[B'); // Arrow Down
    });
    await waitUntilReady();

    // Press enter to select
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetAgent).toHaveBeenCalledWith('gemini-enterprise', true);
      expect(mockOnSelect).toHaveBeenCalledWith('gemini-enterprise');
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('toggles persist mode with Tab key', async () => {
    const { lastFrame, stdin, waitUntilReady, unmount } = await renderComponent();

    expect(lastFrame()).toContain('Remember agent for future sessions: false');

    // Press Tab to toggle persist mode
    await act(async () => {
      stdin.write('\t');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(lastFrame()).toContain('Remember agent for future sessions: true');
    });

    // Select first item (gemini-cli) with persist mode active
    await act(async () => {
      stdin.write('\r');
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockSetAgent).toHaveBeenCalledWith('gemini-cli', false); // Persist enabled (isTemporary = false)
      expect(mockOnSelect).toHaveBeenCalledWith('gemini-cli');
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });

  it('closes dialog on escape key press', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    unmount();
  });
});
