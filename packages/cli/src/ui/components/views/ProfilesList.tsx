/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type ProfileDefinition } from '../../types.js';

interface ProfilesListProps {
  profiles: readonly ProfileDefinition[];
  activeProfileName?: string;
  showDescriptions: boolean;
}

export const ProfilesList: React.FC<ProfilesListProps> = ({
  profiles,
  activeProfileName,
  showDescriptions,
}) => {
  const sortedProfiles = profiles
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const renderProfile = (profile: ProfileDefinition) => {
    const isActive = profile.name === activeProfileName;

    return (
      <Box key={profile.name} flexDirection="row">
        <Text color={theme.text.primary}>{'  '}- </Text>
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text bold color={isActive ? theme.text.link : theme.text.primary}>
              {profile.name}
            </Text>
            {isActive && (
              <Text color={theme.status.success}>{' [Active]'}</Text>
            )}
          </Box>
          {showDescriptions && profile.description && (
            <Box marginLeft={2}>
              <Text color={theme.text.secondary}>{profile.description}</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {sortedProfiles.length > 0 ? (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary}>
            Available Profiles:
          </Text>
          <Box height={1} />
          {sortedProfiles.map(renderProfile)}
        </Box>
      ) : (
        <Text color={theme.text.primary}>No profiles available</Text>
      )}
    </Box>
  );
};
