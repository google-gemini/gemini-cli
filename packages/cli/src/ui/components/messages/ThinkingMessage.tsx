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
import { normalizeEscapedNewlines } from '../../utils/textUtils.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
  isFirstThinking?: boolean;
  isLastThinking?: boolean;
}

const THINKING_LEFT_PADDING = 1;
const VERTICAL_LINE_WIDTH = 1;

function splitGraphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });
    return Array.from(segmenter.segment(value), (segment) => segment.segment);
  }

  return Array.from(value);
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

/**
 * Renders a model's thought as a distinct bubble.
 * Leverages Ink layout for wrapping and borders.
 */
export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
  isFirstThinking,
  isLastThinking,
}) => {
  const fullLines = useMemo(() => normalizeThoughtLines(thought), [thought]);
  const contentWidth = Math.max(
    terminalWidth - THINKING_LEFT_PADDING - VERTICAL_LINE_WIDTH - 2,
    1,
  );

  const fullSummaryDisplayLines = useMemo(
    () =>
      fullLines.length > 0 ? wrapLineToWidth(fullLines[0], contentWidth) : [],
    [fullLines, contentWidth],
  );

  const fullBodyDisplayLines = useMemo(
    () =>
      fullLines.slice(1).flatMap((line) => wrapLineToWidth(line, contentWidth)),
    [fullLines, contentWidth],
  );

  if (fullLines.length === 0) {
    return null;
  }

  const verticalLine = (
    <Box width={VERTICAL_LINE_WIDTH}>
      <Text color={theme.text.secondary}>│</Text>
    </Box>
  );

  return (
    <Box
      width={terminalWidth}
      flexDirection="column"
      marginBottom={isLastThinking ? 1 : 0}
    >
      {isFirstThinking && (
        <>
          <Text color={theme.text.primary} italic>
            {' '}
            Thinking...{' '}
          </Text>
          <Box flexDirection="row">
            <Box width={THINKING_LEFT_PADDING} />
            {verticalLine}
            <Text> </Text>
          </Box>
        </>
      )}

      {!isFirstThinking && (
        <Box flexDirection="row">
          <Box width={THINKING_LEFT_PADDING} />
          {verticalLine}
          <Text> </Text>
        </Box>
      )}

      {fullSummaryDisplayLines.map((line, index) => (
        <Box key={`summary-line-row-${index}`} flexDirection="row">
          <Box width={THINKING_LEFT_PADDING} />
          {verticalLine}
          <Box marginLeft={1}>
            <Text color={theme.text.primary} bold italic wrap="truncate-end">
              {line}
            </Text>
          </Box>
        </Box>
      ))}
      {fullBodyDisplayLines.map((line, index) => (
        <Box key={`body-line-row-${index}`} flexDirection="row">
          <Box width={THINKING_LEFT_PADDING} />
          {verticalLine}
          <Box marginLeft={1}>
            <Text color={theme.text.secondary} italic wrap="truncate-end">
              {line}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
