/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { MissionBrief } from '../services/MissionParser.js';

interface MissionPanelProps {
  brief: MissionBrief;
}

export const MissionPanel: React.FC<MissionPanelProps> = ({ brief }) => (
    <Box flexDirection="column" marginTop={1}>
      <Section label="Goal" value={brief.goal} color="white" bold />
      <Section label="Lane" value={brief.lane} color="cyan" />
      <ListSection label="Likely Files" items={brief.likelyFiles} />
      <ListSection
        label="Protected Zones"
        items={brief.protectedZones}
        color="red"
      />
      <ListSection label="Risks" items={brief.risks} color="yellow" />
      <ListSection label="Test Plan" items={brief.testPlan} />
      <ListSection
        label="Success Criteria"
        items={brief.successCriteria}
        color="green"
      />
    </Box>
  );

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
