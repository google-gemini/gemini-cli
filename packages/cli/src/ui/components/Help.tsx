/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../hooks/slashCommandProcessor.js';

interface Help {
  commands: SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={Colors.Foreground}>
      Abilities:
    </Text>
    <Text color={Colors.Foreground}> * Use tools to read and write files</Text>
    <Text color={Colors.Foreground}>
      {' '}
      * Semantically search and explain code
    </Text>
    <Text color={Colors.Foreground}> * Execute bash commands</Text>
    <Box height={1} />
    <Text bold color={Colors.Foreground}>
      Commands:
    </Text>
    {commands.map((command: SlashCommand) => (
      <Text key={command.name} color={Colors.SubtleComment}>
        <Text bold color={Colors.AccentPurple}>
          {' '}
          /{command.name}
        </Text>
        {command.description && ' - ' + command.description}
      </Text>
    ))}
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>
        {' '}
        !{' '}
      </Text>
      shell command
    </Text>
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>
        {' '}
        ${' '}
      </Text>
      echo hello world
    </Text>
  </Box>
);
