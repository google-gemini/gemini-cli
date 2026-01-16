/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../semantic-colors.js';
import stringWidth from 'string-width';

interface TableRendererProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const stripMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');

const getDisplayWidth = (text: string): number =>
  stringWidth(stripMarkdown(text));

const wrapText = (text: string, maxWidth: number): string[] => {
  if (maxWidth <= 0) return [text];

  const plainText = stripMarkdown(text);
  const displayWidth = stringWidth(plainText);

  if (displayWidth <= maxWidth) {
    return [plainText];
  }

  const lines: string[] = [];
  const words = plainText.split(/(\s+)/);
  let currentLine = '';
  let currentLineWidth = 0;

  for (const word of words) {
    const wordWidth = stringWidth(word);

    if (wordWidth > maxWidth && currentLine === '') {
      let remaining = word;
      while (stringWidth(remaining) > maxWidth) {
        let splitIndex = 0;
        let width = 0;
        for (let i = 0; i < remaining.length; i++) {
          const charWidth = stringWidth(remaining[i]);
          if (width + charWidth > maxWidth) break;
          width += charWidth;
          splitIndex = i + 1;
        }
        if (splitIndex === 0) splitIndex = 1;
        lines.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex);
      }
      currentLine = remaining;
      currentLineWidth = stringWidth(remaining);
    } else if (currentLineWidth + wordWidth <= maxWidth) {
      currentLine += word;
      currentLineWidth += wordWidth;
    } else {
      if (currentLine.trim()) {
        lines.push(currentLine.trimEnd());
      }
      currentLine = word.trimStart();
      currentLineWidth = stringWidth(currentLine);
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
};

/**
 * Custom table renderer for markdown tables
 * We implement our own instead of using ink-table due to module compatibility issues
 * This version supports multi-line cells when content is too long.
 */
export const TableRenderer: React.FC<TableRendererProps> = ({
  headers,
  rows,
  terminalWidth,
}) => {
  const numColumns = headers.length;
  const plainHeaders = headers.map(stripMarkdown);

  const minColumnWidths = plainHeaders.map((header) =>
    Math.max(stringWidth(header) + 2, 15),
  );

  const idealColumnWidths = plainHeaders.map((header, index) => {
    const headerWidth = stringWidth(header);
    const maxRowWidth = Math.max(
      0,
      ...rows.map((row) => getDisplayWidth(row[index] || '')),
    );
    return Math.max(headerWidth, maxRowWidth) + 2;
  });

  const borderOverhead = 1 + numColumns * 3 + 1;
  const availableContentWidth = Math.max(
    numColumns * 15,
    terminalWidth - borderOverhead,
  );

  const totalIdealWidth = idealColumnWidths.reduce((sum, w) => sum + w, 0);

  const isNarrowForMinLayout = terminalWidth < numColumns * 15 + borderOverhead;

  const showRowSeparators =
    numColumns === 1 ||
    isNarrowForMinLayout ||
    totalIdealWidth > availableContentWidth;

  let adjustedWidths: number[];
  if (totalIdealWidth <= availableContentWidth) {
    adjustedWidths = [...idealColumnWidths];
  } else {
    const scaleFactor = availableContentWidth / totalIdealWidth;
    adjustedWidths = idealColumnWidths.map((ideal, index) => {
      const scaled = Math.floor(ideal * scaleFactor);
      return Math.max(scaled, Math.min(minColumnWidths[index], 12));
    });

    const totalAssigned = adjustedWidths.reduce((sum, w) => sum + w, 0);
    let remaining = availableContentWidth - totalAssigned;
    let colIndex = 0;
    while (remaining > 0 && colIndex < adjustedWidths.length) {
      adjustedWidths[colIndex]++;
      remaining--;
      colIndex = (colIndex + 1) % adjustedWidths.length;
    }
  }

  const wrapCellContent = (content: string, width: number): string[] => {
    const contentWidth = Math.max(0, width - 2);
    return wrapText(content, contentWidth);
  };

  const padToWidth = (content: string, targetWidth: number): string => {
    const currentWidth = stringWidth(content);
    if (currentWidth >= targetWidth) {
      return content;
    }
    return content + ' '.repeat(targetWidth - currentWidth);
  };

  const renderCellLine = (
    content: string,
    width: number,
    isHeader = false,
  ): React.ReactNode => {
    const contentWidth = Math.max(0, width - 2);

    const paddedContent = padToWidth(content, contentWidth);

    return (
      <Text>
        {isHeader ? (
          <Text bold color={theme.text.link}>
            {paddedContent}
          </Text>
        ) : (
          <Text color={theme.text.primary}>{paddedContent}</Text>
        )}
      </Text>
    );
  };

  const renderBorder = (type: 'top' | 'middle' | 'bottom'): React.ReactNode => {
    const chars = {
      top: { left: '┌', middle: '┬', right: '┐', horizontal: '─' },
      middle: { left: '├', middle: '┼', right: '┤', horizontal: '─' },
      bottom: { left: '└', middle: '┴', right: '┘', horizontal: '─' },
    };

    const char = chars[type];
    const borderParts = adjustedWidths.map((w) => char.horizontal.repeat(w));
    const border = char.left + borderParts.join(char.middle) + char.right;

    return <Text color={theme.border.default}>{border}</Text>;
  };

  const renderRow = (cells: string[], isHeader = false): React.ReactNode => {
    const wrappedCells = cells.map((cell, index) => {
      const width = adjustedWidths[index] || 15;
      const plainCell = isHeader ? cell : stripMarkdown(cell || '');
      return wrapCellContent(plainCell, width);
    });

    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));

    const rowLines: React.ReactNode[] = [];
    for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
      const renderedCells = wrappedCells.map((lines, colIndex) => {
        const width = adjustedWidths[colIndex] || 15;
        const lineContent = lines[lineIndex] || '';
        return renderCellLine(lineContent, width, isHeader && lineIndex === 0);
      });

      rowLines.push(
        <Text key={lineIndex} color={theme.text.primary}>
          │{' '}
          {renderedCells.map((cell, index) => (
            <React.Fragment key={index}>
              {cell}
              {index < renderedCells.length - 1 ? ' │ ' : ''}
            </React.Fragment>
          ))}{' '}
          │
        </Text>,
      );
    }

    return <>{rowLines}</>;
  };

  const renderRowSeparator = (): React.ReactNode => {
    const borderParts = adjustedWidths.map((w) => '─'.repeat(w));
    const separator = '├' + borderParts.join('┼') + '┤';
    return <Text color={theme.border.default}>{separator}</Text>;
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {renderBorder('top')}

      {renderRow(plainHeaders, true)}

      {renderBorder('middle')}

      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {renderRow(row)}
          {showRowSeparators && index < rows.length - 1 && renderRowSeparator()}
        </React.Fragment>
      ))}

      {renderBorder('bottom')}
    </Box>
  );
};
