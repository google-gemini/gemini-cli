/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  modelsToShow?: string[];
  title?: string;
}

interface ModelUsageRowProps {
  row: {
    modelId: string;
    name: string;
    usedFraction: number;
    usedPercentage: number;
    resetTime?: string;
  };
  availableWidth?: number;
}

const ModelUsageRow = ({ row, availableWidth }: ModelUsageRowProps) => {
  const { terminalWidth } = useUIState();

  const nameColumnWidth = 12;
  const percentageWidth = 4;
  const resetColumnWidth = 26;
  const usedPercentage = row.usedPercentage;

  const nameLabel = row.name;
  const percentageLabel = `${usedPercentage.toFixed(0)}%`.padEnd(
    percentageWidth,
  );
  const resetLabel = row.resetTime
    ? formatResetTime(row.resetTime, 'column')
        .slice(0, resetColumnWidth)
        .padEnd(resetColumnWidth)
    : ''.padEnd(resetColumnWidth);

  // Calculate the exact width of all fixed adjacent siblings
  const nameColWidth = nameColumnWidth;
  const percentColWidth = percentageWidth + 1; // width + marginLeft
  const resetColWidth = resetColumnWidth + 1; // width + marginLeft

  const fixedSiblingWidth = nameColWidth + percentColWidth + resetColWidth;

  const calcWidth = availableWidth ?? terminalWidth;
  const defaultPadding = availableWidth != null ? 0 : 4;

  // Subtract fixed sibling widths from total width.
  // We keep a small buffer (e.g., 3) to prevent edge-case wrapping.
  const buffer = 3;
  const barWidth = Math.max(
    0,
    calcWidth - defaultPadding - fixedSiblingWidth - buffer,
  );

  let percentageColor = theme.text.primary;
  if (usedPercentage >= 100) {
    percentageColor = theme.status.error;
  } else if (usedPercentage >= 80) {
    percentageColor = theme.status.warning;
  }

  return (
    <Box flexDirection="row" width="100%">
      <Box width={nameColumnWidth}>
        <Text color={theme.text.primary} wrap="truncate-end">
          {nameLabel}
        </Text>
      </Box>

      <Box flexGrow={1}>
        <ProgressBar value={usedPercentage} width={barWidth} />
      </Box>

      <Box width={4} marginLeft={1}>
        <Text color={percentageColor}>{percentageLabel}</Text>
      </Box>

      <Box width={resetColumnWidth} marginLeft={1}>
        <Text color={theme.text.secondary}>
          {resetLabel.trim() ? `Resets: ${resetLabel}` : ''}
        </Text>
      </Box>
    </Box>
  );
};

export const ModelQuotaDisplay = ({
  buckets,
  availableWidth,
  modelsToShow = ['all'],
  title = 'Model usage',
}: ModelQuotaDisplayProps) => {
  const config = useConfig();

  const modelsWithQuotas = useMemo(() => {
    if (!buckets) return [];

    let filteredBuckets = buckets.filter(
      (b) => b.modelId && b.remainingFraction != null,
    );

    if (modelsToShow.includes('current')) {
      const currentModel = config.getActiveModel?.() ?? config.getModel?.();
      filteredBuckets = filteredBuckets.filter(
        (b) => b.modelId === currentModel,
      );
    } else if (!modelsToShow.includes('all')) {
      filteredBuckets = filteredBuckets.filter(
        (b) => b.modelId && modelsToShow.includes(b.modelId),
      );
    }

    const groupedByTier = new Map<
      string,
      {
        modelId: string;
        remainingFraction: number;
        resetTime?: string;
        name: string;
      }
    >();

    filteredBuckets.forEach((b) => {
      const modelId = b.modelId;
      const remainingFraction = b.remainingFraction;
      if (!modelId || remainingFraction == null) return;

      const tier =
        config?.modelConfigService?.getModelDefinition(modelId)?.tier;
      const groupKey = tier ?? modelId;
      const existing = groupedByTier.get(groupKey);

      if (!existing || remainingFraction < existing.remainingFraction) {
        const tierDisplayNames: Record<string, string> = {
          pro: 'Pro',
          flash: 'Flash',
          'flash-lite': 'Flash Lite',
        };
        const name = tier
          ? (tierDisplayNames[tier] ?? tier)
          : getDisplayString(modelId, config);

        groupedByTier.set(groupKey, {
          modelId,
          remainingFraction,
          resetTime: b.resetTime,
          name,
        });
      }
    });

    return Array.from(groupedByTier.entries()).map(([key, data]) => {
      const usedFraction = 1 - data.remainingFraction;
      const usedPercentage = usedFraction * 100;
      return {
        modelId: key,
        name: data.name,
        usedFraction,
        usedPercentage,
        resetTime: data.resetTime,
      };
    });
  }, [buckets, config, modelsToShow]);

  if (modelsWithQuotas.length === 0) {
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

      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={theme.text.primary}>
            {title}
          </Text>
        </Box>

        {modelsWithQuotas.map((row) => (
          <ModelUsageRow
            key={row.modelId}
            row={row}
            availableWidth={availableWidth}
          />
        ))}
      </Box>
    </Box>
  );
};
