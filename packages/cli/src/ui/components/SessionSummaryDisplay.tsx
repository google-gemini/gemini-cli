/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { StatsDisplay } from './StatsDisplay.js';
import { Colors } from '../colors.js';

interface SessionSummaryDisplayProps {
  duration: string;
  sessionName?: string;
  resumeCommandHint?: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  sessionName,
  resumeCommandHint,
}) => (
  <Box flexDirection="column">
    <StatsDisplay title="Agent powering down. Goodbye!" duration={duration} />
    {sessionName && resumeCommandHint && (
      <Box flexDirection="column" marginTop={1}>
        <Text color={Colors.Gray}>
          Session: <Text color={Colors.Foreground}>{sessionName}</Text>
        </Text>
        <Text color={Colors.Gray}>
          You can resume your session by typing:{' '}
          <Text color={Colors.AccentPurple}>{resumeCommandHint}</Text>
        </Text>
      </Box>
    )}
  </Box>
);
