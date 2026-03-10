/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { render, Box, Text } from 'ink';
import { loadSettings } from '../../config/settings.js';
import { ProfileManager } from '../../config/profile-manager.js';
import { exitCli } from '../utils.js';

/**
 * View component for listing profiles in the terminal.
 */
const ProfileListView = ({
  profiles,
  activeProfile,
}: {
  profiles: string[];
  activeProfile?: string;
}) => {
  if (profiles.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">No profiles found.</Text>
        <Text dimColor>
          Profiles are stored as .md files in ~/.gemini/profiles/
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold underline>
        Available Profiles:
      </Text>
      {profiles.map((name) => (
        <Box key={name} marginLeft={2}>
          <Text color={name === activeProfile ? 'green' : 'white'}>
            {name === activeProfile ? '●' : '○'} {name}
          </Text>
          {name === activeProfile && (
            <Text color="green" italic>
              {' '}
              (active)
            </Text>
          )}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          Use `gemini profiles enable {'<name>'}` to switch profiles.
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Command module for `gemini profiles list`.
 */
export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all available profiles.',
  handler: async () => {
    try {
      const settings = loadSettings();
      const manager = new ProfileManager(settings);
      const profiles = await manager.listProfiles();
      const activeProfile = manager.getActiveProfileName();

      const { waitUntilExit } = render(
        <ProfileListView profiles={profiles} activeProfile={activeProfile} />,
      );
      await waitUntilExit();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error listing profiles: ${error instanceof Error ? error.message : String(error)}`,
      );
      await exitCli(1);
    }
  },
};
