/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { StatsDisplay } from './StatsDisplay.js';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => (
  <Box flexDirection="column">
    <StatsDisplay title="Agent powering down. Goodbye!" duration={duration} />
    <Box marginTop={1} marginLeft={1}>
      <Text>
        Resume this session by running{' '}
        <Text color="magenta">`gemini --resume`</Text>
      </Text>
    </Box>
  </Box>
);
