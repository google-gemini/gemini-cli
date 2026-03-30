/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import process from 'node:process';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { ThemedGradient } from './ThemedGradient.js';
import { formatBytes, formatDuration } from '../utils/formatters.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  SessionTraceStepKey,
  useSessionTrace,
} from '../contexts/SessionTraceContext.js';

const LABEL_WIDTH = 20;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

const StatRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box>
    <Box width={LABEL_WIDTH}>
      <Text color={theme.text.link}>{label}</Text>
    </Box>
    {children}
  </Box>
);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export const TraceDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { trace } = useSessionTrace();
  const computed = computeSessionStats(stats.metrics);
  const wallDurationMs = Math.max(
    0,
    Date.now() - stats.sessionStartTime.getTime(),
  );
  const rssBytes = process.memoryUsage().rss;
  const agentTurnStep = trace.steps[SessionTraceStepKey.AgentTurn];
  const slashCommandStep = trace.steps[SessionTraceStepKey.SlashCommand];
  const slashCommandTime = slashCommandStep?.totalDurationMs ?? 0;
  const apiRequests = Object.values(stats.metrics.models).reduce(
    (sum, model) => sum + model.api.totalRequests,
    0,
  );
  const trackedTime =
    computed.totalApiTime + computed.totalToolTime + slashCommandTime;
  const idleTime = Math.max(0, wallDurationMs - trackedTime);
  const hasTraceData =
    apiRequests > 0 ||
    stats.metrics.tools.totalCalls > 0 ||
    (agentTurnStep?.count ?? 0) > 0 ||
    (slashCommandStep?.count ?? 0) > 0;

  const measuredBreakdown = [
    {
      label: 'Model API',
      durationMs: computed.totalApiTime,
      detail:
        apiRequests > 0
          ? `${apiRequests} request${apiRequests === 1 ? '' : 's'}`
          : undefined,
    },
    {
      label: 'Tool execution',
      durationMs: computed.totalToolTime,
      detail:
        stats.metrics.tools.totalCalls > 0
          ? `${stats.metrics.tools.totalCalls} call${
              stats.metrics.tools.totalCalls === 1 ? '' : 's'
            }`
          : undefined,
    },
    {
      label: 'Slash commands',
      durationMs: slashCommandTime,
      detail:
        slashCommandStep && slashCommandStep.count > 0
          ? `${slashCommandStep.count} command${
              slashCommandStep.count === 1 ? '' : 's'
            }`
          : undefined,
    },
  ];

  const bottleneck = measuredBreakdown.reduce<
    (typeof measuredBreakdown)[number] | null
  >((slowest, current) => {
    if (current.durationMs <= 0) {
      return slowest;
    }
    if (!slowest || current.durationMs > slowest.durationMs) {
      return current;
    }
    return slowest;
  }, null);

  const slowestTool = Object.entries(stats.metrics.tools.byName).reduce<{
    name: string;
    durationMs: number;
    count: number;
  } | null>((slowest, [name, toolStats]) => {
    if (!slowest || toolStats.durationMs > slowest.durationMs) {
      return {
        name,
        durationMs: toolStats.durationMs,
        count: toolStats.count,
      };
    }
    return slowest;
  }, null);

  const slowestModel = Object.entries(stats.metrics.models).reduce<{
    name: string;
    durationMs: number;
    requests: number;
  } | null>((slowest, [name, modelStats]) => {
    if (!slowest || modelStats.api.totalLatencyMs > slowest.durationMs) {
      return {
        name,
        durationMs: modelStats.api.totalLatencyMs,
        requests: modelStats.api.totalRequests,
      };
    }
    return slowest;
  }, null);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      overflow="hidden"
      width={78}
    >
      <ThemedGradient bold>Execution Summary</ThemedGradient>
      <Box height={1} />

      <Section title="Overview">
        <StatRow label="Session Duration:">
          <Text color={theme.text.primary}>
            {formatDuration(wallDurationMs)}
          </Text>
        </StatRow>
        <StatRow label="Prompts Sent:">
          <Text color={theme.text.primary}>{stats.promptCount}</Text>
        </StatRow>
        <StatRow label="Agent Turns:">
          <Text color={theme.text.primary}>{agentTurnStep?.count ?? 0}</Text>
        </StatRow>
        <StatRow label="Tool Calls:">
          <Text color={theme.text.primary}>
            {stats.metrics.tools.totalCalls} ({' '}
            <Text color={theme.status.success}>
              {stats.metrics.tools.totalSuccess} ok
            </Text>{' '}
            <Text color={theme.status.error}>
              {stats.metrics.tools.totalFail} fail
            </Text>{' '}
            )
          </Text>
        </StatRow>
        <StatRow label="API Requests:">
          <Text color={theme.text.primary}>{apiRequests}</Text>
        </StatRow>
        <StatRow label="Memory RSS:">
          <Text color={theme.text.primary}>{formatBytes(rssBytes)}</Text>
        </StatRow>
      </Section>

      {hasTraceData ? (
        <>
          <Section title="Time Breakdown">
            {measuredBreakdown.map((entry) => (
              <StatRow key={entry.label} label={`${entry.label}:`}>
                <Text color={theme.text.primary}>
                  {formatDuration(entry.durationMs)}{' '}
                  <Text color={theme.text.secondary}>
                    (
                    {formatPercent(
                      wallDurationMs > 0
                        ? (entry.durationMs / wallDurationMs) * 100
                        : 0,
                    )}
                    {entry.detail ? ` • ${entry.detail}` : ''})
                  </Text>
                </Text>
              </StatRow>
            ))}
            <StatRow label="Other / Idle:">
              <Text color={theme.text.primary}>
                {formatDuration(idleTime)}{' '}
                <Text color={theme.text.secondary}>
                  (
                  {formatPercent(
                    wallDurationMs > 0 ? (idleTime / wallDurationMs) * 100 : 0,
                  )}
                  )
                </Text>
              </Text>
            </StatRow>
          </Section>

          <Section title="Highlights">
            <StatRow label="Bottleneck:">
              <Text color={theme.text.primary}>
                {bottleneck
                  ? `${bottleneck.label} (${formatDuration(
                      bottleneck.durationMs,
                    )}, ${formatPercent(
                      trackedTime > 0
                        ? (bottleneck.durationMs / trackedTime) * 100
                        : 0,
                    )} of measured time)`
                  : 'No measured bottleneck yet'}
              </Text>
            </StatRow>
            <StatRow label="Avg Turn:">
              <Text color={theme.text.primary}>
                {agentTurnStep && agentTurnStep.count > 0
                  ? formatDuration(
                      agentTurnStep.totalDurationMs / agentTurnStep.count,
                    )
                  : '--'}
              </Text>
            </StatRow>
            <StatRow label="Slowest Turn:">
              <Text color={theme.text.primary}>
                {agentTurnStep
                  ? formatDuration(agentTurnStep.maxDurationMs)
                  : '--'}
              </Text>
            </StatRow>
            <StatRow label="Slowest Tool:">
              <Text color={theme.text.primary} wrap="truncate-end">
                {slowestTool
                  ? `${slowestTool.name} (${formatDuration(
                      slowestTool.durationMs,
                    )} across ${slowestTool.count} call${
                      slowestTool.count === 1 ? '' : 's'
                    })`
                  : 'No tool execution recorded'}
              </Text>
            </StatRow>
            <StatRow label="Slowest Model:">
              <Text color={theme.text.primary} wrap="truncate-end">
                {slowestModel
                  ? `${slowestModel.name} (${formatDuration(
                      slowestModel.durationMs,
                    )} across ${slowestModel.requests} request${
                      slowestModel.requests === 1 ? '' : 's'
                    })`
                  : 'No model activity recorded'}
              </Text>
            </StatRow>
          </Section>
        </>
      ) : (
        <Text color={theme.text.secondary}>
          No traced execution yet. Run a prompt, use a slash command, or invoke
          a tool and then try `/trace` again.
        </Text>
      )}
    </Box>
  );
};
