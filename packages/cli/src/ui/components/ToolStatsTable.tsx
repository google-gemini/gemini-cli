/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceData } from '@google/gemini-cli-core';

interface ToolStatsTableProps {
  data: PerformanceData['tools'];
}

export const ToolStatsTable: React.FC<ToolStatsTableProps> = ({ data }) => {
  const tools = Object.entries(data.stats)
    .sort((a, b) => b[1].callCount - a[1].callCount)
    .slice(0, 15);

  const getSuccessColor = (rate: number) => {
    if (rate < 90) return 'red';
    if (rate < 95) return 'yellow';
    return 'green';
  };

  const getLatencyColor = (time: number) => {
    if (time > 2000) return 'red';
    if (time > 1000) return 'yellow';
    return 'green';
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          Tool Execution Statistics
        </Text>
      </Box>

      <Box flexDirection="column">
        {data.frequent.length > 0 && (
          <Box marginBottom={1}>
            <Text bold>Most Used Tools:</Text>
            <Box>
              {data.frequent.map((t, i) => (
                <Box key={t.tool} marginRight={2}>
                  <Text>{t.tool}</Text>
                  <Text color="cyan"> ({t.count})</Text>
                  {i < data.frequent.length - 1 && <Text>,</Text>}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {data.slow.length > 0 && (
          <Box marginBottom={1}>
            <Text bold color="yellow">
              ⚠️ Slow Tools (&gt;1s avg):
            </Text>
            <Box>
              {data.slow.map((t, i) => (
                <Box key={t.tool} marginRight={2}>
                  <Text color="red">{t.tool}</Text>
                  <Text> ({t.avgTime.toFixed(0)}ms)</Text>
                  {i < data.slow.length - 1 && <Text>,</Text>}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Box width={20}>
              <Text bold>Tool</Text>
            </Box>
            <Box width={8}>
              <Text bold>Calls</Text>
            </Box>
            <Box width={10}>
              <Text bold>Avg(ms)</Text>
            </Box>
            <Box width={10}>
              <Text bold>Min(ms)</Text>
            </Box>
            <Box width={10}>
              <Text bold>Max(ms)</Text>
            </Box>
            <Box width={10}>
              <Text bold>Success%</Text>
            </Box>
          </Box>

          {tools.map(([tool, stats]) => (
            <Box key={tool}>
              <Box width={20}>
                <Text>
                  {tool.length > 18 ? tool.substring(0, 15) + '...' : tool}
                </Text>
              </Box>
              <Box width={8}>
                <Text color="cyan">{stats.callCount}</Text>
              </Box>
              <Box width={10}>
                <Text color={getLatencyColor(stats.avgTime)}>
                  {stats.avgTime.toFixed(0)}
                </Text>
              </Box>
              <Box width={10}>
                <Text color="green">{stats.minTime.toFixed(0)}</Text>
              </Box>
              <Box width={10}>
                <Text color="red">{stats.maxTime.toFixed(0)}</Text>
              </Box>
              <Box width={10}>
                <Text color={getSuccessColor(stats.successRate)}>
                  {stats.successRate.toFixed(1)}%
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
