/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@gemini-code/core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={Colors.Foreground}>Tips for getting started:</Text>
      <Text color={Colors.Foreground}>
        1.{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        for more information.
      </Text>
      <Text color={Colors.Foreground}>
        2. Ask coding questions, edit code or run commands.
      </Text>
      <Text color={Colors.Foreground}>
        3. Be specific for the best results.
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          4. Create{' '}
          <Text bold color={Colors.AccentPurple}>
            GEMINI.md
          </Text>{' '}
          files to customize your interactions with Gemini.
        </Text>
      )}
    </Box>
  );
};
