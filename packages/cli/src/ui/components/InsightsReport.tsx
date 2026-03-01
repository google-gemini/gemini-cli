/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import type { InsightsToolUsageEntry } from '../types.js';

// Reusable stat row matching StatsDisplay pattern
const StatRow: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box>
    <Box width={28}>
      <Text color={theme.text.link}>{title}</Text>
    </Box>
    {children}
  </Box>
);

interface InsightsReportProps {
  sessionsAnalyzed: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  toolUsage: InsightsToolUsageEntry[];
  llmAnalysis: string | null;
  terminalWidth: number;
}

export const InsightsReport: React.FC<InsightsReportProps> = ({
  sessionsAnalyzed,
  totalMessages,
  userMessages,
  assistantMessages,
  totalToolCalls,
  successfulToolCalls,
  failedToolCalls,
  toolUsage,
  llmAnalysis,
  terminalWidth,
}) => {
  const successRate =
    totalToolCalls > 0
      ? ((successfulToolCalls / totalToolCalls) * 100).toFixed(1)
      : 'N/A';

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      overflow="hidden"
    >
      <Text bold color={theme.text.accent}>
        📊 Session Insights
      </Text>
      <Box height={1} />

      {/* At a Glance */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.text.primary}>
          At a Glance
        </Text>
        <StatRow title="Sessions Analyzed:">
          <Text color={theme.text.primary}>{sessionsAnalyzed}</Text>
        </StatRow>
        <StatRow title="Total Messages:">
          <Text color={theme.text.primary}>{totalMessages}</Text>
        </StatRow>
        <StatRow title="Your Messages:">
          <Text color={theme.text.primary}>{userMessages}</Text>
        </StatRow>
        <StatRow title="Gemini Responses:">
          <Text color={theme.text.primary}>{assistantMessages}</Text>
        </StatRow>
        <StatRow title="Tool Calls:">
          <Text color={theme.text.primary}>
            {totalToolCalls} ({' '}
            <Text color={theme.status.success}>✓ {successfulToolCalls}</Text>{' '}
            <Text color={theme.status.error}>✗ {failedToolCalls}</Text> )
          </Text>
        </StatRow>
        <StatRow title="Success Rate:">
          <Text
            color={
              totalToolCalls === 0
                ? theme.text.secondary
                : parseFloat(successRate) >= 80
                  ? theme.status.success
                  : parseFloat(successRate) >= 50
                    ? theme.status.warning
                    : theme.status.error
            }
          >
            {successRate}%
          </Text>
        </StatRow>
      </Box>

      {/* Tool Usage Breakdown */}
      {toolUsage.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            Tool Usage Breakdown
          </Text>
          {toolUsage.map((tool) => {
            const pct =
              tool.count > 0
                ? ((tool.successes / tool.count) * 100).toFixed(0)
                : '0';
            return (
              <StatRow key={tool.name} title={`${tool.name}:`}>
                <Text color={theme.text.primary}>
                  {tool.count} calls{' '}
                  <Text color={theme.text.secondary}>({pct}% success)</Text>
                </Text>
              </StatRow>
            );
          })}
        </Box>
      )}

      {/* AI Analysis */}
      {llmAnalysis && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text.primary}>
            AI Analysis
          </Text>
          <Box paddingLeft={1} marginTop={0}>
            <MarkdownDisplay
              text={llmAnalysis}
              isPending={false}
              terminalWidth={Math.max(terminalWidth - 6, 0)}
              renderMarkdown={true}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};
