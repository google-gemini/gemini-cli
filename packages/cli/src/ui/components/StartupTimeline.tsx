/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceData } from '@google/gemini-cli-core';

interface StartupTimelineProps {
  data: PerformanceData['startup'];
}

export const StartupTimeline: React.FC<StartupTimelineProps> = ({ data }) => {
  const getDurationColor = (duration: number) => {
    if (duration > 500) return 'red';
    if (duration > 200) return 'yellow';
    return 'green';
  };

  const getDurationEmoji = (duration: number) => {
    if (duration > 500) return '🐌';
    if (duration > 200) return '⚡';
    return '🚀';
  };

  const hasPhases = data.phases.length > 0;

  // Guard against empty array: Math.max(...[]) === -Infinity
  const maxDuration = hasPhases
    ? Math.max(...data.phases.map((p) => p.duration), data.total || 1)
    : data.total || 1;

  const barLength = 40;

  // Sort phases by duration descending for better visibility.
  const sortedPhases = [...data.phases].sort((a, b) => b.duration - a.duration);

  const fastestPhase = hasPhases
    ? data.phases.reduce((min, p) => (p.duration < min.duration ? p : min))
    : null;

  const slowestPhase = hasPhases
    ? data.phases.reduce((max, p) => (p.duration > max.duration ? p : max))
    : null;

  const minDuration = hasPhases
    ? Math.min(...data.phases.map((p) => p.duration))
    : 0;
  const maxPhaseDuration = hasPhases
    ? Math.max(...data.phases.map((p) => p.duration))
    : 0;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          🚀 Startup Performance
        </Text>
      </Box>

      {/* Total Time Card */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Box justifyContent="space-between">
          <Text bold>Total Startup Time:</Text>
          <Box>
            <Text color="cyan" bold>
              {data.total.toFixed(0)}ms
            </Text>
            <Text> </Text>
            <Text>
              {data.total < 1000
                ? '✅ Fast'
                : data.total < 2000
                  ? '⚡ Moderate'
                  : '🐌 Slow'}
            </Text>
          </Box>
        </Box>

        {/* Visual progress bar for total time */}
        <Box marginTop={1}>
          <Text>Progress: </Text>
          <Text color="cyan">
            {'█'.repeat(Math.min(20, Math.floor(data.total / 100)))}
            {'░'.repeat(Math.max(0, 20 - Math.floor(data.total / 100)))}
          </Text>
        </Box>
      </Box>

      {/* Phase Breakdown */}
      {hasPhases ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Phase Breakdown:</Text>

          {sortedPhases.map((phase, index) => {
            const barFilled = Math.max(
              1,
              Math.floor((phase.duration / maxDuration) * barLength),
            );
            const bar =
              '█'.repeat(barFilled) + '░'.repeat(barLength - barFilled);
            const percentage = ((phase.duration / data.total) * 100).toFixed(1);
            const color = getDurationColor(phase.duration);
            const emoji = getDurationEmoji(phase.duration);

            return (
              <Box key={index} flexDirection="column" marginTop={1}>
                <Box justifyContent="space-between">
                  <Box>
                    <Text>{emoji} </Text>
                    <Text bold>{phase.name}:</Text>
                  </Box>
                  <Box>
                    <Text color={color}>{phase.duration.toFixed(0)}ms</Text>
                    <Text> </Text>
                    <Text color="gray">({percentage}%)</Text>
                  </Box>
                </Box>

                <Box marginTop={0}>
                  <Text color={color}>{bar}</Text>
                </Box>

                {phase.duration > 500 && (
                  <Box marginTop={0}>
                    <Text color="red">⚠️ This phase is slow ({'>'}500ms)</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>No startup phases recorded yet.</Text>
        </Box>
      )}

      {/* Stats Summary — only shown when phases are available */}
      {hasPhases && (
        <Box
          borderStyle="single"
          padding={1}
          marginTop={1}
          flexDirection="column"
        >
          <Text bold>📊 Summary Statistics:</Text>
          <Box marginTop={1} flexWrap="wrap">
            {fastestPhase && (
              <Box width="50%">
                <Text>Fastest phase: </Text>
                <Text color="green">
                  {fastestPhase.name} ({minDuration.toFixed(0)}ms)
                </Text>
              </Box>
            )}
            {slowestPhase && (
              <Box width="50%">
                <Text>Slowest phase: </Text>
                <Text color="red">
                  {slowestPhase.name} ({maxPhaseDuration.toFixed(0)}ms)
                </Text>
              </Box>
            )}
          </Box>
          <Box marginTop={1}>
            <Text>Average phase time: </Text>
            <Text color="cyan">
              {(data.total / data.phases.length).toFixed(0)}ms
            </Text>
          </Box>
        </Box>
      )}

      {/* Optimization Suggestions */}
      {data.suggestions && data.suggestions.length > 0 && (
        <Box
          borderStyle="round"
          borderColor="yellow"
          padding={1}
          marginTop={1}
          flexDirection="column"
        >
          <Box>
            <Text bold color="yellow">
              💡 Optimization Suggestions:
            </Text>
          </Box>
          {data.suggestions.map((suggestion, index) => (
            <Box key={index} marginTop={1}>
              <Text>• </Text>
              <Text>{suggestion}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Quick Tips */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Quick Tips:</Text>
        <Text dimColor> • 🚀 &lt;200ms | ⚡ 200-500ms | 🐌 &gt;500ms</Text>
        <Text dimColor> • Use --json flag to export data for analysis</Text>
        <Text dimColor> • Compare with baseline: gemini stats --ci</Text>
      </Box>
    </Box>
  );
};
