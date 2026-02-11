/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { Table, type Column } from '../Table.js';
import { DiffRenderer } from './DiffRenderer.js';
import * as Diff from 'diff';
import type { RichVisualization } from '@google/gemini-cli-core';
import { getPlainTextLength } from '../../utils/InlineMarkdownRenderer.js';

interface RichDataDisplayProps {
  data: RichVisualization;
  availableWidth: number;
}

export const RichDataDisplay: React.FC<RichDataDisplayProps> = ({
  data,
  availableWidth,
}) => {
  const {
    type,
    title,
    data: rawData,
    columns: providedColumns,
    savedFilePath,
  } = data;

  const normalizeData = (
    data: unknown[],
    providedCols: typeof providedColumns,
  ) =>
    data.map((item) => {
      const record = item as Record<string, unknown>;
      let label = 'Unknown';
      let value = 0;

      if (providedCols && providedCols.length >= 2) {
        label = String(record[providedCols[0].key]);
        value = Number(record[providedCols[1].key]);
      } else {
        // Auto-detect
        const keys = Object.keys(record);
        const labelKey =
          keys.find((k) => typeof record[k] === 'string') || keys[0];
        const valueKey = keys.find((k) => typeof record[k] === 'number');
        if (labelKey) label = String(record[labelKey]);
        if (valueKey) value = Number(record[valueKey]);
      }
      return { label, value };
    });

  const renderContent = () => {
    if (type === 'table' && Array.isArray(rawData)) {
      const tableData = rawData as Array<Record<string, unknown>>;

      // Infer columns if not provided
      let columns: Array<Column<Record<string, unknown>>> = [];
      if (providedColumns) {
        columns = providedColumns.map((col) => ({
          key: col.key,
          header: col.label,
        }));
      } else if (tableData.length > 0) {
        columns = Object.keys(tableData[0]).map((key) => ({
          key,
          header: key,
        }));
      }

      // Calculate widths based on content
      const paddingPerCol = 2; // Extra buffer
      const columnContentWidths = columns.map((col) => {
        const headerWidth = getPlainTextLength(String(col.header));
        const maxDataWidth = Math.max(
          ...tableData.map((row) =>
            getPlainTextLength(String(row[col.key] || '')),
          ),
          0,
        );
        return Math.max(headerWidth, maxDataWidth) + paddingPerCol;
      });

      const totalContentWidth = columnContentWidths.reduce((a, b) => a + b, 0);

      if (totalContentWidth > availableWidth && columns.length > 0) {
        // Scale down if exceeds available width
        const scaleFactor = availableWidth / totalContentWidth;
        columns = columns.map((col, i) => ({
          ...col,
          width: Math.max(4, Math.floor(columnContentWidths[i] * scaleFactor)),
        }));
      } else {
        // Use content widths or distribute remaining space
        columns = columns.map((col, i) => ({
          ...col,
          width: columnContentWidths[i],
        }));
      }

      return <Table data={tableData} columns={columns} />;
    } else if (type === 'bar_chart' && Array.isArray(rawData)) {
      const normalized = normalizeData(rawData as unknown[], providedColumns);

      const maxValue = Math.max(...normalized.map((d) => d.value), 1);
      const maxLabelLen = Math.max(...normalized.map((d) => d.label.length), 1);
      const barAreaWidth = Math.max(10, availableWidth - maxLabelLen - 10);

      return (
        <Box flexDirection="column">
          {normalized.map((item, i) => {
            const barLen = Math.max(
              0,
              Math.floor((item.value / maxValue) * barAreaWidth),
            );
            const bar = '█'.repeat(barLen);
            return (
              <Box key={i}>
                <Text>{item.label.padEnd(maxLabelLen + 1)}</Text>
                <Text color={theme.text.accent}>{bar}</Text>
                <Text> {item.value}</Text>
              </Box>
            );
          })}
        </Box>
      );
    } else if (type === 'line_chart' && Array.isArray(rawData)) {
      const normalized = normalizeData(rawData as unknown[], providedColumns);
      if (normalized.length === 0) return <Text>No data to display.</Text>;

      const maxValue = Math.max(...normalized.map((d) => d.value), 0);
      const minValue = Math.min(...normalized.map((d) => d.value), 0);
      const range = Math.max(maxValue - minValue, 1);
      const chartHeight = 10;

      // Plotting
      const rows: string[][] = Array.from({ length: chartHeight }, () =>
        Array.from({ length: normalized.length }, () => ' '),
      );

      normalized.forEach((item, x) => {
        const y = Math.min(
          chartHeight - 1,
          Math.max(
            0,
            Math.floor(((item.value - minValue) / range) * (chartHeight - 1)),
          ),
        );
        rows[chartHeight - 1 - y][x] = '•';
      });

      return (
        <Box flexDirection="column" marginTop={1}>
          {rows.map((row, i) => {
            const yValue =
              minValue + (range * (chartHeight - 1 - i)) / (chartHeight - 1);
            return (
              <Box key={i}>
                <Text color={theme.text.secondary} dimColor>
                  {yValue.toFixed(1).padStart(8)} │
                </Text>
                <Text color={theme.text.accent}>{row.join('  ')}</Text>
              </Box>
            );
          })}
          <Box marginLeft={10}>
            <Text color={theme.text.secondary} dimColor>
              └─{'──'.repeat(normalized.length)}
            </Text>
          </Box>
          <Box marginLeft={10}>
            {normalized.map((item, i) => (
              <Box key={i} width={3}>
                <Text color={theme.text.secondary} dimColor wrap="truncate-end">
                  {item.label}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      );
    } else if (type === 'pie_chart' && Array.isArray(rawData)) {
      const normalized = normalizeData(rawData as unknown[], providedColumns);
      const total = normalized.reduce((sum, item) => sum + item.value, 0);

      const colors = [
        theme.text.accent,
        theme.status.success,
        theme.status.warning,
        theme.status.info,
        '#FF6B6B',
        '#4D96FF',
        '#6BCB77',
        '#FFD93D',
      ];

      return (
        <Box flexDirection="column" marginTop={1}>
          {/* Proportional Bar */}
          <Box height={1} marginBottom={1}>
            {normalized.map((item, i) => {
              const percent = total > 0 ? item.value / total : 0;
              const barWidth = Math.max(
                1,
                Math.floor(percent * availableWidth),
              );
              return (
                <Text key={i} color={colors[i % colors.length]}>
                  {'█'.repeat(barWidth)}
                </Text>
              );
            })}
          </Box>
          {/* Legend */}
          {normalized.map((item, i) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <Box key={i}>
                <Text color={colors[i % colors.length]}>■ </Text>
                <Text bold>{item.label}: </Text>
                <Text>{item.value} </Text>
                <Text color={theme.text.secondary}>
                  ({percent.toFixed(1)}%)
                </Text>
              </Box>
            );
          })}
        </Box>
      );
    } else if (
      type === 'diff' &&
      (typeof rawData === 'object' || typeof rawData === 'string') &&
      rawData
    ) {
      let diffContent: string | undefined;
      let filename = 'Diff';

      if (typeof rawData === 'string') {
        diffContent = rawData;
      } else {
        const diffData = rawData as {
          fileDiff?: string;
          fileName?: string;
          old?: string;
          new?: string;
          oldContent?: string;
          newContent?: string;
          originalContent?: string;
        };

        diffContent = diffData.fileDiff;
        filename = diffData.fileName || 'Diff';

        if (!diffContent) {
          const oldVal =
            diffData.old ?? diffData.oldContent ?? diffData.originalContent;
          const newVal = diffData.new ?? diffData.newContent;
          if (oldVal !== undefined && newVal !== undefined) {
            diffContent = Diff.createPatch(
              filename,
              String(oldVal),
              String(newVal),
            );
          }
        }
      }

      if (diffContent) {
        return (
          <DiffRenderer
            diffContent={diffContent}
            filename={filename}
            availableTerminalHeight={20} // Reasonable default or pass from props
            terminalWidth={availableWidth}
          />
        );
      } else {
        return (
          <Box flexDirection="column">
            <Text color={theme.status.error}>
              Error: Diff data missing &apos;fileDiff&apos; property.
            </Text>
            <Text color={theme.text.secondary} dimColor>
              Expected data to be a string or an object with
              &apos;fileDiff&apos;, or both &apos;old&apos; and &apos;new&apos;
              content.
            </Text>
            <Text color={theme.text.secondary} dimColor>
              Received keys:{' '}
              {typeof rawData === 'object'
                ? Object.keys(rawData).join(', ')
                : 'none (string)'}
            </Text>
          </Box>
        );
      }
    }

    return <Text>Unknown visualization type: {type}</Text>;
  };

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {title && (
        <Text bold color={theme.text.accent} underline>
          {title}
        </Text>
      )}
      {renderContent()}
      {savedFilePath && (
        <Text color={theme.status.success} dimColor>
          {`Saved to: ${savedFilePath}`}
        </Text>
      )}
    </Box>
  );
};
