/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useId } from 'react';
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
import { useOverflowActions } from '../../contexts/OverflowContext.js';

interface TopicMessageProps extends IndividualToolCallDisplay {
  terminalWidth: number;
  availableTerminalHeight?: number;
  isExpandable?: boolean;
}

export const isTopicTool = (name: string): boolean =>
  name === UPDATE_TOPIC_TOOL_NAME || name === UPDATE_TOPIC_DISPLAY_NAME;

export const TopicMessage: React.FC<TopicMessageProps> = ({
  args,
  availableTerminalHeight,
  isExpandable = true,
}) => {
  const isExpanded = availableTerminalHeight === undefined;
  const overflowActions = useOverflowActions();
  const uniqueId = useId();
  const overflowId = `topic-${uniqueId}`;

  const rawTitle = args?.[TOPIC_PARAM_TITLE];
  const title = typeof rawTitle === 'string' ? rawTitle : undefined;

  const rawStrategicIntent = args?.[TOPIC_PARAM_STRATEGIC_INTENT];
  const strategicIntent =
    typeof rawStrategicIntent === 'string' ? rawStrategicIntent : undefined;

  const rawSummary = args?.[TOPIC_PARAM_SUMMARY];
  const summary = typeof rawSummary === 'string' ? rawSummary : undefined;

  // Top line intent: prefer strategic_intent, fallback to summary
  const intent = strategicIntent || summary;

  // Extra summary: only if both exist and are different (or just summary if we want to show it below)
  // According to requirements: "show intent and we need to make it optionally expandable ... to show the summary"
  const hasExtraSummary = !!(
    strategicIntent &&
    summary &&
    strategicIntent !== summary
  );

  useEffect(() => {
    if (isExpandable && hasExtraSummary && overflowActions) {
      overflowActions.addOverflowingId(overflowId);
    }
    return () => {
      if (overflowActions) {
        overflowActions.removeOverflowingId(overflowId);
      }
    };
  }, [isExpandable, hasExtraSummary, overflowActions, overflowId]);

  const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={theme.text.primary} bold wrap="truncate-end">
          {title || 'Topic'}
          {intent && <Text>: </Text>}
        </Text>
        {intent && (
          <Text color={theme.text.secondary} wrap="wrap">
            {intent}
          </Text>
        )}
        {isExpandable && hasExtraSummary && (
          <Box marginLeft={1}>
            <Text color={theme.text.secondary}>{toggleText}</Text>
          </Box>
        )}
      </Box>
      {isExpanded && hasExtraSummary && summary && (
        <Box marginTop={1} marginLeft={0}>
          <Text color={theme.text.secondary} wrap="wrap">
            {summary}
          </Text>
        </Box>
      )}
    </Box>
  );
};
