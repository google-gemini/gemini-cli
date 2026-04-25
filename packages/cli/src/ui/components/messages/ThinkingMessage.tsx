/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useEffect, useId } from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { normalizeEscapedNewlines } from '../../utils/textUtils.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

interface ThinkingMessageProps {
  thought: ThoughtSummary;
  terminalWidth: number;
  availableTerminalHeight?: number;
}

function normalizeThoughtLines(thought: ThoughtSummary): string[] {
  const subject = normalizeEscapedNewlines(thought.subject).trim();
  const description = normalizeEscapedNewlines(thought.description).trim();

  const isNoise = (text: string) => {
    const trimmed = text.trim();
    return !trimmed || /^\.+$/.test(trimmed);
  };

  const lines: string[] = [];

  if (subject && !isNoise(subject)) {
    lines.push(subject);
  }

  if (description) {
    const descriptionLines = description
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !isNoise(line));
    lines.push(...descriptionLines);
  }

  return lines;
}

/**
 * Renders a model's thought as a distinct bubble.
 * Leverages Ink layout for wrapping and borders.
 */
export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
  availableTerminalHeight,
}) => {
  const fullLines = useMemo(() => normalizeThoughtLines(thought), [thought]);
  const isExpanded = availableTerminalHeight === undefined;
  const overflowActions = useOverflowActions();
  const uniqueId = useId();
  const overflowId = `thinking-${uniqueId}`;

  useEffect(() => {
    if (overflowActions) {
      overflowActions.addOverflowingId(overflowId);
    }
    return () => {
      if (overflowActions) {
        overflowActions.removeOverflowingId(overflowId);
      }
    };
  }, [overflowActions, overflowId]);

  if (fullLines.length === 0) {
    return null;
  }

  const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

  return (
    <Box width={terminalWidth} flexDirection="column">
      <Box
        flexDirection="column"
        width={terminalWidth}
        borderLeft={true}
        borderRight={true}
        borderTop={true}
        borderBottom={true}
        borderColor={theme.text.secondary}
        borderStyle="round"
        paddingLeft={1}
      >
        <Box flexDirection="row" gap={1}>
          <Text color={theme.text.secondary}>≡</Text>
          <Text bold color={theme.text.primary} italic>
            Thinking...
          </Text>
          <Text color={theme.text.secondary}>{toggleText}</Text>
        </Box>

        {isExpanded && (
          <Box flexDirection="column" marginTop={1}>
            {fullLines.length > 0 && (
              <Text color={theme.text.primary} bold italic>
                {fullLines[0]}
              </Text>
            )}
            {fullLines.slice(1).map((line, index) => (
              <Text
                key={`body-line-${index}`}
                color={theme.text.secondary}
                italic
              >
                {line}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
