/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { MissionCouncilResult } from '../services/MissionCouncil.js';

interface CouncilPanelProps {
  result: MissionCouncilResult;
}

export const CouncilPanel: React.FC<CouncilPanelProps> = ({ result }) => (
  <Box flexDirection="column" marginTop={1}>
    <Box marginBottom={0}>
      <Text bold underline>
        MISSION COUNCIL v1
      </Text>
    </Box>

    <Section
      label="Scout"
      items={result.scout.contextNeeded}
      placeholder="No extra context needed"
    />
    <Section label="Architect" items={result.architect.proposedStructure} />
    <RiskSection label="Risk Officer" result={result.riskOfficer} />
    <Section label="Test Captain" items={result.testCaptain.testStrategy} />
    <Section
      label="Critic"
      items={result.critic.potentialFlaws}
      placeholder="No flaws detected"
    />

    <Box marginTop={0}>
      <Box width={20}>
        <Text bold color="magenta">
          Final Route:
        </Text>
      </Box>
      <Text color="magenta" bold>
        {result.finalRoute.firstAction}
      </Text>
    </Box>
  </Box>
);

const Section: React.FC<{
  label: string;
  items: string[];
  placeholder?: string;
}> = ({ label, items, placeholder }) => (
  <Box>
    <Box width={20}>
      <Text dimColor>{label}:</Text>
    </Box>
    <Box flexDirection="column">
      {items.length > 0 ? (
        items.map((item, i) => <Text key={i}>{item}</Text>)
      ) : (
        <Text dimColor italic>
          {placeholder}
        </Text>
      )}
    </Box>
  </Box>
);

const RiskSection: React.FC<{
  label: string;
  result: MissionCouncilResult['riskOfficer'];
}> = ({ label, result }) => {
  const color =
    result.riskLevel === 'Safe'
      ? 'green'
      : result.riskLevel === 'Medium'
        ? 'yellow'
        : 'red';
  return (
    <Box>
      <Box width={20}>
        <Text dimColor>{label}:</Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text color={color} bold>
            [{result.riskLevel}]{' '}
          </Text>
          <Text>{result.protectedZones.join(', ')}</Text>
        </Box>
        {result.reasons.map((reason, i) => (
          <Text key={i} dimColor>
            - {reason}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
