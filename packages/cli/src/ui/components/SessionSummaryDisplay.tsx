/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import path from 'node:path';
import { Box, Text } from 'ink';
import { StatsDisplay } from './StatsDisplay.js';
import { theme } from '../semantic-colors.js';

interface SessionSummaryDisplayProps {
  duration: string;
  sessionId?: string;
}

const getCliName = (): string => {
  const scriptPath = process.argv[1] || '';
  const baseName = path.basename(scriptPath, '.js');
  return baseName || 'gemini';
};

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  sessionId,
}) => (
  <Box flexDirection="column">
    <StatsDisplay title="Agent powering down. Goodbye!" duration={duration} />
    {sessionId && (
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Resume this session by running{' '}
          <Text color={theme.text.link}>{getCliName()} --resume</Text>
        </Text>
      </Box>
    )}
  </Box>
);
