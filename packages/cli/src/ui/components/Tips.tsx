/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type Config } from '@google/gemini-cli-core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column">
      <Text color={theme.text.primary}>Tips for getting started:</Text>
      <Text color={theme.text.primary}>
        1. Ask questions, edit files, or run commands.
      </Text>
      <Text color={theme.text.primary}>
        2. Be specific for the best results.
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={theme.text.primary}>
          3. Create{' '}
          <Text bold color={theme.text.accent}>
            GEMINI.md
          </Text>{' '}
          files to customize your interactions with Gemini.
        </Text>
      )}
      <Text color={theme.text.primary}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={theme.text.accent}>
          /help
        </Text>{' '}
        for more information.
      </Text>
    </Box>
  );
};
