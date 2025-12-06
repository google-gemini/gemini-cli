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
}

export const AnsiOutputText: React.FC<AnsiOutputProps> = ({
  data,
  availableTerminalHeight,
  width,
}) => {
  const lastLines = data.slice(
    -(availableTerminalHeight && availableTerminalHeight > 0
      ? availableTerminalHeight
      : DEFAULT_HEIGHT),
  );
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
