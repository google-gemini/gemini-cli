/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable react/prop-types */
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';
import { theme } from '../semantic-colors.js';
import { formatResetTime } from '../utils/formatters.js';
import { getDisplayString } from '@google/gemini-cli-core';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface LocalBucket {
  modelId?: string;
  remainingFraction?: number;
  resetTime?: string;
}

interface ModelQuotaDisplayProps {
  buckets?: LocalBucket[];
  availableWidth?: number;
}

export const ModelQuotaDisplay: React.FC<ModelQuotaDisplayProps> = ({
  buckets,
  availableWidth,
}) => {
  const { terminalWidth } = useUIState();
  const config = useConfig();

  const usageRows = useMemo(() => {
    if (!buckets) return [];

    return buckets
      .filter((b) => b.modelId && b.remainingFraction != null)
      .map((b) => {
        const usedFraction = 1 - b.remainingFraction!;
        const usedPercentage = usedFraction * 100;
        return {
          modelId: b.modelId!,
          name: getDisplayString(b.modelId!, config),
          usedFraction,
          usedPercentage,
          resetTime: b.resetTime,
        };
      });
  }, [buckets, config]);

  if (usageRows.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Rule Line */}
      <Box
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
      />

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.text.primary}>
          Model usage
        </Text>

        {usageRows.map((row) => {
          const nameLabelLength = 25;
          const resetLabelLength = 33;
          const nameLabel = row.name
            .slice(0, nameLabelLength)
            .padEnd(nameLabelLength);
          const percentageLabel = `${row.usedPercentage.toFixed(0)}%`.padStart(
            4,
          );
          const resetLabel = row.resetTime
            ? formatResetTime(row.resetTime, 'column')
                .slice(0, resetLabelLength)
                .padEnd(resetLabelLength)
            : ''.padEnd(resetLabelLength);

          const calcWidth = availableWidth ?? terminalWidth;
          const defaultPadding = availableWidth != null ? 0 : 4;
          const barWidth = Math.min(
            10,
            calcWidth -
              defaultPadding -
              (nameLabelLength + resetLabelLength + 9),
          );

          return (
            <Box key={row.modelId} flexDirection="row" width="100%">
              <Box width={nameLabelLength}>
                <Text color={theme.text.primary}>{nameLabel}</Text>
              </Box>

              <Box flexGrow={1}>
                <ProgressBar value={row.usedPercentage} width={barWidth} />
              </Box>

              <Box width={4} marginLeft={1}>
                <Text color={theme.text.primary}>{percentageLabel}</Text>
              </Box>

              <Box width={resetLabelLength} marginLeft={1}>
                <Text color={theme.text.secondary}>{resetLabel}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Rule Line */}
      <Box
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        marginTop={1}
      />
    </Box>
  );
};
