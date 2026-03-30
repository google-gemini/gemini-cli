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
  TOPIC_PARAM_STRATEGIC_INTENT,
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
  const rawIntent =
    args?.[TOPIC_PARAM_STRATEGIC_INTENT] || args?.[TOPIC_PARAM_SUMMARY];
  const intent = typeof rawIntent === 'string' ? rawIntent : undefined;

  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text color={theme.text.primary} bold>
        {title || 'Topic'}
      </Text>
      {intent && <Text color={theme.text.secondary}> — {intent}</Text>}
    </Box>
  );
};
