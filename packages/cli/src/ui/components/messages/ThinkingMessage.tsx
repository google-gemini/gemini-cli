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
}

/**
 * Renders a model's thought as a distinct bubble.
 * Leverages Ink layout for wrapping and borders.
 */
export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
}) => {
  const { summary, body } = useMemo(() => {
    const subject = normalizeEscapedNewlines(thought.subject).trim();
    const description = normalizeEscapedNewlines(thought.description).trim();

    if (!subject && !description) {
      return { summary: '', body: '' };
    }

    if (!subject) {
      const lines = description
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return {
        summary: lines[0] || '',
        body: lines.slice(1).join('\n'),
      };
    }

    return {
      summary: subject,
      body: description,
    };
  }, [thought]);

  if (!summary && !body) {
    return null;
  }

  return (
    <Box width="100%" marginBottom={1} paddingLeft={1} flexDirection="column">
      {summary && (
        <Box paddingLeft={2}>
          <Text color={theme.text.primary} bold italic>
            {summary}
          </Text>
        </Box>
      )}
      {body && (
        <Box
          borderStyle="single"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor={theme.border.default}
          paddingLeft={1}
        >
          <Text color={theme.text.secondary} italic>
            {body}
          </Text>
        </Box>
      )}
    </Box>
  );
};
