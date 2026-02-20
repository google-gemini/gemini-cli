/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import {
  startupProfiler,
  type StartupPhaseStats,
} from '@google/gemini-cli-core';

const PHASE_NAME_COL_WIDTH = 28;
const DURATION_COL_WIDTH = 15;

const PhaseRow: React.FC<{ phase: StartupPhaseStats }> = ({ phase }) => {
  const name = phase.name.replace(/_/g, ' ');
  return (
    <Box>
      <Box width={PHASE_NAME_COL_WIDTH}>
        <Text color={theme.text.link}>{name}</Text>
      </Box>
      <Box width={DURATION_COL_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.primary}>
          {formatDuration(phase.duration_ms)}
        </Text>
      </Box>
    </Box>
  );
};

export const StartupStatsDisplay: React.FC = () => {
  const phases = startupProfiler.getStartupStats();

  if (phases.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingTop={1}
        paddingX={2}
      >
        <Text color={theme.text.primary}>
          No startup stats available. Stats are recorded after CLI
          initialization completes.
        </Text>
      </Box>
    );
  }

  const totalDuration = phases.reduce((sum, p) => sum + p.duration_ms, 0);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      width={50}
    >
      <Text bold color={theme.text.accent}>
        Startup Stats For Nerds
      </Text>
      <Box height={1} />

      <Box>
        <Box width={PHASE_NAME_COL_WIDTH}>
          <Text bold color={theme.text.primary}>
            Phase
          </Text>
        </Box>
        <Box width={DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            Duration
          </Text>
        </Box>
      </Box>

      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      {phases.map((phase) => (
        <PhaseRow key={phase.name} phase={phase} />
      ))}

      <Box height={1} />

      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      <Box>
        <Box width={PHASE_NAME_COL_WIDTH}>
          <Text bold color={theme.text.primary}>
            Total
          </Text>
        </Box>
        <Box width={DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.status.success}>
            {formatDuration(totalDuration)}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
