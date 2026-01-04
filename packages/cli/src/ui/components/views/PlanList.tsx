/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { PlanDetail } from '../../types.js';

interface PlanListProps {
  plans: readonly PlanDetail[];
}

const STATUS_COLORS: Record<PlanDetail['status'], string> = {
  draft: theme.text.secondary,
  saved: theme.text.link,
  executed: theme.status.success,
};

const STATUS_LABELS: Record<PlanDetail['status'], string> = {
  draft: 'draft',
  saved: 'saved',
  executed: 'executed',
};

export const PlanList: React.FC<PlanListProps> = ({ plans }) => {
  if (plans.length === 0) {
    return <Text>No saved plans found.</Text>;
  }

  // Find the most recently viewed plan
  const lastViewedPlan = plans.reduce<PlanDetail | null>((latest, plan) => {
    if (!plan.lastViewed) return latest;
    if (!latest || !latest.lastViewed) return plan;
    return plan.lastViewed > latest.lastViewed ? plan : latest;
  }, null);

  return (
    <Box flexDirection="column">
      <Text>Saved implementation plans:</Text>
      <Box height={1} />
      {plans.map((plan) => {
        const isoString = plan.updatedAt;
        const match = isoString.match(
          /(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/,
        );
        const formattedDate = match
          ? `${match[1]} ${match[2]}`
          : 'Invalid Date';
        const isLastViewed = lastViewedPlan && plan.id === lastViewedPlan.id;
        return (
          <Box key={plan.id} flexDirection="row">
            <Text>
              {'  '}- <Text color={theme.text.accent}>{plan.title}</Text>{' '}
              <Text color={theme.text.secondary}>({formattedDate})</Text>{' '}
              <Text color={STATUS_COLORS[plan.status]}>
                [{STATUS_LABELS[plan.status]}]
              </Text>
              {isLastViewed && (
                <Text color={theme.text.link}> [last viewed]</Text>
              )}
            </Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text color={theme.text.secondary}>
        Use /plan view &lt;title&gt; to see a plan, /plan resume &lt;title&gt;
        to execute, /plan export &lt;title&gt; &lt;file&gt; to export
      </Text>
    </Box>
  );
};
