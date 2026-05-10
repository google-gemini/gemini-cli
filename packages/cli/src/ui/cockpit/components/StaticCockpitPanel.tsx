/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';

const PHASES = [
  'Mission',
  'Risk Scan',
  'Inspect',
  'Plan',
  'Edit',
  'Test',
  'Review',
  'Next Action',
] as const;

export const StaticCockpitPanel: React.FC = () => (
  <Box
    borderStyle="round"
    borderColor="cyan"
    flexDirection="column"
    paddingX={1}
    marginBottom={1}
    flexShrink={0}
  >
    <Text bold color="cyan">
      MISSION COCKPIT
    </Text>

    <Box flexDirection="row" flexWrap="wrap">
      {PHASES.map((phase, index) => (
        <Text key={phase} dimColor>
          {phase}
          {index < PHASES.length - 1 ? ' → ' : ''}
        </Text>
      ))}
    </Box>

    <Text dimColor>Mission: None</Text>
  </Box>
);
