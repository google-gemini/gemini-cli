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

interface TopicDisplayProps {
  title?: string;
  summary?: string;
  marginLeft?: number;
}

export const TopicDisplay: React.FC<TopicDisplayProps> = ({
  title,
  summary,
  marginLeft = 2,
}) => {
  return (
    <Box flexDirection="row" marginLeft={marginLeft} flexWrap="wrap">
      <Text color={theme.text.primary} bold wrap="wrap">
        {title || 'Topic'}
        {summary && <Text>: </Text>}
      </Text>
      {summary && (
        <Text color={theme.text.secondary} wrap="wrap">
          {summary}
        </Text>
      )}
    </Box>
  );
};

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

  return <TopicDisplay title={title} summary={summary} />;
};
