/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { MissionBrief } from '../services/MissionParser.js';
import type { MissionCouncilResult } from '../services/MissionCouncil.js';

interface MissionPanelProps {
  brief: MissionBrief;
  council?: MissionCouncilResult;
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  brief,
  council,
}) => {
  const protectedZones =
    council && council.riskOfficer.protectedZones.length > 0
      ? council.riskOfficer.protectedZones
      : brief.protectedZones;

  const risks =
    council && council.riskOfficer.reasons.length > 0
      ? council.riskOfficer.reasons
      : brief.risks;

  const testPlan =
    council && council.testCaptain.testStrategy.length > 0
      ? council.testCaptain.testStrategy
      : brief.testPlan;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Section label="Goal" value={brief.goal} color="white" bold />
      <Section label="Lane" value={brief.lane} color="cyan" />
      <ListSection label="Likely Files" items={brief.likelyFiles} />
      <ListSection label="Protected Zones" items={protectedZones} color="red" />
      <ListSection label="Risks" items={risks} color="yellow" />
      <ListSection label="Test Plan" items={testPlan} />
      <ListSection
        label="Success Criteria"
        items={brief.successCriteria}
        color="green"
      />
    </Box>
  );
};

const Section: React.FC<{
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}> = ({ label, value, color, bold }) => (
  <Box>
    <Box width={20}>
      <Text dimColor>{label}:</Text>
    </Box>
    <Text color={color} bold={bold}>
      {value}
    </Text>
  </Box>
);

const ListSection: React.FC<{
  label: string;
  items: string[];
  color?: string;
}> = ({ label, items, color }) => (
  <Box>
    <Box width={20}>
      <Text dimColor>{label}:</Text>
    </Box>
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i} color={color}>
          {item}
        </Text>
      ))}
    </Box>
  </Box>
);
