/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, mockUIActions } from '../../test-utils/render.js';
import { act } from 'react';
import { TeamSelectionDialog } from './TeamSelectionDialog.js';

describe('<TeamSelectionDialog />', () => {
  const mockTeams = [
    {
      name: 'team-one',
      displayName: 'Team One',
      description: 'First team description',
      agents: [],
      instructions: '',
      configPath: '/test/team1',
    },
    {
      name: 'team-two',
      displayName: 'Team Two',
      description: 'Second team description',
      agents: [],
      instructions: '',
      configPath: '/test/team2',
    },
  ];

  it('renders a list of discovered teams and standard options', async () => {
    const onSelect = vi.fn();
    const { lastFrame, unmount } = await renderWithProviders(
      <TeamSelectionDialog teams={mockTeams} onSelect={onSelect} />,
    );

    expect(lastFrame()).toContain('Select an Agent Team');
    expect(lastFrame()).toContain('Team One');
    expect(lastFrame()).toContain('Team Two');
    expect(lastFrame()).toContain('The Polyglot Team');
    expect(lastFrame()).toContain('No Team');
    expect(lastFrame()).toContain('Browse Team Marketplace');
    expect(lastFrame()).toContain('Create Team');
    unmount();
  });

  it('calls onSelect with team name when a team is selected', async () => {
    const onSelect = vi.fn();
    const { stdin, unmount } = await renderWithProviders(
      <TeamSelectionDialog teams={mockTeams} onSelect={onSelect} />,
    );

    await act(async () => {
      stdin.write('\r'); // Enter on first item
    });

    expect(onSelect).toHaveBeenCalledWith('team-one');
    unmount();
  });

  it('calls onSelect with undefined when No Team is selected', async () => {
    const onSelect = vi.fn();
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <TeamSelectionDialog teams={mockTeams} onSelect={onSelect} />,
    );

    // Navigate to No Team (index 3)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        stdin.write('\u001B[B'); // Down
      });
      await waitUntilReady();
    }

    await act(async () => {
      stdin.write('\r'); // Enter
    });

    expect(onSelect).toHaveBeenCalledWith(undefined);
    unmount();
  });

  it('shows marketplace view when selected', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin, waitUntilReady, unmount } =
      await renderWithProviders(
        <TeamSelectionDialog teams={mockTeams} onSelect={onSelect} />,
      );

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
    expect(lastFrame()).toContain(
      'community marketplace is currently under development',
    );

    // Go back with escape
    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('Select an Agent Team');
    unmount();
  });

  it('launches team creator wizard when Create Team is selected', async () => {
    const onSelect = vi.fn();
    const { stdin, waitUntilReady, unmount } = await renderWithProviders(
      <TeamSelectionDialog teams={mockTeams} onSelect={onSelect} />,
    );

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

    expect(mockUIActions.setIsTeamCreatorActive).toHaveBeenCalledWith(true);
    unmount();
  });
});
