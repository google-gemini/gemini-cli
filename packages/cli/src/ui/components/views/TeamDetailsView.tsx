/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import {
  type RegistryTeam,
} from '@google/gemini-cli-core';
import { useKeypress } from '../../hooks/useKeypress.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { theme } from '../../semantic-colors.js';
import { ProviderTag } from '../shared/ProviderTag.js';

export interface TeamDetailsViewProps {
  team: RegistryTeam;
  onBack: () => void;
  onInstall: () => void | Promise<void>;
  isInstalled: boolean;
}

export function TeamDetailsView({
  team,
  onBack,
  onInstall,
  isInstalled,
}: TeamDetailsViewProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const [isInstalling, setIsInstalling] = useState(false);

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onBack();
        return true;
      }

      if (keyMatchers[Command.RETURN](key) && !isInstalled && !isInstalling) {
        setIsInstalling(true);
        void (async () => {
          await onInstall();
          setIsInstalling(false);
        })();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  if (isInstalling) {
    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        height="100%"
        borderStyle="round"
        borderColor={theme.border.default}
        justifyContent="center"
        alignItems="center"
      >
        <Text color={theme.text.primary}>
          Installing Team {team.displayName}...
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      height="100%"
      borderStyle="round"
      borderColor={theme.border.default}
    >
      {/* Header Row */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color={theme.text.secondary}>
            {'>'} Agent Teams {'>'}{' '}
          </Text>
          <Text color={theme.text.primary} bold>
            {team.displayName}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={theme.text.secondary}>
            {team.version ? `v${team.version}` : ''} |{' '}
          </Text>
          <Text color={theme.status.warning}>⭐ </Text>
          <Text color={theme.text.secondary}>
            {String(team.stars || 0)} |{' '}
          </Text>
          <Text color={theme.text.primary}>@{team.name}</Text>
        </Box>
      </Box>

      {/* Description */}
      <Box marginBottom={1}>
        <Text color={theme.text.primary}>{team.description}</Text>
      </Box>

      {/* Author */}
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>Author: </Text>
        <Text color={theme.text.primary}>{team.author || 'Community'}</Text>
      </Box>

      {/* Agents Roster */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Team Roster:
        </Text>
        {team.agents.map((agent) => (
          <Box key={agent.name} marginLeft={2} flexDirection="row">
            <Box width={15} flexShrink={0}>
              <Text color={theme.text.primary}>@{agent.name}</Text>
            </Box>
            <Box width={18} flexShrink={0} marginX={1}>
              <ProviderTag provider={agent.provider} />
            </Box>
            <Box flexShrink={1}>
              <Text color={theme.text.secondary} italic>
                {agent.description}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Instructions Summary */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Team Mission:
        </Text>
        <Box marginLeft={2}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {team.instructions}
          </Text>
        </Box>
      </Box>

      {/* Spacer to push installation UI to bottom */}
      <Box flexGrow={1} />

      {/* Installation UI */}
      {!isInstalled ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.status.warning}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.text.primary}>
            This team will be installed to your local .gemini/teams/ directory.
            Agent teams may contain custom instructions and configurations.
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Text color={theme.text.primary}>[{'Enter'}] Install Team</Text>
            <Box marginLeft={2}>
              <Text color={theme.text.secondary}>[Esc] Back</Text>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="row" marginTop={1} justifyContent="center" padding={1}>
          <Text color={theme.status.success}>Team Already Installed</Text>
          <Box marginLeft={2}>
            <Text color={theme.text.secondary}>[Esc] Back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
