/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import type { InlineThinkingMode } from '../../utils/inlineThinkingMode.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
  mode: Exclude<InlineThinkingMode, 'off'>;
}

const MAX_THOUGHT_SUMMARY_LENGTH = 140;
const SUMMARY_BLINK_INTERVAL_MS = 450;
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

function summarizeThought(thought: ThoughtSummary): string {
  const subject = normalizeEscapedNewlines(thought.subject).trim();
  if (subject) {
    return subject;
  }

  const description = normalizeEscapedNewlines(thought.description).trim();
  if (!description) {
    return '';
  }

  const descriptionGraphemes = splitGraphemes(description);
  if (descriptionGraphemes.length <= MAX_THOUGHT_SUMMARY_LENGTH) {
    return description;
  }

  const trimmed = descriptionGraphemes
    .slice(0, MAX_THOUGHT_SUMMARY_LENGTH - 3)
    .join('')
    .trimEnd();
  return `${trimmed}...`;
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
  mode,
}) => {
  const [isBlinkVisible, setIsBlinkVisible] = useState(true);
  const summaryText = useMemo(() => summarizeThought(thought), [thought]);
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
  const shouldBlinkSummary =
    mode === 'summary' &&
    summaryText.length > 0 &&
    process.env['NODE_ENV'] !== 'test';

  useEffect(() => {
    if (!shouldBlinkSummary) {
      return;
    }

    setIsBlinkVisible(true);
    const interval = setInterval(() => {
      setIsBlinkVisible((current) => !current);
    }, SUMMARY_BLINK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shouldBlinkSummary, summaryText]);

  if (mode === 'summary') {
    if (!summaryText) {
      return null;
    }

    return (
      <Box
        width={terminalWidth}
        marginBottom={1}
        paddingLeft={THINKING_LEFT_PADDING}
        flexDirection="row"
      >
        <Box width={2}>
          <Text color={theme.text.accent}>{isBlinkVisible ? '●' : ' '}</Text>
        </Box>
        <Text color={theme.text.secondary} bold italic wrap="truncate-end">
          {summaryText}
        </Text>
      </Box>
    );
  }

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
