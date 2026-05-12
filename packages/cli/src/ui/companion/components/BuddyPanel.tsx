/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useBuddyState } from '../BuddyState.js';

const moodColor = {
  steady: 'magenta',
  blocked: 'red',
  protective: 'yellow',
  busy: 'cyan',
} as const;

export const BuddyPanel: React.FC = () => {
  const buddy = useBuddyState();

  if (!buddy.visible) {
    return null;
  }

  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
      <Text bold color="magenta">
        Pollux
      </Text>
      <Text dimColor> · </Text>
      <Text color={moodColor[buddy.mood]}>{buddy.mood}</Text>
      <Text> · {buddy.message}</Text>
    </Box>
  );
};
