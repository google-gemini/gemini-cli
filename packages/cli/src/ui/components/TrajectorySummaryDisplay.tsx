/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';

const MAX_SUMMARY_LENGTH = 80;

function normalizeSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '';
  }

  const sentenceMatch = collapsed.match(/^(.+?[.!?])(\s|$)/);
  const sentence = sentenceMatch ? sentenceMatch[1] : collapsed;

  if (sentence.length <= MAX_SUMMARY_LENGTH) {
    return sentence;
  }

  return sentence.slice(0, Math.max(0, MAX_SUMMARY_LENGTH - 3)) + '...';
}

function deriveGoalSummary(history: Array<{ type: string; text?: string }>) {
  for (const item of history) {
    if (item.type !== 'user') {
      continue;
    }
    const trimmed = item.text?.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('/')) {
      const withoutCommand = trimmed.replace(/^\/\S+\s+/, '').trim();
      if (!withoutCommand) {
        continue; // Skip slash commands like /help or /plan with no args
      }
      return normalizeSummary(withoutCommand);
    }
    return normalizeSummary(trimmed);
  }
  return '';
}

export const TrajectorySummaryDisplay: React.FC = () => {
  const { history } = useUIState();
  const summary = useMemo(() => deriveGoalSummary(history), [history]);

  if (!summary) {
    return null;
  }

  return (
    <Box paddingX={1}>
      <Text wrap="truncate-end">
        <Text color={theme.text.secondary}>Goal: </Text>
        <Text color={theme.text.primary} bold>
          {summary}
        </Text>
      </Text>
    </Box>
  );
};
