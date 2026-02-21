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
import { parseSlashCommand } from '../../utils/commands.js';
import type { SlashCommand } from '../commands/types.js';

const MAX_SUMMARY_LENGTH = 80;

function normalizeSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '';
  }

  const sentenceMatch = collapsed.match(/^(.+?[.!?])(\s|$)/);
  const sentence = sentenceMatch ? sentenceMatch[1] : collapsed;

  const segments = Array.from(sentence);
  if (segments.length <= MAX_SUMMARY_LENGTH) {
    return sentence;
  }

  return (
    segments.slice(0, Math.max(0, MAX_SUMMARY_LENGTH - 3)).join('') + '...'
  );
}

function deriveGoalSummary(
  history: Array<{ type: string; text?: string }>,
  commands: readonly SlashCommand[],
) {
  for (const item of history) {
    if (item.type !== 'user') {
      continue;
    }
    const trimmed = item.text?.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('/')) {
      // Use parseSlashCommand to correctly strip the command path (including
      // subcommands like `/memory add` or `/chat resume`) so that only the
      // meaningful user-supplied arguments are used as the goal summary.
      const { args } = parseSlashCommand(trimmed, commands);
      const argsText = args.trim();
      if (!argsText) {
        continue; // Skip slash commands like /help or /plan with no args
      }
      return normalizeSummary(argsText);
    }
    return normalizeSummary(trimmed);
  }
  return '';
}

export const TrajectorySummaryDisplay: React.FC = () => {
  const { history, slashCommands } = useUIState();
  const summary = useMemo(
    () => deriveGoalSummary(history, slashCommands ?? []),
    [history, slashCommands],
  );

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
