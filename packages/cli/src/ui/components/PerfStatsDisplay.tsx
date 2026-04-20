/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import { buildBar, formatBytes } from '../utils/barChart.js';
import {
  getStatusColor,
  CACHE_EFFICIENCY_HIGH,
  CACHE_EFFICIENCY_MEDIUM,
} from '../utils/displayUtils.js';
import { computePerfStats } from '../utils/computeStats.js';
import { useSessionStats } from '../contexts/SessionContext.js';

const BAR_WIDTH = 20;

const LATENCY_THRESHOLDS = { green: 0, yellow: 500, red: 2000 };

const getLatencyColor = (ms: number): string => {
  if (ms < LATENCY_THRESHOLDS.yellow) return theme.status.success;
  if (ms < LATENCY_THRESHOLDS.red) return theme.status.warning;
  return theme.status.error;
};

interface StatRowProps {
  title: string;
  children: React.ReactNode;
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    <Box width={24}>
      <Text color={theme.text.link}>{title}</Text>
    </Box>
    {children}
  </Box>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

const BarDisplay: React.FC<{
  label: string;
  fraction: number;
  percent: number;
  color: string;
}> = ({ label, fraction, percent, color }) => {
  const { filled, empty } = buildBar(fraction, BAR_WIDTH);
  return (
    <Box>
      <Box width={14}>
        <Text color={theme.text.secondary}>{label}</Text>
      </Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color={theme.border.default}>{'░'.repeat(empty)}</Text>
      <Text color={theme.text.secondary}> {percent.toFixed(1)}%</Text>
    </Box>
  );
};

export const PerfStatsDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const now = Date.now();
  const wallTimeMs = stats.sessionStartTime
    ? now - stats.sessionStartTime.getTime()
    : 0;

  const perf = computePerfStats(metrics, wallTimeMs);

  const idlePercent = wallTimeMs > 0 ? (perf.idleTimeMs / wallTimeMs) * 100 : 0;

  const cacheColor = getStatusColor(perf.cacheEfficiency, {
    green: CACHE_EFFICIENCY_HIGH,
    yellow: CACHE_EFFICIENCY_MEDIUM,
  });

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
        Performance Dashboard
      </Text>
      <Box height={1} />

      {/* Section 1: Timing Breakdown */}
      <Section title="Timing Breakdown">
        <StatRow title="Wall Time:">
          <Text color={theme.text.primary}>{formatDuration(wallTimeMs)}</Text>
        </StatRow>
        <StatRow title="Agent Active:">
          <Text color={theme.text.primary}>
            {formatDuration(perf.agentActiveTime)}
          </Text>
        </StatRow>
        <StatRow title="Idle/Waiting:">
          <Text color={theme.text.primary}>
            {formatDuration(perf.idleTimeMs)}
          </Text>
        </StatRow>
        <Box marginTop={1} flexDirection="column">
          <BarDisplay
            label="API Time"
            fraction={wallTimeMs > 0 ? perf.totalApiTime / wallTimeMs : 0}
            percent={perf.apiTimePercent}
            color={theme.text.accent}
          />
          <BarDisplay
            label="Tool Time"
            fraction={wallTimeMs > 0 ? perf.totalToolTime / wallTimeMs : 0}
            percent={perf.toolTimePercent}
            color={theme.status.warning}
          />
          <BarDisplay
            label="Idle"
            fraction={wallTimeMs > 0 ? perf.idleTimeMs / wallTimeMs : 0}
            percent={idlePercent}
            color={theme.text.secondary}
          />
        </Box>
      </Section>

