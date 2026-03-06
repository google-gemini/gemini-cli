/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatCommand } from '../utils/keybindingUtils.js';
import { Command } from '../../config/keyBindings.js';

export const RawMarkdownIndicator: React.FC = () => {
  const modKey = formatCommand(Command.TOGGLE_MARKDOWN);
  return (
    <Box>
      <Text>
        raw markdown mode
        <Text color={theme.text.secondary}> ({modKey} to toggle) </Text>
      </Text>
    </Box>
  );
};
