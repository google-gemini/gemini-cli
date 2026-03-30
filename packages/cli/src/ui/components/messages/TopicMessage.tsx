/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  UPDATE_TOPIC_TOOL_NAME,
  UPDATE_TOPIC_DISPLAY_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
} from '@google/gemini-cli-core';
import type { IndividualToolCallDisplay } from '../../types.js';
import { theme } from '../../semantic-colors.js';

interface TopicMessageProps extends IndividualToolCallDisplay {
  terminalWidth: number;
}

export const isTopicTool = (name: string): boolean =>
  name === UPDATE_TOPIC_TOOL_NAME || name === UPDATE_TOPIC_DISPLAY_NAME;

export const TopicMessage: React.FC<TopicMessageProps> = ({ args }) => {
  const rawTitle = args?.[TOPIC_PARAM_TITLE];
  const title = typeof rawTitle === 'string' ? rawTitle : undefined;
  const rawSummary = args?.[TOPIC_PARAM_SUMMARY];
  const summary = typeof rawSummary === 'string' ? rawSummary : undefined;

  // Use summary as a fallback subtitle if title is present,
  // or use it as the main text if title is missing.
  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text color={theme.text.primary} bold>
        {title || 'Topic'}
      </Text>
      {summary && (
        <Text color={theme.text.secondary} wrap="truncate-end">
          {' — '}
          {summary.length > 80 ? `${summary.substring(0, 80)}...` : summary}
        </Text>
      )}
    </Box>
  );
};
