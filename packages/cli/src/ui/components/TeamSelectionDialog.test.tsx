/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { TeamSelectionDialog } from './TeamSelectionDialog.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { type TeamDefinition } from '@google/gemini-cli-core';

describe('<TeamSelectionDialog />', () => {
  const mockTeams: TeamDefinition[] = [
    {
      name: 'team-1',
      displayName: 'Team One',
      description: 'First team description',
      instructions: 'Instructions 1',
      agents: [],
    },
    {
      name: 'team-2',
      displayName: 'Team Two',
      description: 'Second team description',
      instructions: 'Instructions 2',
      agents: [],
    },
  ];

  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockReset();
  });

  const renderComponent = async () => renderWithProviders(
      <TeamSelectionDialog teams={mockTeams} onSelect={mockOnSelect} />,
    );

  it('renders all options correctly', async () => {
    const { lastFrame, unmount } = await renderComponent();
    const output = lastFrame();

    expect(output).toContain('Select an Agent Team');
    expect(output).toContain('Team One');
    expect(output).toContain('First team description');
    expect(output).toContain('Team Two');
    expect(output).toContain('Second team description');
    expect(output).toContain('No Team');
    expect(output).toContain('Browse Marketplace (Coming Soon)');
    expect(output).toContain('Create Team (Coming Soon)');
    unmount();
  });

  it('calls onSelect with team name when a team is selected', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Default selection is index 0 (Team One)
    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith('team-1');
    });
    unmount();
  });

  it('calls onSelect with undefined when "No Team" is selected', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Navigate to "No Team" (index 2)
    await act(async () => {
      stdin.write('\u001B[B'); // Down
    });
    await waitUntilReady();
    await act(async () => {
      stdin.write('\u001B[B'); // Down
    });
    await waitUntilReady();

    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(undefined);
    });
    unmount();
  });

  it('does not call onSelect for placeholder options', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Navigate to "Browse Marketplace" (index 3)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        stdin.write('\u001B[B'); // Down
      });
      await waitUntilReady();
    }

    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitUntilReady();

    expect(mockOnSelect).not.toHaveBeenCalled();
    unmount();
  });
});
