/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { type Hunk } from '@google/gemini-cli-core';

export interface HunkReviewerProps {
  hunks: Hunk[];
  filename: string;
  terminalWidth: number;
  availableHeight?: number;
  onConfirm: (acceptedIndices: number[]) => void;
  onCancel: () => void;
}

export const HunkReviewer: React.FC<HunkReviewerProps> = ({
  hunks,
  filename,
  terminalWidth,
  availableHeight,
  onConfirm,
  onCancel,
}) => {
  const keyMatchers = useKeyMatchers();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(
    new Set(hunks.map((h) => h.index)),
  );

  const currentHunk = hunks[currentIndex];
  const isAccepted = acceptedIndices.has(currentHunk.index);

  const handleToggle = useCallback(() => {
    setAcceptedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(currentHunk.index)) {
        next.delete(currentHunk.index);
      } else {
        next.add(currentHunk.index);
      }
      return next;
    });
  }, [currentHunk.index]);

  const handleAcceptAll = useCallback(() => {
    setAcceptedIndices(new Set(hunks.map((h) => h.index)));
  }, [hunks]);

  const handleRejectAll = useCallback(() => {
    setAcceptedIndices(new Set());
  }, []);

  useKeypress(
    (key) => {
      if (keyMatchers[Command.MOVE_UP](key)) {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
        return true;
      }
      if (keyMatchers[Command.MOVE_DOWN](key)) {
        setCurrentIndex((prev) => Math.min(hunks.length - 1, prev + 1));
        return true;
      }
      if (key.name === 'space' || key.name === ' ') {
        handleToggle();
        return true;
      }
      if (key.name === 'a') {
        handleAcceptAll();
        return true;
      }
      if (key.name === 'r') {
        handleRejectAll();
        return true;
      }
      if (keyMatchers[Command.ENTER](key)) {
        onConfirm(Array.from(acceptedIndices));
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  const statusText = isAccepted ? ' [ACCEPTED] ' : ' [REJECTED] ';
  const statusColor = isAccepted ? theme.status.success : theme.status.error;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color={theme.text.primary} bold>
            Reviewing Hunks: {filename}
          </Text>
        </Box>
        <Text color={theme.text.secondary}>
          Hunk {currentIndex + 1} of {hunks.length}
        </Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor={statusColor}
        paddingX={1}
        minHeight={10}
      >
        <DiffRenderer
          diffContent={currentHunk.diff}
          filename={filename}
          availableTerminalHeight={availableHeight ? availableHeight - 4 : 20}
          terminalWidth={terminalWidth - 4}
        />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={statusColor} bold>
            {statusText}
          </Text>
          <Text color={theme.text.secondary}>
            (Space to toggle, Enter to apply)
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.secondary}>
            [↑/↓] Navigate | [A] Accept All | [R] Reject All | [Esc] Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
