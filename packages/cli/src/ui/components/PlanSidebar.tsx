/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import { Box, Text } from 'ink';
import { usePlan } from '../contexts/PlanContext.js';
import { Colors } from '../colors.js';

function ProgressBarComponent({ progress }: { progress: number }) {
  const width = 20;
  const completed = Math.round(width * progress);
  const remaining = width - completed;
  return (
    <Text>
      [{'#'.repeat(completed)}
      {'.'.repeat(remaining)}] {Math.round(progress * 100)}%
    </Text>
  );
}

const ProgressBar = memo(ProgressBarComponent);

function PlanSidebarComponent({ width = 30 }: { width?: number }) {
  const { steps, currentStep } = usePlan();
  if (!steps.length) {
    return null;
  }
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      paddingX={1}
      marginLeft={1}
      width={width}
    >
      <Text color={Colors.AccentBlue}>Plan</Text>
      {steps.map((step, idx) => (
        <Box key={step.id} flexDirection="column">
          <Text color={idx === currentStep ? Colors.AccentGreen : undefined}>
            {idx === currentStep ? '→ ' : '  '}
            {`${step.id}. ${step.description} [${step.status}]`}
          </Text>
          <ProgressBar progress={step.progress} />
        </Box>
      ))}
    </Box>
  );
}

export const PlanSidebar = memo(PlanSidebarComponent);
