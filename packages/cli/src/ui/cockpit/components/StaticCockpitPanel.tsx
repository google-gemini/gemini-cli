/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useCockpitState } from '../CockpitState.js';
import { PhaseStatusPanel } from './PhaseStatusPanel.js';
import { MissionPanel } from './MissionPanel.js';
import { CouncilPanel } from './CouncilPanel.js';

export const StaticCockpitPanel: React.FC = () => {
  const {
    missionBrief,
    missionCouncil,
    phase: activePhase,
  } = useCockpitState();

  return (
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

      <PhaseStatusPanel activePhase={activePhase} />

      {missionBrief && (
        <MissionPanel
          brief={missionBrief}
          council={missionCouncil ?? undefined}
        />
      )}
      {missionCouncil && <CouncilPanel result={missionCouncil} />}
    </Box>
  );
};
