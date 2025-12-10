/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { AnsiLine, AnsiOutput, AnsiToken } from '@google/gemini-cli-core';

interface AnsiOutputProps {
  data: AnsiOutput;
  availableTerminalHeight?: number;
  width: number;
}

export const AnsiOutputText: React.FC<AnsiOutputProps> = ({
  data,
  availableTerminalHeight,
  width,
}) => {
  // When availableTerminalHeight is undefined, show all lines
  const lastLines =
    availableTerminalHeight !== undefined && availableTerminalHeight > 0
      ? data.slice(-availableTerminalHeight)
      : data;
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {lastLines.map((line: AnsiLine, lineIndex: number) => (
        <Text key={lineIndex} wrap="truncate">
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
      ))}
    </Box>
  );
};
