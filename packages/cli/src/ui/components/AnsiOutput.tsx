/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { AnsiLine, AnsiOutput, AnsiToken } from '@google/gemini-cli-core';

const DEFAULT_HEIGHT = 24;

interface AnsiOutputProps {
  data: AnsiOutput;
  availableTerminalHeight?: number;
  width: number;
  maxLines?: number;
  disableTruncation?: boolean;
}

export const AnsiOutputText: React.FC<AnsiOutputProps> = ({
  data,
  availableTerminalHeight,
  width,
  maxLines,
  disableTruncation,
}) => {
  const availableHeightLimit =
    availableTerminalHeight && availableTerminalHeight > 0
      ? availableTerminalHeight
      : undefined;

  const numLinesRetained =
    availableHeightLimit !== undefined && maxLines !== undefined
      ? Math.min(availableHeightLimit, maxLines)
      : (availableHeightLimit ?? maxLines ?? DEFAULT_HEIGHT);

  const lastLines = disableTruncation ? data : data.slice(-numLinesRetained);
  return (
    <Box flexDirection="column" width={width} flexShrink={0} overflow="hidden">
      {lastLines.map((line: AnsiLine, lineIndex: number) => (
        <Box key={lineIndex} height={1} overflow="hidden">
          <AnsiLineText line={line} />
        </Box>
      ))}
    </Box>
  );
};

export const AnsiLineText: React.FC<{ line: AnsiLine }> = ({ line }) => (
  <Text>
    {line.length > 0
      ? line.map((token: AnsiToken, tokenIndex: number) => (
          <Text
            key={tokenIndex}
            color={token.fg}
            backgroundColor={token.bg}
            inverse={token.inverse}
            dimColor={token.dim}
            bold={token.bold}
            italic={token.italic}
            underline={token.underline}
          >
            {token.text}
          </Text>
        ))
      : null}
  </Text>
);
