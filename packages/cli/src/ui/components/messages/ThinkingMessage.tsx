/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
}

const THINKING_LEFT_PADDING = 1;

function splitGraphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });
    return Array.from(segmenter.segment(value), (segment) => segment.segment);
  }

  return Array.from(value);
}

function normalizeEscapedNewlines(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function normalizeThoughtLines(thought: ThoughtSummary): string[] {
  const subject = normalizeEscapedNewlines(thought.subject).trim();
  const description = normalizeEscapedNewlines(thought.description).trim();

  if (!subject && !description) {
    return [];
  }

  if (!subject) {
    return description
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const bodyLines = description
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [subject, ...bodyLines];
}

function graphemeLength(value: string): number {
  return splitGraphemes(value).length;
}

function chunkToWidth(value: string, width: number): string[] {
  if (width <= 0) {
    return [''];
  }

  const graphemes = splitGraphemes(value);
  if (graphemes.length === 0) {
    return [''];
  }

  const chunks: string[] = [];
  for (let index = 0; index < graphemes.length; index += width) {
    chunks.push(graphemes.slice(index, index + width).join(''));
  }
  return chunks;
}

function wrapLineToWidth(line: string, width: number): string[] {
  if (width <= 0) {
    return [''];
  }

  const normalized = line.trim();
  if (!normalized) {
    return [''];
  }

  const words = normalized.split(/\s+/);
  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    const wordChunks = chunkToWidth(word, width);

    for (const wordChunk of wordChunks) {
      if (!current) {
        current = wordChunk;
        continue;
      }

      if (graphemeLength(current) + 1 + graphemeLength(wordChunk) <= width) {
        current = `${current} ${wordChunk}`;
      } else {
        wrapped.push(current);
        current = wordChunk;
      }
    }
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
}) => {
  const fullLines = useMemo(() => normalizeThoughtLines(thought), [thought]);
  const fullSummaryDisplayLines = useMemo(() => {
    const contentWidth = Math.max(terminalWidth - THINKING_LEFT_PADDING - 2, 1);
    return fullLines.length > 0
      ? wrapLineToWidth(fullLines[0], contentWidth)
      : [];
  }, [fullLines, terminalWidth]);
  const fullBodyDisplayLines = useMemo(() => {
    const contentWidth = Math.max(terminalWidth - THINKING_LEFT_PADDING - 2, 1);
    return fullLines
      .slice(1)
      .flatMap((line) => wrapLineToWidth(line, contentWidth));
  }, [fullLines, terminalWidth]);

  if (
    fullSummaryDisplayLines.length === 0 &&
    fullBodyDisplayLines.length === 0
  ) {
    return null;
  }

  return (
    <Box
      width={terminalWidth}
      marginBottom={1}
      paddingLeft={THINKING_LEFT_PADDING}
      flexDirection="column"
    >
      {fullSummaryDisplayLines.map((line, index) => (
        <Box key={`summary-line-row-${index}`} flexDirection="row">
          <Box width={2}>
            <Text> </Text>
          </Box>
          <Text color={theme.text.primary} bold italic wrap="truncate-end">
            {line}
          </Text>
        </Box>
      ))}
      {fullBodyDisplayLines.map((line, index) => (
        <Box key={`body-line-row-${index}`} flexDirection="row">
          <Box width={2}>
            <Text color={theme.border.default}>│ </Text>
          </Box>
          <Text color={theme.text.secondary} italic wrap="truncate-end">
            {line}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
