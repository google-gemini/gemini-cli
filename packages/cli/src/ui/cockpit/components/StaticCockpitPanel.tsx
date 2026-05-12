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

interface StaticCockpitPanelProps {
  polluxMessage?: string;
}

export const StaticCockpitPanel: React.FC<StaticCockpitPanelProps> = ({
  polluxMessage,
}) => {
  const {
    missionBrief,
    missionCouncil,
    phase: activePhase,
    detailsExpanded,
  } = useCockpitState();

  const riskLevel = missionCouncil?.riskOfficer.riskLevel ?? 'Safe';
  const riskColor =
    riskLevel === 'Safe'
      ? 'green'
      : riskLevel === 'Medium'
        ? 'yellow'
        : 'red';
  const nextAction = missionCouncil?.finalRoute.firstAction;

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={1}
      marginBottom={1}
      flexShrink={0}
    >
      <Box>
        <Text bold color="cyan">
          GC COCKPIT
        </Text>
        <Text dimColor> · F10 {detailsExpanded ? 'collapse' : 'details'}</Text>
        {polluxMessage && !detailsExpanded && (
          <Text color="magenta"> · Pollux: {polluxMessage}</Text>
        )}
      </Box>

      <PhaseStatusPanel activePhase={activePhase} />

      {detailsExpanded ? (
        <>
          {missionBrief && (
            <MissionPanel
              brief={missionBrief}
              council={missionCouncil ?? undefined}
            />
          )}
          {missionCouncil && <CouncilPanel result={missionCouncil} />}
        </>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Box width={12}>
              <Text dimColor>Mission:</Text>
            </Box>
            <Text color="white" bold>
              {missionBrief?.goal ?? 'No active mission'}
            </Text>
          </Box>
          <Box>
            <Box width={12}>
              <Text dimColor>Risk:</Text>
            </Box>
            <Text color={riskColor}>{riskLevel}</Text>
          </Box>
          {nextAction && (
            <Box>
              <Box width={12}>
                <Text dimColor>Next:</Text>
              </Box>
              <Text>{nextAction}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