      {/* Section 2: API Performance */}
      {perf.perModelStats.length > 0 && (
        <Section title="API Performance (per model)">
          <Box>
            <Box width={24}>
              <Text bold color={theme.text.primary}>
                Model
              </Text>
            </Box>
            <Box width={8} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Reqs
              </Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Avg Latency
              </Text>
            </Box>
            <Box width={12} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Err Rate
              </Text>
            </Box>
          </Box>
          {perf.perModelStats.map((model) => (
            <Box key={model.name}>
              <Box width={24}>
                <Text color={theme.text.primary} wrap="truncate-end">
                  {model.name}
                </Text>
              </Box>
              <Box width={8} justifyContent="flex-end">
                <Text color={theme.text.primary}>{model.requests}</Text>
              </Box>
              <Box width={14} justifyContent="flex-end">
                <Text color={getLatencyColor(model.avgLatencyMs)}>
                  {formatDuration(model.avgLatencyMs)}
                </Text>
              </Box>
              <Box width={12} justifyContent="flex-end">
                <Text
                  color={
                    model.errorRate > 0
                      ? theme.status.error
                      : theme.text.secondary
                  }
                >
                  {model.errorRate.toFixed(1)}%
                </Text>
              </Box>
            </Box>
          ))}
        </Section>
      )}

      {/* Section 3: Tool Performance (top 5) */}
      {perf.topToolsByDuration.length > 0 && (
        <Section title="Tool Performance (top 5 by duration)">
          <Box>
            <Box width={24}>
              <Text bold color={theme.text.primary}>
                Tool
              </Text>
            </Box>
            <Box width={8} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Calls
              </Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Total Time
              </Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Avg Time
              </Text>
            </Box>
          </Box>
          {perf.topToolsByDuration.map((tool) => (
            <Box key={tool.name}>
              <Box width={24}>
                <Text color={theme.text.link} wrap="truncate-end">
                  {tool.name}
                </Text>
              </Box>
              <Box width={8} justifyContent="flex-end">
                <Text color={theme.text.primary}>{tool.stats.count}</Text>
              </Box>
              <Box width={14} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {formatDuration(tool.stats.durationMs)}
                </Text>
              </Box>
              <Box width={14} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {formatDuration(tool.avgDurationMs)}
                </Text>
              </Box>
            </Box>
          ))}
        </Section>
      )}

      {/* Section 4: Memory & Runtime */}
      <Section title="Memory & Runtime">
        <StatRow title="RSS:">
          <Text color={theme.text.primary}>{formatBytes(perf.memory.rss)}</Text>
        </StatRow>
        <StatRow title="Heap Used:">
          <Text color={theme.text.primary}>
            {formatBytes(perf.memory.heapUsed)} /{' '}
            {formatBytes(perf.memory.heapTotal)}
          </Text>
        </StatRow>
        <StatRow title="Platform:">
          <Text color={theme.text.primary}>
            {process.platform} ({process.arch})
          </Text>
        </StatRow>
        <StatRow title="Node.js:">
          <Text color={theme.text.primary}>{process.version}</Text>
        </StatRow>
      </Section>

      {/* Section 5: Token Efficiency */}
      <Section title="Token Efficiency">
        <StatRow title="Total Requests:">
          <Text color={theme.text.primary}>{perf.totalRequests}</Text>
        </StatRow>
        <StatRow title="Input Tokens:">
          <Text color={theme.text.primary}>
            {perf.totalInputTokens.toLocaleString()}
          </Text>
        </StatRow>
        <StatRow title="Output Tokens:">
          <Text color={theme.text.primary}>
            {perf.totalOutputTokens.toLocaleString()}
          </Text>
        </StatRow>
        <StatRow title="Cached Tokens:">
          <Text color={theme.text.primary}>
            {perf.totalCachedTokens.toLocaleString()}
          </Text>
        </StatRow>
        <StatRow title="Cache Hit Rate:">
          <Text color={cacheColor}>{perf.cacheEfficiency.toFixed(1)}%</Text>
        </StatRow>
        <StatRow title="Tokens/Request:">
          <Text color={theme.text.primary}>
            {perf.tokensPerRequest.toFixed(0)}
          </Text>
        </StatRow>
      </Section>
    </Box>
  );
};
