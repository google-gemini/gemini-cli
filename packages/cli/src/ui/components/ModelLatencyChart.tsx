/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceData } from '@google/gemini-cli-core';

interface ModelLatencyChartProps {
  data: PerformanceData['model'];
}

export const ModelLatencyChart: React.FC<ModelLatencyChartProps> = ({
  data,
}) => {
  const models = Object.entries(data.stats);

  const getLatencyColor = (latency: number) => {
    if (latency > 2000) return 'red';
    if (latency > 1000) return 'yellow';
    return 'green';
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          Model API Latency
        </Text>
      </Box>

      <Box flexDirection="column">
        {models.map(([model, stats]) => (
          <Box key={model} flexDirection="column" marginBottom={1}>
            <Box>
              <Text bold>{model}</Text>
            </Box>
            <Box>
              <Box width={12}>
                <Text>P50: </Text>
                <Text color={getLatencyColor(stats.p50)}>{stats.p50}ms</Text>
              </Box>
              <Box width={12}>
                <Text>P95: </Text>
                <Text color={getLatencyColor(stats.p95)}>{stats.p95}ms</Text>
              </Box>
              <Box width={12}>
                <Text>P99: </Text>
                <Text color={getLatencyColor(stats.p99)}>{stats.p99}ms</Text>
              </Box>
            </Box>
            <Box>
              <Box width={12}>
                <Text>Avg: </Text>
                <Text>{stats.avg.toFixed(0)}ms</Text>
              </Box>
              <Box width={12}>
                <Text>Calls: </Text>
                <Text color="cyan">{stats.count}</Text>
              </Box>
              <Box width={12}>
                <Text>Cache: </Text>
                <Text color="green">{stats.cacheRate.toFixed(0)}%</Text>
              </Box>
            </Box>
            <Box>
              <Box flexDirection="row">
                <Box marginRight={4}>
                  <Text>
                    Tokens: <Text color="cyan">{stats.totalTokens}</Text>
                  </Text>
                </Box>

                <Box>
                  <Text>
                    Success:{' '}
                    <Text color={stats.successRate > 95 ? 'green' : 'yellow'}>
                      {stats.successRate.toFixed(1)}%
                    </Text>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      {data.recentCalls.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent Calls:</Text>
          {data.recentCalls.map((call, index) => (
            <Box key={index}>
              <Text color={call.success ? 'green' : 'red'}> • </Text>
              <Text>
                {call.model} ({call.operation})
              </Text>
              <Text> </Text>
              <Text color={getLatencyColor(call.duration)}>
                {call.duration}ms
              </Text>
              <Text> </Text>
              <Text color="cyan">{call.tokens.total} tokens</Text>
              {call.cached && <Text color="green"> [cached]</Text>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
