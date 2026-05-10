/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { PHASES, type Phase } from '../CockpitState.js';

interface PhaseStatusPanelProps {
  activePhase: Phase;
}

export const PhaseStatusPanel: React.FC<PhaseStatusPanelProps> = ({
  activePhase,
}) => {
  const activeIndex = PHASES.indexOf(activePhase);

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {PHASES.map((phase, index) => {
        const isCompleted = index < activeIndex;
        const isActive = index === activeIndex;
        const isFuture = index > activeIndex;

        let icon = '  ';
        let color: string | undefined;
        let dim = false;

        if (isCompleted) {
          icon = '✔ ';
          color = 'green';
        } else if (isActive) {
          icon = '● ';
          color = 'yellow';
        } else if (isFuture) {
          dim = true;
        }

        return (
          <Box key={phase} marginRight={1}>
            <Text color={color} dimColor={dim} bold={isActive}>
              {icon}
              {phase}
            </Text>
            {index < PHASES.length - 1 && (
              <Box marginLeft={1}>
                <Text dimColor> → </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
