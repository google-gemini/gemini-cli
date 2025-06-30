/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

const GradientHeading = ({ children }: { children: React.ReactNode }) => (
  <Text bold color={Colors.Foreground}>{children}</Text>
);

export const ContextHelp: React.FC = () => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={Colors.Gray}
    borderStyle="round"
    padding={1}
  >
    {/* Gradient Title */}
    <GradientHeading>Context Management Commands:</GradientHeading>
    <Text color={Colors.Foreground}>
      Use{' '}
      <Text bold color={Colors.AccentPurple}>
        @
      </Text>{' '}
      commands to manage files in your conversation context.
    </Text>

    <Box height={1} />

    {/* File Inclusion */}
    <GradientHeading>File Inclusion:</GradientHeading>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @filename
      </Text>{' '}
      - Include a specific file in context (e.g.,{' '}
      <Text bold color={Colors.AccentPurple}>
        @src/main.ts
      </Text>
      )
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @directory/
      </Text>{' '}
      - Include all files in a directory (e.g.,{' '}
      <Text bold color={Colors.AccentPurple}>
        @src/
      </Text>
      )
    </Text>

    <Box height={1} />

    {/* Context Management Commands */}
    <GradientHeading>Context Management:</GradientHeading>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @list
      </Text>{' '}
      - Show all files currently in context with sizes and token estimates
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @status
      </Text>{' '}
      - Display current context usage statistics
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @remove filename
      </Text>{' '}
      - Remove a specific file from context
    </Text>
    <Text color={Colors.Foreground}>
      <Text bold color={Colors.AccentPurple}>
        @clear
      </Text>{' '}
      - Remove all files from context
    </Text>

    <Box height={1} />

    {/* Tips */}
    <GradientHeading>Tips:</GradientHeading>
    <Text color={Colors.Foreground}>
      • Files are automatically tracked when you include them with{' '}
      <Text bold color={Colors.AccentPurple}>
        @
      </Text>
    </Text>
    <Text color={Colors.Foreground}>
      • Context is limited to ~1M tokens - use{' '}
      <Text bold color={Colors.AccentPurple}>
        @status
      </Text>{' '}
      to monitor usage
    </Text>
    <Text color={Colors.Foreground}>
      • Git-ignored files are automatically excluded from context
    </Text>
    <Text color={Colors.Foreground}>
      • Use{' '}
      <Text bold color={Colors.AccentPurple}>
        @list
      </Text>{' '}
      to see what files are currently in your context
    </Text>
  </Box>
); 