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

  const renderComponent = async () =>
    renderWithProviders(
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
    expect(output).toContain('The Polyglot Team (Curated)');
    expect(output).toContain('No Team');
    expect(output).toContain('Browse Team Marketplace');
    expect(output).toContain('Create Team');
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

    // Navigate to "No Team" (index 3: Team 1, Team 2, Polyglot, No Team)
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

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(undefined);
    });
    unmount();
  });

  it('does not call onSelect for placeholder options', async () => {
    const { stdin, waitUntilReady, unmount } = await renderComponent();

    // Navigate to "Browse Team Marketplace" (index 4)
    for (let i = 0; i < 4; i++) {
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

  it('shows marketplace sub-view when selected', async () => {
    const { stdin, lastFrame, waitUntilReady, unmount } =
      await renderComponent();

    // Navigate to Marketplace (index 4)
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        stdin.write('\u001B[B'); // Down
      });
      await waitUntilReady();
    }

    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitUntilReady();

    expect(lastFrame()).toContain('Agent Team Marketplace');
    expect(lastFrame()).toContain('under development');

    // Go back
    await act(async () => {
      stdin.write('a');
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('Select an Agent Team');
    unmount();
  });

  it('shows create team sub-view when selected', async () => {
    const { stdin, lastFrame, waitUntilReady, unmount } =
      await renderComponent();

    // Navigate to Create Team (index 5)
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        stdin.write('\u001B[B'); // Down
      });
      await waitUntilReady();
    }

    await act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitUntilReady();

    expect(lastFrame()).toContain('Create New Agent Team');
    expect(lastFrame()).toContain('Create a directory in .gemini/teams/');

    // Go back
    await act(async () => {
      stdin.write('a');
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('Select an Agent Team');
    unmount();
  });
});
